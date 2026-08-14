/**
 * Credentials print desk screen
 * Lists active credentials, allows printing new ones and batch export.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';
import {
  generateBatchCredentialPDF,
  generateSingleCredentialPDF,
  downloadBlob,
  type CredentialData,
} from '@/lib/events/credentialPDF';

interface CredentialRow {
  id: number;
  credential_number: number;
  stock: 'laminate_3x4' | 'cr80';
  status: string;
  ticket_id: number;
  public_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  photo_s3_key: string | null;
  photo_status: string;
  printed_at: string | null;
}

export default function CredentialsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [eventName, setEventName] = useState('');
  const [loading, setLoading] = useState(true);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchExporting, setBatchExporting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [credRes, eventRes] = await Promise.all([
        api.get(`/events/${eventId}/credentials`),
        api.get(`/events/${eventId}`),
      ]);
      setCredentials(credRes.data.filter((c: CredentialRow) => c.status === 'active'));
      setEventName(eventRes.data.name);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [eventId]));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleVoid = async (credentialId: number) => {
    Alert.alert('Void Credential', 'This credential will no longer be accepted at the gate.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void', style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/events/${eventId}/credentials/${credentialId}/void`, { void_reason: 'admin_void' });
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'Failed to void');
          }
        },
      },
    ]);
  };

  const buildCredData = (row: CredentialRow): CredentialData => ({
    credential_number: row.credential_number,
    public_code: row.public_code,
    attendee_name: row.attendee_name,
    access_level_name: 'General',   // TODO: join access level name
    access_level_color: '#1565C0',
    stock: row.stock,
    event_name: eventName,
    photo_data_url: null,           // Photo fetch would go here
  });

  const handleSinglePrint = async (row: CredentialRow) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Web Only', 'PDF printing is available on the web dashboard.');
      return;
    }
    try {
      const blob = await generateSingleCredentialPDF(buildCredData(row));
      downloadBlob(blob, `cred_${row.credential_number}_${row.public_code.slice(0,8)}.pdf`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleBatchExport = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Web Only', 'PDF batch export is available on the web dashboard.');
      return;
    }
    const toExport = selected.size > 0
      ? credentials.filter(c => selected.has(c.id))
      : credentials;

    if (toExport.length === 0) { Alert.alert('No credentials', 'Nothing to export.'); return; }

    setBatchExporting(true);
    setBatchProgress(0);
    try {
      const credData = toExport.map(buildCredData);
      const blob = await generateBatchCredentialPDF(credData, (pct) => setBatchProgress(pct));
      downloadBlob(blob, `${eventName.replace(/\s+/g,'_')}_credentials_batch.pdf`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setBatchExporting(false);
      setBatchProgress(0);
    }
  };

  const renderItem = ({ item }: { item: CredentialRow }) => (
    <View style={[styles.row, selected.has(item.id) && styles.rowSelected]}>
      <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelect(item.id)}>
        <MaterialIcons
          name={selected.has(item.id) ? 'check-box' : 'check-box-outline-blank'}
          size={22}
          color={selected.has(item.id) ? '#4CAF50' : '#555'}
        />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.credNumber}>#{String(item.credential_number).padStart(5, '0')} · {item.stock}</Text>
        <Text style={styles.credName}>{item.attendee_name || '—'}</Text>
      </View>
      <TouchableOpacity style={styles.actionBtn} onPress={() => handleSinglePrint(item)}>
        <MaterialIcons name="print" size={20} color="#4CAF50" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} onPress={() => handleVoid(item.id)}>
        <MaterialIcons name="block" size={20} color="#B71C1C" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarCount}>{credentials.length} credentials</Text>
        <TouchableOpacity
          style={[styles.exportBtn, batchExporting && { opacity: 0.6 }]}
          onPress={handleBatchExport}
          disabled={batchExporting}
        >
          {batchExporting ? (
            <Text style={styles.exportBtnText}>Exporting {batchProgress}%…</Text>
          ) : (
            <>
              <MaterialIcons name="picture-as-pdf" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>
                {selected.size > 0 ? `Export ${selected.size} Selected` : 'Export All'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={credentials}
          keyExtractor={c => String(c.id)}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="badge" size={48} color="#333" />
              <Text style={styles.emptyText}>No credentials printed yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  toolbarCount: { color: '#aaa', fontSize: 14 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1565C0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  rowSelected: { backgroundColor: '#0D2B0D' },
  checkbox: { marginRight: 10 },
  credNumber: { color: '#888', fontSize: 11, fontFamily: 'monospace' },
  credName: { color: '#fff', fontWeight: '600', fontSize: 14, marginTop: 2 },
  actionBtn: { padding: 8, marginLeft: 4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#555', marginTop: 12 },
});
