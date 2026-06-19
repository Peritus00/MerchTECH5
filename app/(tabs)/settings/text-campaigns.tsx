import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
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

const MESSAGE_MAX = 1600;

type ContactRow = {
  phone_e164: string;
  last_verified_at: string;
  marketing_opt_in: boolean;
};

type CampaignRow = {
  id: number;
  owner_user_id: number;
  owner_email?: string | null;
  owner_username?: string | null;
  message_body: string;
  recipient_total: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

function contactsToCsv(rows: ContactRow[]): string {
  const header = 'phone_e164,last_verified_at,marketing_opt_in';
  const lines = rows.map((r) =>
    [r.phone_e164, r.last_verified_at, r.marketing_opt_in ? 'true' : 'false']
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...lines].join('\n');
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
    Alert.alert('Copied', 'CSV copied to clipboard (no writable cache directory).');
    return;
  }
  const path = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
  } else {
    await Clipboard.setStringAsync(csv);
    Alert.alert('Copied', 'CSV copied to clipboard (sharing not available).');
  }
}

export default function TextCampaignsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [summary, setSummary] = useState<{ verified_unique: number; marketing_eligible_unique: number } | null>(null);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [historyScope, setHistoryScope] = useState<'mine' | 'all' | 'admin'>('mine');
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    recipientTotal: number;
    failures: { phone_e164: string; error: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await previewLeadsAPI.getCampaignContacts();
      const history = await previewLeadsAPI.getCampaignHistory({
        admin: isAdmin && historyScope !== 'mine',
        ownerScope: historyScope === 'admin' ? 'admin' : undefined,
        limit: 50,
      });
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      setCampaigns(Array.isArray(history.campaigns) ? history.campaigns : []);
      setSummary(data.summary || null);
      setSmsConfigured(!!data.smsConfigured);
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to load contacts';
      setError(msg);
      setContacts([]);
      setCampaigns([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [historyScope, isAdmin]);

  React.useEffect(() => {
    load();
  }, [load]);

  const marketingContacts = contacts.filter((c) => c.marketing_opt_in);

  const copyPhones = async (rows: ContactRow[], label: string) => {
    const text = rows.map((r) => r.phone_e164).join('\n');
    if (!text) {
      Alert.alert('Nothing to copy', `No ${label} numbers yet.`);
      return;
    }
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${rows.length} ${label} number(s) copied (one per line).`);
  };

  const exportCsv = async (rows: ContactRow[], baseName: string) => {
    if (!rows.length) {
      Alert.alert('Nothing to export', 'No rows in this export.');
      return;
    }
    const csv = contactsToCsv(rows);
    const filename = `${baseName}-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      if (Platform.OS === 'web') {
        downloadCsvWeb(filename, csv);
      } else {
        await shareCsvNative(filename, csv);
      }
    } catch (e: any) {
      Alert.alert('Export failed', e.message || 'Unknown error');
    }
  };

  const confirmAndSend = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Message required', 'Enter the text you want to send.');
      return;
    }
    if (trimmed.length > MESSAGE_MAX) {
      Alert.alert('Too long', `Message must be ${MESSAGE_MAX} characters or fewer.`);
      return;
    }
    if (!smsConfigured) {
      Alert.alert('SMS not configured', 'SMS delivery is not set up on the server yet.');
      return;
    }
    if (!marketingContacts.length) {
      Alert.alert(
        'No recipients',
        'You need at least one verified preview lead who opted in to marketing texts.'
      );
      return;
    }

    const count = marketingContacts.length;
    const preview =
      trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
    const body = `Send this message to ${count} marketing opt-in number(s)?\n\n"${preview}"`;

    if (Platform.OS === 'web') {
      if (!window.confirm(body)) return;
      void doSend(trimmed);
    } else {
      Alert.alert('Send campaign', body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'destructive', onPress: () => void doSend(trimmed) },
      ]);
    }
  };

  const doSend = async (trimmed: string) => {
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const out = await previewLeadsAPI.sendCampaignMessage(trimmed);
      setSendResult({
        sent: out.sent,
        failed: out.failed,
        recipientTotal: out.recipientTotal,
        failures: out.failures || [],
      });
      if (out.failed === 0) {
        Alert.alert('Sent', `Delivered to ${out.sent} number(s).`);
      } else {
        Alert.alert('Partially sent', `${out.sent} sent, ${out.failed} failed. See details below.`);
      }
      await load();
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Send failed';
      setError(msg);
      Alert.alert('Send failed', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Text campaigns
        </ThemedText>
        <TouchableOpacity onPress={load} style={styles.backBtn} hitSlop={12} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <MaterialIcons name="refresh" size={22} color="#3b82f6" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.intro}>
          Numbers come from verified preview phone leads, deduplicated by phone. Copy one number per line for
          external text tools. Automated sends only go to contacts who opted in to marketing SMS when they
          verified.
        </ThemedText>

        {!smsConfigured ? (
          <View style={styles.warnBox}>
            <ThemedText style={styles.warnText}>
              Server SMS is not configured — you can still copy numbers, but Send will not work until Brevo SMS is
              set up.
            </ThemedText>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errBox}>
            <ThemedText style={styles.errText}>{error}</ThemedText>
          </View>
        ) : null}

        <ThemedText style={styles.count}>
          Unique verified: {summary?.verified_unique ?? contacts.length} · Marketing opt-in:{' '}
          {summary?.marketing_eligible_unique ?? marketingContacts.length}
        </ThemedText>

        <ThemedText style={styles.section}>Copy / export</ThemedText>
        <ThemedText style={styles.hint}>All verified (deduped)</ThemedText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyPhones(contacts, 'verified')}>
            <ThemedText style={styles.primaryBtnText}>Copy phones</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => exportCsv(contacts, 'text-campaigns-all')}>
            <ThemedText style={styles.secondaryBtnText}>CSV</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.hint}>Marketing opt-in only (for compliant SMS tools)</ThemedText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyPhones(marketingContacts, 'marketing')}>
            <ThemedText style={styles.primaryBtnText}>Copy phones</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => exportCsv(marketingContacts, 'text-campaigns-marketing')}
          >
            <ThemedText style={styles.secondaryBtnText}>CSV</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.section}>Send from app</ThemedText>
        <ThemedText style={styles.hint}>
          Message ({message.trim().length}/{MESSAGE_MAX}). Sends to {marketingContacts.length} marketing opt-in
          number(s).
        </ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Your message..."
          placeholderTextColor="#9ca3af"
          value={message}
          onChangeText={setMessage}
          maxLength={MESSAGE_MAX}
          editable={!sending}
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!smsConfigured || sending || !marketingContacts.length) && styles.sendBtnDisabled]}
          onPress={confirmAndSend}
          disabled={!smsConfigured || sending || !marketingContacts.length}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.sendBtnText}>
              Send to marketing opt-in ({marketingContacts.length})
            </ThemedText>
          )}
        </TouchableOpacity>

        {sendResult ? (
          <View style={styles.resultBox}>
            <ThemedText style={styles.resultTitle}>
              Last send: {sendResult.sent} ok, {sendResult.failed} failed of {sendResult.recipientTotal}
            </ThemedText>
            {sendResult.failures.length > 0 ? (
              <>
                <ThemedText style={styles.failuresHeading}>Failures (sample):</ThemedText>
                {sendResult.failures.slice(0, 15).map((f) => (
                  <ThemedText key={f.phone_e164} style={styles.failureLine}>
                    {f.phone_e164}: {f.error}
                  </ThemedText>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        <ThemedText style={styles.section}>Campaign history</ThemedText>
        {isAdmin ? (
          <View style={styles.historyTabs}>
            <HistoryTab label="Mine" active={historyScope === 'mine'} onPress={() => setHistoryScope('mine')} />
            <HistoryTab label="All platform" active={historyScope === 'all'} onPress={() => setHistoryScope('all')} />
            <HistoryTab label="Admin collected" active={historyScope === 'admin'} onPress={() => setHistoryScope('admin')} />
          </View>
        ) : null}
        {campaigns.length === 0 ? (
          <ThemedText style={styles.hint}>No campaign sends yet.</ThemedText>
        ) : (
          campaigns.map((campaign) => (
            <View key={campaign.id} style={styles.historyCard}>
              <ThemedText style={styles.resultTitle}>
                {new Date(campaign.created_at).toLocaleString()} | {campaign.sent_count} sent, {campaign.failed_count} failed
              </ThemedText>
              {isAdmin ? (
                <ThemedText style={styles.hint}>
                  Owner: {campaign.owner_username || campaign.owner_email || campaign.owner_user_id}
                </ThemedText>
              ) : null}
              <ThemedText style={styles.historyMessage} numberOfLines={4}>
                {campaign.message_body}
              </ThemedText>
            </View>
          ))
        )}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function HistoryTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.historyTab, active && styles.historyTabActive]} onPress={onPress}>
      <ThemedText style={[styles.historyTabText, active && styles.historyTabTextActive]}>{label}</ThemedText>
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
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#4b5563', marginBottom: 16, lineHeight: 22 },
  errBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errText: { color: '#b91c1c', fontSize: 14 },
  warnBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  warnText: { color: '#92400e', fontSize: 14, lineHeight: 20 },
  count: { fontSize: 15, fontWeight: '600', marginBottom: 16, color: '#111827' },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111827' },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b82f6',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 15 },
  textArea: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  sendBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  sendBtnDisabled: { backgroundColor: '#9ca3af', opacity: 0.85 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  resultTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 },
  failuresHeading: { fontSize: 13, fontWeight: '600', color: '#b91c1c', marginBottom: 6 },
  failureLine: { fontSize: 12, color: '#4b5563', marginBottom: 4 },
  historyTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  historyTab: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e5e7eb' },
  historyTabActive: { backgroundColor: '#2563eb' },
  historyTabText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  historyTabTextActive: { color: '#fff' },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  historyMessage: { color: '#4b5563', fontSize: 13, lineHeight: 19 },
  loading: { marginTop: 24 },
});
