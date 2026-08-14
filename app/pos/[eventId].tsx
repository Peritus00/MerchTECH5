/**
 * POS (Point of Sale) entitlement redemption screen
 * Route: app/pos/[eventId].tsx
 *
 * Scan or enter a ticket code, see token balances, redeem drink/food tokens.
 * Idempotent: each scan generates a fresh UUID idempotency key.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Vibration, Animated, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api } from '@/services/api';

type TokenType = 'drink' | 'food';

interface POSTicket {
  public_code: string;
  attendee_name: string | null;
  access_level_name: string;
  drink_tokens_remaining: number;
  food_tokens_remaining: number;
  event_id: number;
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function POSScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [ticket, setTicket] = useState<POSTicket | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const lastScannedRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // iOS AudioContext init on first user interaction
  const ensureAudio = useCallback(() => {
    if (Platform.OS === 'web' && !audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
  }, []);

  const playBeep = useCallback((success: boolean) => {
    if (Platform.OS !== 'web' || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 1200 : 400;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  }, []);

  const showFeedback = useCallback((type: 'success' | 'error') => {
    setFeedback(type);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setFeedback(null));
    playBeep(type === 'success');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        type === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
  }, [feedbackAnim, playBeep]);

  const loadTicket = useCallback(async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    if (lastScannedRef.current === trimmed) return;
    lastScannedRef.current = trimmed;

    setLoading(true);
    setLastError(null);
    try {
      const res = await api.get(`/pos/status/${trimmed}`);
      setTicket(res.data);
      setScanning(false);
      showFeedback('success');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Ticket not found';
      setLastError(msg);
      showFeedback('error');
      setTimeout(() => { lastScannedRef.current = ''; }, 2000);
    } finally {
      setLoading(false);
    }
  }, [showFeedback]);

  const handleRedeem = async (tokenType: TokenType, qty = 1) => {
    if (!ticket) return;
    ensureAudio();
    setLoading(true);
    try {
      const idempotencyKey = uuidv4();
      const res = await api.post('/pos/redeem-entitlement', {
        public_code: ticket.public_code,
        token_type: tokenType,
        quantity: qty,
        idempotency_key: idempotencyKey,
      });

      setTicket(prev => prev ? {
        ...prev,
        drink_tokens_remaining: tokenType === 'drink' ? res.data.balance_after : prev.drink_tokens_remaining,
        food_tokens_remaining: tokenType === 'food' ? res.data.balance_after : prev.food_tokens_remaining,
      } : null);
      showFeedback('success');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Redemption failed';
      Alert.alert('Error', msg);
      showFeedback('error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTicket(null);
    setScanning(true);
    setManualCode('');
    setLastError(null);
    lastScannedRef.current = '';
  };

  const flashBg = feedbackAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', feedback === 'success' ? 'rgba(76,175,80,0.25)' : 'rgba(183,28,28,0.25)'],
  });

  if (!cameraPermission?.granted && scanning) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permText}>Camera permission required for scanning</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#0a0a0a' }]}>
      {/* Feedback flash */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: flashBg, pointerEvents: 'none' }]} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>POS — Token Redemption</Text>
        <View style={{ width: 24 }} />
      </View>

      {scanning ? (
        /* ─── Scanning State ─── */
        <View style={{ flex: 1 }}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => { ensureAudio(); loadTicket(data); }}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanReticle} />
          </View>
          {lastError && <Text style={styles.scanError}>{lastError}</Text>}
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              placeholder="Enter ticket code manually"
              placeholderTextColor="#555"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.manualBtn} onPress={() => loadTicket(manualCode)}>
              <MaterialIcons name="search" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ─── Ticket Loaded State ─── */
        <View style={styles.ticketView}>
          {ticket && (
            <>
              <View style={styles.ticketCard}>
                <Text style={styles.attendeeName}>{ticket.attendee_name || 'Guest'}</Text>
                <Text style={styles.accessLevel}>{ticket.access_level_name}</Text>
                <Text style={styles.codeText}>{ticket.public_code}</Text>
              </View>

              <View style={styles.tokensGrid}>
                {/* Drink tokens */}
                <View style={styles.tokenCard}>
                  <Text style={styles.tokenEmoji}>🍺</Text>
                  <Text style={styles.tokenBalance}>{ticket.drink_tokens_remaining}</Text>
                  <Text style={styles.tokenLabel}>Drink Tokens</Text>
                  <TouchableOpacity
                    style={[styles.redeemBtn, ticket.drink_tokens_remaining === 0 && styles.redeemBtnDisabled]}
                    onPress={() => handleRedeem('drink')}
                    disabled={ticket.drink_tokens_remaining === 0 || loading}
                  >
                    <Text style={styles.redeemBtnText}>Redeem 1</Text>
                  </TouchableOpacity>
                </View>

                {/* Food tokens */}
                <View style={styles.tokenCard}>
                  <Text style={styles.tokenEmoji}>🍔</Text>
                  <Text style={styles.tokenBalance}>{ticket.food_tokens_remaining}</Text>
                  <Text style={styles.tokenLabel}>Food Tokens</Text>
                  <TouchableOpacity
                    style={[styles.redeemBtn, ticket.food_tokens_remaining === 0 && styles.redeemBtnDisabled]}
                    onPress={() => handleRedeem('food')}
                    disabled={ticket.food_tokens_remaining === 0 || loading}
                  >
                    <Text style={styles.redeemBtnText}>Redeem 1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.nextScanBtn} onPress={handleReset}>
                <MaterialIcons name="qr-code-scanner" size={22} color="#fff" />
                <Text style={styles.nextScanText}>Next Scan</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' },
  scanReticle: { width: 220, height: 220, borderWidth: 2, borderColor: 'rgba(76,175,80,0.8)', borderRadius: 12 },
  scanError: { position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center', color: '#ff4444', backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, fontSize: 14 },
  manualRow: { flexDirection: 'row', padding: 12, gap: 8 },
  manualInput: { flex: 1, backgroundColor: '#1e1e1e', color: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, fontSize: 14, fontFamily: 'monospace' },
  manualBtn: { backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 8 },
  ticketView: { flex: 1, padding: 20 },
  ticketCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 24 },
  attendeeName: { color: '#fff', fontWeight: '800', fontSize: 22 },
  accessLevel: { color: '#4CAF50', fontSize: 14, marginTop: 4 },
  codeText: { color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 8 },
  tokensGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  tokenCard: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 12, padding: 20, alignItems: 'center', gap: 8 },
  tokenEmoji: { fontSize: 36 },
  tokenBalance: { color: '#fff', fontWeight: '900', fontSize: 42 },
  tokenLabel: { color: '#888', fontSize: 12 },
  redeemBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 4 },
  redeemBtnDisabled: { backgroundColor: '#2a2a2a' },
  redeemBtnText: { color: '#fff', fontWeight: '700' },
  nextScanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1565C0', paddingVertical: 16, borderRadius: 12 },
  nextScanText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  permText: { color: '#aaa', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: '#1565C0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});
