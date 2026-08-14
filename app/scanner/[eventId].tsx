/**
 * Scanner screen — app/scanner/[eventId].tsx
 *
 * Offline-first PWA gate scanner. Features:
 * - QR camera decode (jsQR) + HID barcode input
 * - iOS-safe AudioContext (initialised inside "Start Scanning" tap handler)
 * - Two-state attendee photo: silhouette (no photo) vs. spinner (has_photo, not yet cached)
 * - Flashlight / torch toggle (via CameraKit if available)
 * - Manual override for event_manager+
 * - Offline-first: decisions from Dexie; scans queued and uploaded when online
 * - NTP drift warning banner
 * - Pre-flight sync with progress indicator
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useScannerWake } from '@/hooks/useScannerWake';
import {
  eventDb,
  type RosterEntry,
  type ZoneTokenEntry,
  type ScanQueueEntry,
} from '@/lib/offline/eventDb';
import {
  runPreflight,
  getPhotoState,
  flushScanQueue,
} from '@/lib/offline/preflight';
import {
  evaluateGateDecision,
  type EventConfig,
} from '@/lib/events/tokenEvaluation';
import { MaterialIcons } from '@expo/vector-icons';

// ── Types ────────────────────────────────────────────────────────────────────

type ScannerPhase = 'preflight' | 'start_prompt' | 'scanning' | 'result';

interface ScanResult {
  ticket: RosterEntry | null;
  granted: boolean;
  denyReason: string | null;
  photoState: Awaited<ReturnType<typeof getPhotoState>>;
  attendeeName?: string;
  accessLevelName?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const RESULT_DISPLAY_MS = 3000;
const DRIFT_WARNING_MS = 30_000;

// ── Component ────────────────────────────────────────────────────────────────

export default function ScannerScreen() {
  const { eventId: eventIdStr, zoneId: zoneIdStr } = useLocalSearchParams<{
    eventId: string;
    zoneId: string;
  }>();
  const eventId = parseInt(eventIdStr, 10);
  const zoneId = parseInt(zoneIdStr ?? '0', 10);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();
  const { isIdle, wake } = useScannerWake({ enabled: phase === 'scanning' });

  const [phase, setPhase] = useState<ScannerPhase>('preflight');
  const [preflightProgress, setPreflightProgress] = useState(0);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [clockDriftMs, setClockDriftMs] = useState(0);
  const [rosterCount, setRosterCount] = useState(0);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);

  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // AudioContext refs — iOS requires initialisation inside a user gesture
  const audioCtxRef = useRef<AudioContext | null>(null);

  // HID input buffer — collects rapid keystroke bursts from USB scanners
  const hidBufferRef = useRef('');
  const hidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Result auto-clear timer
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Background flush interval
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth guard ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated]);

  // ── Pre-flight ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!eventId || isNaN(eventId)) return;

    (async () => {
      try {
        const result = await runPreflight(eventId, (pct) => {
          setPreflightProgress(pct);
        });
        setRosterCount(result.rosterCount);
        setClockDriftMs(result.clockDriftMs);

        // Load event config into state for use by evaluator
        const meta = await eventDb.meta.get(`roster_sync_${eventId}`);
        // Load event config from first preflight page (stored in meta during preflight)
        const configMeta = await eventDb.meta.get(`event_config_${eventId}`);
        if (configMeta?.value) {
          setEventConfig(configMeta.value as EventConfig);
        }

        setPhase('start_prompt');
      } catch (err: any) {
        setPreflightError(err.message || 'Pre-flight sync failed');
      }
    })();

    // Background scan flush
    flushIntervalRef.current = setInterval(() => {
      flushScanQueue(eventId).catch(() => {});
    }, 15_000);

    return () => {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    };
  }, [eventId]);

  // ── AudioContext init (iOS-safe) ─────────────────────────────────────────

  function initAudio() {
    // Must be called synchronously inside a user-gesture handler
    try {
      if (!audioCtxRef.current) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
    } catch (_) {}
  }

  function playTone(frequency: number, durationMs: number, type: OscillatorType = 'sine') {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.4;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (_) {}
  }

  function playGranted() {
    playTone(880, 150);
    setTimeout(() => playTone(1100, 100), 180);
    Vibration.vibrate(100);
  }

  function playDenied() {
    playTone(220, 400, 'sawtooth');
    Vibration.vibrate([0, 200, 100, 200]);
  }

  // ── Gate decision ────────────────────────────────────────────────────────

  const processCode = useCallback(
    async (code: string) => {
      if (!code || phase !== 'scanning') return;
      setScanning(true);

      try {
        const ticket = await eventDb.roster.get(code);

        if (!ticket) {
          const result: ScanResult = {
            ticket: null,
            granted: false,
            denyReason: 'unknown_ticket',
            photoState: { status: 'no_photo' },
          };
          await recordScan(null, code, false, 'unknown_ticket', 'strict');
          showResult(result);
          playDenied();
          return;
        }

        const zoneToken = ticket.access_level_id
          ? await eventDb.tokens
              .get([eventId, ticket.access_level_id, zoneId])
          : null;

        const stateRow = await eventDb.ticketState.get([ticket.ticket_id, zoneId]);

        const config: EventConfig = eventConfig ?? {
          timezone: 'UTC',
          daily_reset_time: '04:00:00',
        };

        const decision = evaluateGateDecision({
          ticket: {
            id: ticket.ticket_id,
            public_code: ticket.public_code,
            revoked_at: ticket.revoked_at,
          },
          zoneToken: zoneToken
            ? {
                entry_limit: zoneToken.entry_limit,
                exit_limit: zoneToken.exit_limit,
                window_start_time: zoneToken.window_start_time,
                window_end_time: zoneToken.window_end_time,
                reset_policy: zoneToken.reset_policy,
              }
            : null,
          zoneState: stateRow ?? null,
          direction: 'entry',
          event: config,
        });

        // Update local state immediately (optimistic)
        if (decision.granted && decision.updatedState) {
          await eventDb.ticketState.put({
            ticket_id: ticket.ticket_id,
            zone_id: zoneId,
            is_inside: true,
            ...decision.updatedState,
          });
        }

        const photoState = await getPhotoState(ticket.attendee_id, ticket.has_photo);
        const validationMode = 'strict';

        await recordScan(
          ticket,
          code,
          decision.granted,
          decision.denyReason,
          validationMode,
        );

        const result: ScanResult = {
          ticket,
          granted: decision.granted,
          denyReason: decision.denyReason,
          photoState,
        };

        showResult(result);
        decision.granted ? playGranted() : playDenied();
      } catch (err: any) {
        console.error('Scan error:', err);
        Alert.alert('Scan Error', err.message);
      } finally {
        setScanning(false);
      }
    },
    [phase, eventId, zoneId, eventConfig],
  );

  // ── Scan recording ───────────────────────────────────────────────────────

  async function recordScan(
    ticket: RosterEntry | null,
    publicCode: string,
    granted: boolean,
    denyReason: string | null,
    validationMode: ScanQueueEntry['validation_mode_used'],
  ) {
    const clientUuid = crypto.randomUUID();
    const entry: ScanQueueEntry = {
      client_scan_uuid: clientUuid,
      event_id: eventId,
      public_code: publicCode,
      zone_id: zoneId,
      direction: 'entry',
      result: granted ? 'granted' : 'denied',
      deny_reason: denyReason,
      validation_mode_used: validationMode,
      was_offline: !navigator.onLine,
      scanned_at: new Date().toISOString(),
      uploaded: false,
    };
    await eventDb.scanQueue.add(entry);

    // Try immediate flush if online
    if (navigator.onLine) {
      flushScanQueue(eventId).catch(() => {});
    }
  }

  // ── Result display ───────────────────────────────────────────────────────

  function showResult(result: ScanResult) {
    setScanResult(result);
    setPhase('result');
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      setScanResult(null);
      setPhase('scanning');
    }, RESULT_DISPLAY_MS);
  }

  // ── HID scanner input ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== 'scanning') return;
      if (e.key === 'Enter') {
        const code = hidBufferRef.current.trim();
        hidBufferRef.current = '';
        if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
        if (code) processCode(code);
        return;
      }
      hidBufferRef.current += e.key;
      if (hidTimerRef.current) clearTimeout(hidTimerRef.current);
      hidTimerRef.current = setTimeout(() => {
        hidBufferRef.current = '';
      }, 200);
    },
    [phase, processCode],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown]);

  // ── Render helpers ───────────────────────────────────────────────────────

  function handleStartScanning() {
    initAudio(); // iOS: must be inside user gesture
    setPhase('scanning');
  }

  function handleManualSubmit() {
    const code = manualCode.trim();
    setManualCode('');
    setShowManualEntry(false);
    if (code) processCode(code);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (phase === 'preflight') {
    return (
      <View style={[styles.container, styles.centered]}>
        <MaterialIcons name="sync" size={48} color="#fff" style={{ marginBottom: 24 }} />
        <Text style={styles.preflightTitle}>Syncing Event Roster</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${preflightProgress}%` }]} />
        </View>
        <Text style={styles.preflightSub}>{preflightProgress}% complete</Text>
        {preflightError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{preflightError}</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.errorBtn}>
              <Text style={styles.errorBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (phase === 'start_prompt') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <MaterialIcons name="qr-code-scanner" size={72} color="#4CAF50" style={{ marginBottom: 32 }} />
        <Text style={styles.preflightTitle}>Ready to Scan</Text>
        <Text style={styles.preflightSub}>{rosterCount} attendees synced</Text>
        {Math.abs(clockDriftMs) > DRIFT_WARNING_MS && (
          <View style={styles.warnBox}>
            <MaterialIcons name="warning" size={20} color="#fff" />
            <Text style={styles.warnText}>
              Clock drift {Math.round(clockDriftMs / 1000)}s — verify device time before scanning
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.startBtn} onPress={handleStartScanning}>
          <Text style={styles.startBtnText}>Start Scanning</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Scanner</Text>
        <TouchableOpacity onPress={() => setTorchOn(t => !t)}>
          <MaterialIcons
            name={torchOn ? 'flashlight-on' : 'flashlight-off'}
            size={24}
            color={torchOn ? '#FFD700' : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {/* Idle overlay — tap to wake */}
      {isIdle && (
        <TouchableOpacity
          style={styles.idleOverlay}
          onPress={wake}
          activeOpacity={1}
        >
          <MaterialIcons name="touch-app" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.idleText}>Tap to resume scanning</Text>
        </TouchableOpacity>
      )}

      {/* Scan result overlay */}
      {scanResult && (
        <View
          style={[
            styles.resultOverlay,
            { backgroundColor: scanResult.granted ? '#1B5E20' : '#B71C1C' },
          ]}
        >
          <View style={styles.resultPhotoContainer}>
            {scanResult.photoState.status === 'cached' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={(scanResult.photoState as any).url}
                alt="Attendee"
                style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover' }}
              />
            ) : scanResult.photoState.status === 'has_photo' ? (
              <View style={styles.photoPlaceholderSpinner}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.photoPlaceholderText}>Loading photo…</Text>
              </View>
            ) : (
              <View style={styles.photoPlaceholderSilhouette}>
                <MaterialIcons name="person" size={60} color="#aaa" />
                <Text style={styles.photoPlaceholderText}>No photo on file</Text>
              </View>
            )}
          </View>

          <View style={styles.resultInfo}>
            <MaterialIcons
              name={scanResult.granted ? 'check-circle' : 'cancel'}
              size={48}
              color="#fff"
              style={{ marginBottom: 8 }}
            />
            <Text style={styles.resultStatus}>
              {scanResult.granted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
            </Text>
            {!scanResult.granted && scanResult.denyReason && (
              <Text style={styles.resultReason}>
                {formatDenyReason(scanResult.denyReason)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Scanning active area */}
      {phase === 'scanning' && !scanResult && (
        <View style={styles.scanArea}>
          <MaterialIcons name="qr-code-scanner" size={120} color="rgba(255,255,255,0.3)" />
          <Text style={styles.scanHint}>Point camera at QR code</Text>
          {scanning && <ActivityIndicator size="small" color="#fff" style={{ marginTop: 8 }} />}
        </View>
      )}

      {/* Manual entry */}
      {showManualEntry && (
        <View style={styles.manualOverlay}>
          <Text style={styles.manualTitle}>Manual Entry</Text>
          <TextInput
            style={styles.manualInput}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="Paste or type ticket code"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoFocus
            onSubmitEditing={handleManualSubmit}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={styles.manualBtn} onPress={handleManualSubmit}>
              <Text style={styles.manualBtnText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.manualBtn, { backgroundColor: '#555' }]}
              onPress={() => { setShowManualEntry(false); setManualCode(''); }}
            >
              <Text style={styles.manualBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowManualEntry(v => !v)}
        >
          <MaterialIcons name="keyboard" size={28} color="#fff" />
          <Text style={styles.bottomBtnLabel}>Manual</Text>
        </TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: '#333' }]}
            onPress={() => {
              Alert.prompt(
                'Force Entry',
                'Enter ticket code for manual override:',
                async (code) => {
                  if (code) {
                    await processCode(code);
                  }
                }
              );
            }}
          >
            <MaterialIcons name="admin-panel-settings" size={28} color="#FFD700" />
            <Text style={[styles.bottomBtnLabel, { color: '#FFD700' }]}>Override</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function formatDenyReason(reason: string): string {
  const map: Record<string, string> = {
    revoked: 'Ticket has been revoked',
    no_access_to_zone: 'No access to this zone',
    outside_time_window: 'Outside entry window',
    entry_limit_reached: 'Entry limit reached',
    exit_limit_reached: 'Exit limit reached',
    unknown_ticket: 'Ticket not found in roster',
    invalid_direction: 'Invalid direction',
  };
  return map[reason] || reason;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  preflightTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 16 },
  preflightSub: { fontSize: 14, color: '#aaa', marginTop: 8 },
  progressBar: { width: '80%', height: 8, borderRadius: 4, backgroundColor: '#333', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },
  errorBox: { marginTop: 24, padding: 16, backgroundColor: '#B71C1C', borderRadius: 8, alignItems: 'center' },
  errorText: { color: '#fff', marginBottom: 12 },
  errorBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 6 },
  errorBtnText: { color: '#B71C1C', fontWeight: '700' },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E65100', padding: 12, borderRadius: 8, marginBottom: 20, maxWidth: '90%' },
  warnText: { color: '#fff', fontSize: 13, flex: 1 },
  startBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  startBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#1a1a1a' },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  scanArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanHint: { color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 15 },
  resultOverlay: {
    position: 'absolute', top: 60, left: 0, right: 0, bottom: 80,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 24, zIndex: 10,
  },
  resultPhotoContainer: { width: 100 },
  photoPlaceholderSpinner: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderSilhouette: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { color: '#aaa', fontSize: 10, marginTop: 4, textAlign: 'center' },
  resultInfo: { flex: 1, alignItems: 'center' },
  resultStatus: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  resultReason: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1a1a1a', paddingTop: 12 },
  bottomBtn: { alignItems: 'center', padding: 8 },
  bottomBtnLabel: { color: '#fff', fontSize: 12, marginTop: 4 },
  manualOverlay: { position: 'absolute', top: 80, left: 16, right: 16, backgroundColor: '#222', borderRadius: 12, padding: 20, zIndex: 20 },
  manualTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  manualInput: { backgroundColor: '#333', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14 },
  idleOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', zIndex: 30,
  },
  idleText: { color: 'rgba(255,255,255,0.5)', fontSize: 18, marginTop: 16 },
  manualBtn: { flex: 1, backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, alignItems: 'center' },
  manualBtnText: { color: '#fff', fontWeight: '700' },
});
