import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
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

type LeadRow = {
  phone_e164: string;
  verified_at: string;
  marketing_opt_in: boolean;
  content_type: string;
  content_id: string | number;
  coupon_id: number | null;
};

function leadsToCsv(rows: LeadRow[]): string {
  const header = 'phone_e164,verified_at,marketing_opt_in,content_type,content_id,coupon_id';
  const lines = rows.map((r) =>
    [
      r.phone_e164,
      r.verified_at,
      r.marketing_opt_in ? 'true' : 'false',
      r.content_type,
      String(r.content_id),
      r.coupon_id != null ? String(r.coupon_id) : '',
    ]
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

export default function PreviewLeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [allLeads, setAllLeads] = useState<LeadRow[]>([]);
  const [marketingLeads, setMarketingLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, mkt] = await Promise.all([
        previewLeadsAPI.exportLeads(false),
        previewLeadsAPI.exportLeads(true),
      ]);
      setAllLeads(Array.isArray(all.leads) ? all.leads : []);
      setMarketingLeads(Array.isArray(mkt.leads) ? mkt.leads : []);
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to load leads';
      setError(msg);
      setAllLeads([]);
      setMarketingLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const copyPhones = async (rows: LeadRow[], label: string) => {
    const text = rows.map((r) => r.phone_e164).join('\n');
    if (!text) {
      Alert.alert('Nothing to copy', 'No verified leads in this list yet.');
      return;
    }
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${rows.length} ${label} numbers copied (one per line).`);
  };

  const exportCsv = async (rows: LeadRow[], baseName: string) => {
    if (!rows.length) {
      Alert.alert('Nothing to export', 'No rows in this export.');
      return;
    }
    const csv = leadsToCsv(rows);
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

  return (
    <ThemedView style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Preview phone leads
        </ThemedText>
        <TouchableOpacity onPress={load} style={styles.backBtn} hitSlop={12} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#3b82f6" /> : <MaterialIcons name="refresh" size={22} color="#3b82f6" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.intro}>
          Verified numbers collected when viewers unlock a locked playlist or slideshow preview via SMS link.
          Marketing export includes only leads who checked the optional marketing opt-in.
        </ThemedText>

        {error ? (
          <View style={styles.errBox}>
            <ThemedText style={styles.errText}>{error}</ThemedText>
          </View>
        ) : null}

        <ThemedText style={styles.count}>
          All verified: {allLeads.length} · Marketing opt-in: {marketingLeads.length}
        </ThemedText>

        <ThemedText style={styles.section}>All verified leads</ThemedText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyPhones(allLeads, 'verified')}>
            <ThemedText style={styles.primaryBtnText}>Copy phones</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => exportCsv(allLeads, 'preview-leads-all')}>
            <ThemedText style={styles.secondaryBtnText}>CSV</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.section}>Marketing opt-in only</ThemedText>
        <ThemedText style={styles.hint}>Use for campaigns — do not mix with transactional-only leads.</ThemedText>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => copyPhones(marketingLeads, 'marketing')}>
            <ThemedText style={styles.primaryBtnText}>Copy phones</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => exportCsv(marketingLeads, 'preview-leads-marketing')}
          >
            <ThemedText style={styles.secondaryBtnText}>CSV</ThemedText>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        )}
      </ScrollView>
    </ThemedView>
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
  count: { fontSize: 15, fontWeight: '600', marginBottom: 20, color: '#111827' },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111827' },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 28 },
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
  loading: { marginTop: 24 },
});
