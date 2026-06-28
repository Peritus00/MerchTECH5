import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { previewLeadsAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type Scope = 'mine' | 'all' | 'admin';
type ConsentFilter = 'all' | 'sms' | 'email' | 'any';
type LeadSourceFilter = 'all' | 'open_access' | 'preview_gate' | 'locked_access';

type LeadRow = {
  id: number;
  owner_user_id: number;
  owner_email?: string | null;
  owner_username?: string | null;
  phone_e164: string;
  full_name?: string | null;
  email?: string | null;
  verified_at: string;
  marketing_opt_in: boolean;
  email_marketing_opt_in: boolean;
  content_type: string;
  content_id: string | number;
  coupon_id: number | null;
  activation_code_id?: number | null;
  completed_user_id?: number | null;
  account_created_at?: string | null;
  lead_source?: string;
  first_scan_at?: string | null;
  last_activity_at?: string | null;
  play_count?: number;
  total_play_seconds?: number;
};

const csvColumns = [
  'owner_user_id',
  'owner_email',
  'owner_username',
  'full_name',
  'phone_e164',
  'email',
  'verified_at',
  'sms_marketing_opt_in',
  'email_marketing_opt_in',
  'content_type',
  'content_id',
  'coupon_id',
  'activation_code_id',
  'completed_user_id',
  'account_created_at',
  'lead_source',
  'first_scan_at',
  'last_activity_at',
  'play_count',
  'total_play_seconds',
];

function leadsToCsv(rows: LeadRow[]): string {
  const lines = rows.map((r) =>
    [
      r.owner_user_id,
      r.owner_email || '',
      r.owner_username || '',
      r.full_name || '',
      r.phone_e164,
      r.email || '',
      r.verified_at,
      r.marketing_opt_in ? 'true' : 'false',
      r.email_marketing_opt_in ? 'true' : 'false',
      r.content_type,
      String(r.content_id),
      r.coupon_id ?? '',
      r.activation_code_id ?? '',
      r.completed_user_id ?? '',
      r.account_created_at || '',
      r.lead_source || '',
      r.first_scan_at || '',
      r.last_activity_at && !String(r.last_activity_at).startsWith('1970-') ? r.last_activity_at : '',
      r.play_count ?? 0,
      r.total_play_seconds ?? 0,
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  return [csvColumns.join(','), ...lines].join('\n');
}

function downloadCsvWeb(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function shareCsvNative(filename: string, csv: string) {
  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) {
    await Clipboard.setStringAsync(csv);
    Alert.alert('Copied', 'CSV copied to clipboard.');
    return;
  }
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
  } else {
    await Clipboard.setStringAsync(csv);
    Alert.alert('Copied', 'CSV copied to clipboard.');
  }
}

export default function PreviewLeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('mine');
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all');
  const [contentType, setContentType] = useState<'all' | 'playlist' | 'slideshow'>('all');
  const [leadSource, setLeadSource] = useState<LeadSourceFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const admin = isAdmin && scope !== 'mine';
      const data = await previewLeadsAPI.listLeads({
        admin,
        ownerScope: scope === 'admin' ? 'admin' : undefined,
        search: search.trim() || undefined,
        marketingOnly: consentFilter === 'any',
        smsMarketingOnly: consentFilter === 'sms',
        emailMarketingOnly: consentFilter === 'email',
        contentType: contentType === 'all' ? undefined : contentType,
        leadSource: leadSource === 'all' ? undefined : leadSource,
        limit: 500,
      });
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load leads');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [contentType, consentFilter, isAdmin, leadSource, scope, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  const smsMarketing = useMemo(() => leads.filter((l) => l.marketing_opt_in), [leads]);
  const emailMarketing = useMemo(() => leads.filter((l) => l.email_marketing_opt_in && l.email), [leads]);

  const copyValues = async (values: string[], label: string) => {
    const unique = Array.from(new Set(values.filter(Boolean)));
    if (!unique.length) {
      Alert.alert('Nothing to copy', `No ${label} in this filtered list.`);
      return;
    }
    await Clipboard.setStringAsync(unique.join('\n'));
    Alert.alert('Copied', `${unique.length} ${label} copied.`);
  };

  const exportCsv = async () => {
    if (!leads.length) {
      Alert.alert('Nothing to export', 'No rows in this filtered list.');
      return;
    }
    const csv = leadsToCsv(leads);
    const filename = `preview-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    if (Platform.OS === 'web') downloadCsvWeb(filename, csv);
    else await shareCsvNative(filename, csv);
  };

  return (
    <ThemedView style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle}>Preview leads</ThemedText>
        <TouchableOpacity onPress={load} style={styles.iconBtn} hitSlop={12} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#3b82f6" /> : <MaterialIcons name="refresh" size={22} color="#3b82f6" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.intro}>
          Manage verified phone and email leads collected from locked and open-access content. Copy/export only the consent-safe
          audience you intend to contact.
        </ThemedText>

        {isAdmin ? (
          <View style={styles.segmentRow}>
            <Segment label="My leads" active={scope === 'mine'} onPress={() => setScope('mine')} />
            <Segment label="All platform" active={scope === 'all'} onPress={() => setScope('all')} />
            <Segment label="Admin collected" active={scope === 'admin'} onPress={() => setScope('admin')} />
          </View>
        ) : null}

        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search phone, email, owner..."
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />

        <View style={styles.segmentRow}>
          <Segment label="All consent" active={consentFilter === 'all'} onPress={() => setConsentFilter('all')} />
          <Segment label="Any marketing" active={consentFilter === 'any'} onPress={() => setConsentFilter('any')} />
          <Segment label="SMS" active={consentFilter === 'sms'} onPress={() => setConsentFilter('sms')} />
          <Segment label="Email" active={consentFilter === 'email'} onPress={() => setConsentFilter('email')} />
        </View>

        <View style={styles.segmentRow}>
          <Segment label="All content" active={contentType === 'all'} onPress={() => setContentType('all')} />
          <Segment label="Playlists" active={contentType === 'playlist'} onPress={() => setContentType('playlist')} />
          <Segment label="Slideshows" active={contentType === 'slideshow'} onPress={() => setContentType('slideshow')} />
        </View>

        <View style={styles.segmentRow}>
          <Segment label="All sources" active={leadSource === 'all'} onPress={() => setLeadSource('all')} />
          <Segment label="Open access" active={leadSource === 'open_access'} onPress={() => setLeadSource('open_access')} />
          <Segment label="Preview" active={leadSource === 'preview_gate'} onPress={() => setLeadSource('preview_gate')} />
          <Segment label="Locked" active={leadSource === 'locked_access'} onPress={() => setLeadSource('locked_access')} />
        </View>

        {error ? <View style={styles.errBox}><ThemedText style={styles.errText}>{error}</ThemedText></View> : null}

        <ThemedText style={styles.count}>
          Verified: {leads.length} | SMS marketing: {smsMarketing.length} | Email marketing: {emailMarketing.length}
        </ThemedText>

        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyValues(leads.map((l) => l.phone_e164), 'phone numbers')}>
            <ThemedText style={styles.primaryBtnText}>Copy phones</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyValues(emailMarketing.map((l) => l.email || ''), 'emails')}>
            <ThemedText style={styles.primaryBtnText}>Copy emails</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={exportCsv}>
            <ThemedText style={styles.secondaryBtnText}>CSV</ThemedText>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator size="large" color="#3b82f6" style={styles.loading} /> : null}

        {leads.map((lead) => (
          <View key={lead.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>{lead.phone_e164}</ThemedText>
              <ThemedText style={styles.badge}>{lead.lead_source || 'preview'}</ThemedText>
            </View>
            <ThemedText style={styles.cardLine}>Name: {lead.full_name || 'not collected'}</ThemedText>
            <ThemedText style={styles.cardLine}>Email: {lead.email || 'not collected'}</ThemedText>
            {isAdmin ? (
              <ThemedText style={styles.cardLine}>
                Owner: {lead.owner_username || lead.owner_email || lead.owner_user_id}
              </ThemedText>
            ) : null}
            <ThemedText style={styles.cardLine}>
              Content: {lead.content_type} #{lead.content_id} | Verified: {new Date(lead.verified_at).toLocaleString()}
            </ThemedText>
            <ThemedText style={styles.cardLine}>
              Activity: {lead.play_count ?? 0} play(s), {lead.total_play_seconds ?? 0}s total
              {lead.last_activity_at && !String(lead.last_activity_at).startsWith('1970-')
                ? ` | Last: ${new Date(lead.last_activity_at).toLocaleString()}`
                : ''}
            </ThemedText>
            <ThemedText style={styles.cardLine}>
              SMS marketing: {lead.marketing_opt_in ? 'yes' : 'no'} | Email marketing: {lead.email_marketing_opt_in ? 'yes' : 'no'}
            </ThemedText>
            <ThemedText style={styles.cardLine}>
              Account: {lead.completed_user_id ? `viewer #${lead.completed_user_id}` : 'no linked account'}
            </ThemedText>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
      <ThemedText style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  iconBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#4b5563', marginBottom: 16, lineHeight: 22 },
  search: {
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  segment: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e5e7eb' },
  segmentActive: { backgroundColor: '#2563eb' },
  segmentText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  segmentTextActive: { color: '#fff' },
  errBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fecaca' },
  errText: { color: '#b91c1c', fontSize: 14 },
  count: { fontSize: 15, fontWeight: '700', marginBottom: 12, color: '#111827' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  primaryBtn: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3b82f6', justifyContent: 'center' },
  secondaryBtnText: { color: '#3b82f6', fontWeight: '700', fontSize: 13 },
  loading: { marginVertical: 18 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardTitle: { color: '#111827', fontWeight: '700', fontSize: 16 },
  badge: { color: '#1d4ed8', backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontSize: 11, overflow: 'hidden' },
  cardLine: { color: '#4b5563', fontSize: 13, lineHeight: 20 },
});
