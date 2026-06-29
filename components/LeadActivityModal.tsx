import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { LeadActivityEvent, LeadActivityResponse, previewLeadsAPI } from '@/services/api';

interface LeadActivityModalProps {
  visible: boolean;
  leadId: number | null;
  admin?: boolean;
  onClose: () => void;
}

const activityCsvColumns = [
  'occurred_at',
  'event_type',
  'qr_code_id',
  'qr_code_name',
  'media_id',
  'media_title',
  'playlist_id',
  'playlist_name',
  'slideshow_id',
  'slideshow_name',
  'device_type',
  'browser_name',
  'operating_system',
  'city',
  'state',
  'country_code',
  'country_name',
  'geo_lat',
  'geo_lng',
  'geo_accuracy_m',
  'location_source',
  'geo_consent',
  'play_duration',
];

function eventLabel(event: LeadActivityEvent): string {
  switch (event.eventType) {
    case 'scan':
      return event.qrCodeName ? `QR scan: ${event.qrCodeName}` : 'QR scan';
    case 'media_play':
      return event.mediaTitle ? `Media play: ${event.mediaTitle}` : `Media play #${event.mediaId ?? ''}`;
    case 'playlist_play':
      return event.playlistName ? `Playlist play: ${event.playlistName}` : `Playlist play #${event.playlistId ?? ''}`;
    case 'slideshow_play':
      return event.slideshowName ? `Slideshow play: ${event.slideshowName}` : `Slideshow play #${event.slideshowId ?? ''}`;
    default:
      return event.eventType;
  }
}

function formatLocation(event: LeadActivityEvent): string {
  const parts = [event.city, event.state, event.countryCode || event.countryName].filter(Boolean);
  if (event.geoLat != null && event.geoLng != null) {
    parts.push(`${event.geoLat}, ${event.geoLng}`);
  }
  if (event.locationSource) {
    parts.push(`source: ${event.locationSource}`);
  }
  if (event.geoConsent) {
    parts.push(`consent: ${event.geoConsent}`);
  }
  return parts.length ? parts.join(' | ') : 'Location unavailable';
}

