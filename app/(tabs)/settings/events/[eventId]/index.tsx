/**
 * Event detail hub — [eventId]/index.tsx
 * Links to: Roster, Zones, Access Levels, Staff, Signing Key, Sync, Scanner
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface EventDetail {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  validation_mode: string;
  daily_reset_time: string;
  capacity: number | null;
  photo_retention_days: number | null;
}

const MENU_ITEMS = [
  { icon: 'people' as const, label: 'Roster', route: 'roster' },
  { icon: 'map' as const, label: 'Zones', route: 'zones' },
  { icon: 'layers' as const, label: 'Access Levels', route: 'access-levels' },
  { icon: 'badge' as const, label: 'Staff', route: 'staff' },
  { icon: 'local-activity' as const, label: 'Ticket Types', route: 'ticket-types' },
  { icon: 'id-card' as const, label: 'Credentials', route: 'credentials' },
  { icon: 'sync' as const, label: 'Ticket Sync', route: 'sync' },
  { icon: 'vpn-key' as const, label: 'Signing Key', route: 'signing-key' },
  { icon: 'analytics' as const, label: 'Scan Reports', route: 'reports' },
  { icon: 'qr-code-scanner' as const, label: 'Open Scanner', route: 'scanner', external: true },
  { icon: 'point-of-sale' as const, label: 'POS – Redeem Tokens', route: 'pos', external: true },
  { icon: 'photo-cleanup' as const, label: 'Photo Cleanup', route: 'photo-cleanup' },
];

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAdmin = useIsAdmin();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      api.get(`/events/${eventId}`)
        .then(res => setEvent(res.data))
        .catch(() => Alert.alert('Error', 'Failed to load event'))
        .finally(() => setLoading(false));
    }, [eventId])
  );

  const handleMenuPress = (item: typeof MENU_ITEMS[0]) => {
    if (item.route === 'scanner') {
      router.push(`/scanner/${eventId}`);
    } else if (item.route === 'pos') {
      router.push(`/pos/${eventId}`);
    } else {
      router.push(`/(tabs)/settings/events/${eventId}/${item.route}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!event) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
    >
      {/* Header card */}
      <View style={styles.headerCard}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventMeta}>
          {new Date(event.starts_at).toLocaleDateString()} – {new Date(event.ends_at).toLocaleDateString()}
        </Text>
        <Text style={styles.eventMeta}>{event.timezone} · {event.validation_mode} mode</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, event.status === 'published' ? styles.badgeGreen : styles.badgeGray]}>
            <Text style={styles.badgeText}>{event.status}</Text>
          </View>
          {event.capacity && (
            <View style={styles.badgeGray}>
              <Text style={styles.badgeText}>Cap: {event.capacity.toLocaleString()}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Menu grid */}
      <View style={styles.grid}>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity key={item.route} style={styles.menuCard} onPress={() => handleMenuPress(item)}>
            <MaterialIcons
              name={item.icon}
              size={32}
              color={item.external ? '#4CAF50' : '#aaa'}
            />
            <Text style={[styles.menuLabel, item.external && { color: '#4CAF50' }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 20, marginBottom: 20 },
  eventName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  eventMeta: { color: '#aaa', fontSize: 13, marginTop: 6 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeGreen: { backgroundColor: '#1B5E20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeGray: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  menuCard: {
    backgroundColor: '#1e1e1e', borderRadius: 10,
    width: '47%', aspectRatio: 1.4,
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  menuLabel: { color: '#ccc', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
