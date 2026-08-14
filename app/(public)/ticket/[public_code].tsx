/**
 * Digital Ticket screen — app/(public)/ticket/[public_code].tsx
 *
 * Public-facing ticket display. Features:
 * - qr_visible_from gate: QR is hidden until the event unlocks it
 * - Animated anti-screenshot overlay: rotating tint and timestamp watermark
 *   that make screenshots useless at the gate
 * - Shows attendee name, event, access level, token balances
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { api } from '@/services/api';

const { width } = Dimensions.get('window');

interface TicketData {
  public_code: string;
  attendee_name: string | null;
  access_level_name: string;
  access_level_color: string;
  event_name: string;
  event_starts_at: string;
  event_ends_at: string;
  drink_tokens_remaining: number;
  food_tokens_remaining: number;
  qr_visible_from: string | null;
  qr_locked: boolean;
}

const OVERLAY_INTERVAL_MS = 2000; // rotate overlay every 2 seconds
const TINTS = ['rgba(0,100,255,0.08)', 'rgba(255,0,100,0.08)', 'rgba(0,200,0,0.07)', 'rgba(200,0,200,0.08)'];

export default function DigitalTicketScreen() {
  const { public_code } = useLocalSearchParams<{ public_code: string }>();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Anti-screenshot animation values
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;
  const tintIndex = useRef(0);
  const [overlayTint, setOverlayTint] = useState(TINTS[0]);
  const [overlayTimestamp, setOverlayTimestamp] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/tickets/public/${public_code}`);
        setTicket(res.data);
      } catch (err: any) {
        Alert.alert('Invalid Ticket', err.response?.data?.error || 'Ticket not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [public_code]);

  // Clock for timestamp watermark and qr_visible_from gate
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Anti-screenshot overlay animation
  useEffect(() => {
    const animateCycle = () => {
      tintIndex.current = (tintIndex.current + 1) % TINTS.length;
      setOverlayTint(TINTS[tintIndex.current]);
      setOverlayTimestamp(new Date().toLocaleTimeString());

      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.5, duration: 300, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.15, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        rotateAnim.setValue(0);
      });
    };

    const interval = setInterval(animateCycle, OVERLAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const rotateInterp = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.container, styles.centered]}>
        <MaterialIcons name="error-outline" size={64} color="#B71C1C" />
        <Text style={styles.errorText}>Ticket not found</Text>
      </View>
    );
  }

  const qrLocked = ticket.qr_locked ||
    (ticket.qr_visible_from !== null && new Date(ticket.qr_visible_from) > now);

  const timeUntilVisible = ticket.qr_visible_from
    ? Math.max(0, new Date(ticket.qr_visible_from).getTime() - now.getTime())
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      {/* Ticket header */}
      <View style={[styles.eventBanner, { backgroundColor: ticket.access_level_color || '#1565C0' }]}>
        <Text style={styles.eventName}>{ticket.event_name}</Text>
        <Text style={styles.accessLevel}>{ticket.access_level_name}</Text>
      </View>

      {/* QR Code section */}
      <View style={styles.qrSection}>
        {qrLocked ? (
          <View style={styles.qrLocked}>
            <MaterialIcons name="lock-clock" size={64} color="#555" />
            <Text style={styles.qrLockedText}>QR Unlocks Soon</Text>
            {timeUntilVisible > 0 && (
              <Text style={styles.qrLockedCountdown}>
                {formatTimeRemaining(timeUntilVisible)}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.qrWrapper}>
            {/* QR Code */}
            <QRCode
              value={ticket.public_code}
              size={width * 0.65}
              color="#000000"
              backgroundColor="#FFFFFF"
            />

            {/* Anti-screenshot animated overlay */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.screenshotOverlay,
                { backgroundColor: overlayTint, opacity: opacityAnim },
              ]}
            >
              {/* Rotating diagonal watermark */}
              <Animated.Text
                style={[styles.watermarkText, { transform: [{ rotate: rotateInterp }] }]}
              >
                {overlayTimestamp}
              </Animated.Text>
            </Animated.View>
          </View>
        )}
      </View>

      {/* Attendee info */}
      <View style={styles.infoCard}>
        <Text style={styles.attendeeName}>{ticket.attendee_name || 'Guest'}</Text>
        <Text style={styles.codeText}>{ticket.public_code}</Text>
        <Text style={styles.dateLine}>
          {new Date(ticket.event_starts_at).toLocaleDateString()} – {new Date(ticket.event_ends_at).toLocaleDateString()}
        </Text>
      </View>

      {/* Token balances */}
      {(ticket.drink_tokens_remaining > 0 || ticket.food_tokens_remaining > 0) && (
        <View style={styles.tokensRow}>
          {ticket.drink_tokens_remaining > 0 && (
            <View style={styles.tokenChip}>
              <Text style={styles.tokenEmoji}>🍺</Text>
              <Text style={styles.tokenCount}>{ticket.drink_tokens_remaining}</Text>
            </View>
          )}
          {ticket.food_tokens_remaining > 0 && (
            <View style={styles.tokenChip}>
              <Text style={styles.tokenEmoji}>🍔</Text>
              <Text style={styles.tokenCount}>{ticket.food_tokens_remaining}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.liveTimeFooter}>{now.toLocaleTimeString()}</Text>
    </View>
  );
}

function formatTimeRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center' },
  centered: { justifyContent: 'center' },
  eventBanner: { width: '90%', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 20 },
  eventName: { color: '#fff', fontWeight: '800', fontSize: 20, textAlign: 'center' },
  accessLevel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },
  qrSection: { marginBottom: 20 },
  qrWrapper: { position: 'relative', padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  screenshotOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  watermarkText: { fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: '700', fontFamily: 'monospace' },
  qrLocked: { width: width * 0.65, height: width * 0.65, backgroundColor: '#1e1e1e', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  qrLockedText: { color: '#aaa', fontSize: 16, fontWeight: '700', marginTop: 12 },
  qrLockedCountdown: { color: '#4CAF50', fontSize: 22, fontWeight: '900', marginTop: 8 },
  infoCard: { alignItems: 'center', marginBottom: 16 },
  attendeeName: { color: '#fff', fontWeight: '700', fontSize: 22 },
  codeText: { color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  dateLine: { color: '#888', fontSize: 13, marginTop: 4 },
  tokensRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  tokenChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e1e', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  tokenEmoji: { fontSize: 20 },
  tokenCount: { color: '#fff', fontSize: 18, fontWeight: '700' },
  liveTimeFooter: { color: '#333', fontSize: 11, fontFamily: 'monospace', marginTop: 'auto' },
  errorText: { color: '#aaa', marginTop: 16, fontSize: 16 },
});
