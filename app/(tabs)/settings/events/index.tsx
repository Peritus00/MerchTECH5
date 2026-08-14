/**
 * Events index — list of events the user manages.
 * Accessible to event_manager+ and platform admins.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';

interface Event {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'archived';
  validation_mode: 'strict' | 'trust';
}

const STATUS_COLORS: Record<Event['status'], string> = {
  draft: '#888',
  published: '#4CAF50',
  archived: '#555',
};

export default function EventsIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = async () => {
    try {
      const res = await api.get('/events');
      setEvents(res.data);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [])
  );

  const handleCreate = () => router.push('/(tabs)/settings/events/create');

  const renderItem = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/settings/events/${item.id}`)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.eventName}>{item.name}</Text>
        <Text style={styles.eventDate}>
          {new Date(item.starts_at).toLocaleDateString()} –{' '}
          {new Date(item.ends_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#555" style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={events}
        keyExtractor={e => String(e.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEvents(); }} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <MaterialIcons name="event" size={48} color="#555" />
            <Text style={styles.emptyText}>No events yet</Text>
          </View>
        }
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      />
      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={handleCreate}>
          <MaterialIcons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#1e1e1e', borderRadius: 10, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  eventName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  eventDate: { color: '#aaa', fontSize: 13, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#555', marginTop: 12, fontSize: 16 },
  fab: {
    position: 'absolute', right: 16, backgroundColor: '#4CAF50',
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