function activityToCsv(data: LeadActivityResponse): string {
  const lines = data.events.map((event) =>
    [
      event.occurredAt,
      event.eventType,
      event.qrCodeId ?? '',
      event.qrCodeName ?? '',
      event.mediaId ?? '',
      event.mediaTitle ?? '',
      event.playlistId ?? '',
      event.playlistName ?? '',
      event.slideshowId ?? '',
      event.slideshowName ?? '',
      event.deviceType ?? '',
      event.browserName ?? '',
      event.operatingSystem ?? '',
      event.city ?? '',
      event.state ?? '',
      event.countryCode ?? '',
      event.countryName ?? '',
      event.geoLat ?? '',
      event.geoLng ?? '',
      event.geoAccuracyM ?? '',
      event.locationSource ?? '',
      event.geoConsent ?? '',
      event.playDuration ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [activityCsvColumns.join(','), ...lines].join('\n');
}

export default function LeadActivityModal({ visible, leadId, admin = false, onClose }: LeadActivityModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeadActivityResponse | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await previewLeadsAPI.getLeadActivity(leadId, { admin });
      setData(response);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load activity');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [admin, leadId]);

  useEffect(() => {
    if (visible && leadId) {
      load();
    } else if (!visible) {
      setData(null);
      setError(null);
    }
  }, [visible, leadId, load]);

  const exportTimeline = async () => {
    if (!data?.events.length) {
      Alert.alert('Nothing to export', 'This lead has no linked activity yet.');
      return;
    }
    const csv = activityToCsv(data);
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-${data.lead.id}-activity.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Clipboard.setStringAsync(csv);
    Alert.alert('Copied', 'Activity timeline copied as CSV.');
  };

  const groupedEvents = useMemo(() => {
    if (!data?.events.length) return [];
    return data.events.map((event) => ({
      ...event,
      when: new Date(event.occurredAt).toLocaleString(),
    }));
  }, [data?.events]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Lead activity</ThemedText>
          <TouchableOpacity onPress={exportTimeline} style={styles.iconBtn} hitSlop={12} disabled={!data?.events.length}>
            <MaterialIcons name="file-download" size={22} color={data?.events.length ? '#2563eb' : '#9ca3af'} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.profileCard}>
              <ThemedText style={styles.profileTitle}>{data.lead.fullName || data.lead.phoneE164}</ThemedText>
              <ThemedText style={styles.profileLine}>Phone: {data.lead.phoneE164}</ThemedText>
              {data.lead.email ? <ThemedText style={styles.profileLine}>Email: {data.lead.email}</ThemedText> : null}
              <ThemedText style={styles.profileLine}>Source: {data.lead.leadSource || 'preview'}</ThemedText>
              <ThemedText style={styles.profileLine}>
                Content: {data.lead.contentType} #{data.lead.contentId}
              </ThemedText>
              <ThemedText style={styles.profileLine}>
                Verified: {new Date(data.lead.verifiedAt).toLocaleString()}
              </ThemedText>
              <ThemedText style={styles.profileLine}>
                SMS marketing: {data.lead.marketingOptIn ? 'yes' : 'no'} | Email marketing:{' '}
                {data.lead.emailMarketingOptIn ? 'yes' : 'no'}
              </ThemedText>
              <ThemedText style={styles.profileLine}>
                Precise location: {data.lead.preciseLocationConsentStatus === 'granted'
                  ? 'yes'
                  : data.lead.preciseLocationConsentStatus === 'denied'
                    ? 'declined'
                    : data.lead.preciseLocationConsentStatus === 'unavailable'
                      ? 'unavailable'
                      : 'not asked'}
                {data.lead.preciseLocationAccuracyM != null
                  ? ` (~${data.lead.preciseLocationAccuracyM}m accuracy)`
                  : ''}
              </ThemedText>
            </View>

            <View style={styles.summaryCard}>
              <ThemedText style={styles.summaryTitle}>Activity summary</ThemedText>
              <ThemedText style={styles.summaryLine}>Scans: {data.summary.scanCount}</ThemedText>
              <ThemedText style={styles.summaryLine}>Plays: {data.summary.playCount}</ThemedText>
              <ThemedText style={styles.summaryLine}>Total play seconds: {data.summary.totalPlaySeconds}</ThemedText>
              {data.summary.firstScanAt ? (
                <ThemedText style={styles.summaryLine}>
                  First scan: {new Date(data.summary.firstScanAt).toLocaleString()}
                </ThemedText>
              ) : null}
              {data.summary.lastActivityAt ? (
                <ThemedText style={styles.summaryLine}>
                  Last activity: {new Date(data.summary.lastActivityAt).toLocaleString()}
                </ThemedText>
              ) : null}
            </View>

            <ThemedText style={styles.timelineTitle}>Timeline</ThemedText>
            {!groupedEvents.length ? (
              <ThemedText style={styles.emptyText}>No linked scans or plays yet for this lead.</ThemedText>
            ) : (
              groupedEvents.map((event) => (
                <View key={`${event.eventType}-${event.id}`} style={styles.eventCard}>
                  <View style={styles.eventHeader}>
                    <ThemedText style={styles.eventTitle}>{eventLabel(event)}</ThemedText>
                    <ThemedText style={styles.eventBadge}>{event.eventType.replace('_', ' ')}</ThemedText>
                  </View>
                  <ThemedText style={styles.eventLine}>{event.when}</ThemedText>
                  {event.playDuration != null ? (
                    <ThemedText style={styles.eventLine}>Duration: {event.playDuration}s</ThemedText>
                  ) : null}
                  <ThemedText style={styles.eventLine}>{formatLocation(event)}</ThemedText>
                  {event.deviceType || event.browserName || event.operatingSystem ? (
                    <ThemedText style={styles.eventLine}>
                      Device: {[event.deviceType, event.browserName, event.operatingSystem].filter(Boolean).join(' | ')}
                    </ThemedText>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  iconBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  profileTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  profileLine: { color: '#4b5563', fontSize: 13, lineHeight: 20 },
  summaryCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 16,
  },
  summaryTitle: { fontWeight: '700', color: '#1e3a8a', marginBottom: 6 },
  summaryLine: { color: '#1d4ed8', fontSize: 13, lineHeight: 20 },
  timelineTitle: { fontWeight: '700', fontSize: 16, marginBottom: 10, color: '#111827' },
  emptyText: { color: '#6b7280', fontSize: 14 },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  eventTitle: { flex: 1, fontWeight: '700', color: '#111827' },
  eventBadge: {
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    overflow: 'hidden',
  },
  eventLine: { color: '#4b5563', fontSize: 13, lineHeight: 20 },
});
