/**
 * Staff management screen — event_manager self-serve grants up to their own tier.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { canManageRole, ROLE_HIERARCHY, type EventRole } from '@/lib/events/tokenEvaluation';

interface StaffMember {
  id: number;
  user_id: number;
  username: string;
  email: string;
  role: EventRole;
  granted_at: string;
}

const ROLE_COLORS: Record<EventRole, string> = {
  door_scanner: '#1565C0',
  seller: '#6A1B9A',
  credential_desk: '#00695C',
  event_manager: '#E65100',
  super_admin: '#B71C1C',
};

export default function StaffScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const isAdmin = useIsAdmin();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<EventRole>('door_scanner');
  const [saving, setSaving] = useState(false);
  // Current user's event role (fetched from staff list)
  const [myRole, setMyRole] = useState<EventRole>('super_admin');

  const fetchStaff = async () => {
    try {
      const res = await api.get(`/events/${eventId}/staff`);
      setStaff(res.data);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchStaff(); }, [eventId]));

  const handleRevoke = async (staffId: number, role: EventRole) => {
    if (!canManageRole(myRole, role) && !isAdmin) {
      Alert.alert('Permission Denied', `You cannot revoke a ${role}`);
      return;
    }
    Alert.alert('Revoke Access', 'Remove this staff member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/events/${eventId}/staff/${staffId}`);
            fetchStaff();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'Failed to revoke');
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    if (!addEmail.trim()) { Alert.alert('Validation', 'Email is required'); return; }
    if (!canManageRole(myRole, addRole) && !isAdmin) {
      Alert.alert('Permission Denied', `You cannot grant ${addRole}`);
      return;
    }
    setSaving(true);
    try {
      // Resolve user_id from email
      const userRes = await api.get('/admin/all-users');
      const user = userRes.data.find((u: any) => u.email === addEmail.trim().toLowerCase());
      if (!user) { Alert.alert('Not Found', 'No user with that email'); return; }
      await api.post(`/events/${eventId}/staff`, { user_id: user.id, role: addRole });
      setAddEmail('');
      fetchStaff();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to add staff');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: StaffMember }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
      <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.role] }]}>
        <Text style={styles.roleText}>{item.role.replace('_', ' ')}</Text>
      </View>
      <TouchableOpacity onPress={() => handleRevoke(item.id, item.role)} style={{ marginLeft: 8 }}>
        <MaterialIcons name="person-remove" size={22} color="#B71C1C" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ flex: 1, justifyContent: 'center' }} />
      ) : (
        <FlatList
          data={staff}
          keyExtractor={s => String(s.id)}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add Staff Member</Text>
              <TextInput
                style={styles.input}
                value={addEmail}
                onChangeText={setAddEmail}
                placeholder="user@example.com"
                placeholderTextColor="#555"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {(ROLE_HIERARCHY.filter(r => r !== 'super_admin') as EventRole[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, addRole === r && { backgroundColor: ROLE_COLORS[r] }]}
                    onPress={() => setAddRole(r)}
                  >
                    <Text style={[styles.roleChipText, addRole === r && { color: '#fff' }]}>
                      {r.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.addBtn, saving && { opacity: 0.6 }]} onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Grant Access</Text>}
              </TouchableOpacity>
              <Text style={styles.dividerLabel}>Current Staff</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No staff assigned yet</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  username: { color: '#fff', fontWeight: '700', fontSize: 14 },
  email: { color: '#aaa', fontSize: 12 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  addSection: { marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 12 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 8 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  roleChipText: { color: '#aaa', fontSize: 12 },
  addBtn: { backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 24 },
  addBtnText: { color: '#fff', fontWeight: '700' },
  dividerLabel: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  emptyText: { textAlign: 'center', color: '#555', padding: 24 },
});
