/**
 * Create event screen
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/services/api';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
];

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [trustMode, setTrustMode] = useState(false);
  const [dailyResetTime, setDailyResetTime] = useState('04:00:00');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Event name is required'); return; }
    if (!startsAt || !endsAt) { Alert.alert('Validation', 'Start and end dates are required'); return; }
    setSaving(true);
    try {
      const res = await api.post('/events', {
        name: name.trim(),
        timezone,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        capacity: capacity ? parseInt(capacity) : undefined,
        validation_mode: trustMode ? 'trust' : 'strict',
        daily_reset_time: dailyResetTime,
      });
      router.replace(`/(tabs)/settings/events/${res.data.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
    >
      <Text style={styles.label}>Event Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Summer Festival 2027" placeholderTextColor="#555" />

      <Text style={styles.label}>Timezone *</Text>
      <View style={styles.tzRow}>
        {TIMEZONES.map(tz => (
          <TouchableOpacity
            key={tz}
            style={[styles.tzChip, timezone === tz && styles.tzChipActive]}
            onPress={() => setTimezone(tz)}
          >
            <Text style={[styles.tzChipText, timezone === tz && { color: '#fff' }]}>
              {tz.replace('America/', '').replace('Pacific/', '')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Starts At * (YYYY-MM-DD HH:MM)</Text>
      <TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder="2027-06-15 12:00" placeholderTextColor="#555" />

      <Text style={styles.label}>Ends At * (YYYY-MM-DD HH:MM)</Text>
      <TextInput style={styles.input} value={endsAt} onChangeText={setEndsAt} placeholder="2027-06-18 23:59" placeholderTextColor="#555" />

      <Text style={styles.label}>Capacity (optional)</Text>
      <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="5000" placeholderTextColor="#555" />

      <Text style={styles.label}>Daily Reset Time</Text>
      <TextInput style={styles.input} value={dailyResetTime} onChangeText={setDailyResetTime} placeholder="04:00:00" placeholderTextColor="#555" />
      <Text style={styles.hint}>Campers who re-enter after this time will have their daily counts reset.</Text>

      <View style={styles.switchRow}>
        <View>
          <Text style={styles.label}>Trust Mode</Text>
          <Text style={styles.hint}>Allows offline ECDSA-signed validation without network.</Text>
        </View>
        <Switch value={trustMode} onValueChange={setTrustMode} trackColor={{ true: '#4CAF50' }} />
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Create Event</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  label: { color: '#ccc', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 16 },
  hint: { color: '#666', fontSize: 12, marginTop: 4 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 12, fontSize: 14 },
  tzRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tzChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  tzChipActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  tzChipText: { color: '#aaa', fontSize: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16 },
  saveBtn: { backgroundColor: '#4CAF50', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
