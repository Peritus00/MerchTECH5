/**
 * Photo cleanup screen — manual photo retention enforcement.
 * event_manager+ only. Logs every deletion in photo_deletion_audit.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';

interface AttendeeWithPhoto {
  id: number;
  name: string | null;
  email: string | null;
  photo_status: string;
  created_at: string;
}

export default function PhotoCleanupScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [attendees, setAttendees] = useState<AttendeeWithPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  const fetchAttendees = async () => {
    setLoading(true);
    try {
      // Get attendees who have photos
      const res = await api.get(`/events/${eventId}/attendees`, {
        params: { limit: 500 },
      });
      const withPhotos = res.data.attendees.filter(
        (a: any) => a.has_photo
      );
      setAttendees(withPhotos);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load attendees');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAttendees(); }, [eventId]));

  const handleDeletePhoto = (attendeeId: number, name: string | null) => {
    Alert.alert(
      'Delete Photo',
      `Permanently delete photo for ${name || 'this attendee'}? This action is logged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingIds(prev => new Set([...prev, attendeeId]));
            try {
              await api.delete(`/events/${eventId}/attendees/${attendeeId}/photo`);
              setAttendees(prev => prev.filter(a => a.id !== attendeeId));
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to delete photo');
            } finally {
              setDeletingIds(prev => {
                const next = new Set(prev);
                next.delete(attendeeId);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete All Photos',
      `Delete ALL ${attendees.length} photos for this event? This is irreversible and will be fully logged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete All ${attendees.length}`, style: 'destructive',
          onPress: async () => {
            for (const a of attendees) {
              setDeletingIds(prev => new Set([...prev, a.id]));
              try {
                await api.delete(`/events/${eventId}/attendees/${a.id}/photo`);
                setAttendees(prev => prev.filter(x => x.id !== a.id));
              } catch (_) {} finally {
                setDeletingIds(prev => {
                  const next = new Set(prev);
                  next.delete(a.id);
                  return next;
                });
              }
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: AttendeeWithPhoto }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name || '—'}</Text>
        <Text style={styles.email}>{item.email || '—'}</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeletePhoto(item.id, item.name)}
        disabled={deletingIds.has(item.id)}
      >
        {deletingIds.has(item.id) ? (
          <ActivityIndicator size="small" color="#B71C1C" />
        ) : (
          <MaterialIcons name="delete" size={22} color="#B71C1C" />
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{attendees.length} attendees with photos</Text>
        {attendees.length > 0 && (
          <TouchableOpacity style={styles.deleteAllBtn} onPress={handleDeleteAll}>
            <MaterialIcons name="delete-forever" size={18} color="#fff" />
            <Text style={styles.deleteAllText}>Delete All</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#4CAF50" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={attendees}
          keyExtractor={a => String(a.id)}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="photo-library" size={48} color="#333" />
              <Text style={styles.emptyText}>No photos to clean up</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  headerText: { color: '#aaa', fontSize: 14 },
  deleteAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#B71C1C', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  deleteAllText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  name: { color: '#fff', fontWeight: '600', fontSize: 14 },
  email: { color: '#777', fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#555', marginTop: 12 },
});
