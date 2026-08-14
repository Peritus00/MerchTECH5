/**
 * RosterTable — paginated, searchable attendee roster with PII-filtered columns.
 * door_scanner role sees: name, photo indicator, access level; no email.
 * event_manager+ sees all columns.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';

export interface RosterRow {
  id: number;
  ticket_id: number;
  public_code: string;
  name: string | null;
  email: string | null;
  photo_status: 'none' | 'pending' | 'approved';
  has_photo: boolean;
  access_level_id: number | null;
  attendee_id: number | null;
}

interface Props {
  eventId: number;
  role: 'door_scanner' | 'credential_desk' | 'seller' | 'event_manager' | 'super_admin';
  onRowPress?: (row: RosterRow) => void;
}

const PAGE_SIZE = 50;

export function RosterTable({ eventId, role, onRowPress }: Props) {
  const showPII = role !== 'door_scanner';
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setRows([]);
    setPage(1);
    setHasMore(true);
  }, [searchDebounce]);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (loading || (!hasMore && pageNum > 1)) return;
    setLoading(true);
    try {
      const res = await api.get(`/events/${eventId}/attendees`, {
        params: { page: pageNum, limit: PAGE_SIZE, search: searchDebounce || undefined },
      });
      const newRows: RosterRow[] = res.data.attendees;
      setRows(prev => (pageNum === 1 ? newRows : [...prev, ...newRows]));
      setHasMore(newRows.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [eventId, searchDebounce, loading, hasMore]);

  useEffect(() => { fetchPage(1); }, [searchDebounce]);

  const renderItem = ({ item }: { item: RosterRow }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onRowPress?.(item)}
      activeOpacity={0.7}
    >
      <View style={styles.photoCell}>
        {item.has_photo ? (
          <View style={[styles.photoIndicator, item.photo_status === 'approved' && styles.photoApproved]}>
            <MaterialIcons name="photo" size={16} color="#fff" />
          </View>
        ) : (
          <View style={styles.photoMissing}>
            <MaterialIcons name="person" size={16} color="#555" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nameText}>{item.name || '—'}</Text>
        {showPII && item.email && (
          <Text style={styles.emailText}>{item.email}</Text>
        )}
      </View>
      <Text style={styles.codeText}>{item.public_code.slice(0, 8)}…</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={20} color="#555" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={showPII ? 'Search name or email…' : 'Search name…'}
          placeholderTextColor="#555"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={18} color="#555" />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={r => String(r.ticket_id)}
        renderItem={renderItem}
        onEndReached={() => hasMore && fetchPage(page + 1)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loading ? <ActivityIndicator style={{ padding: 16 }} color="#4CAF50" /> : null}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No attendees found</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', margin: 12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  photoCell: { marginRight: 12 },
  photoIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  photoApproved: { backgroundColor: '#1B5E20' },
  photoMissing: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  nameText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  emailText: { color: '#aaa', fontSize: 12, marginTop: 2 },
  codeText: { color: '#555', fontSize: 11, fontFamily: 'monospace' },
  emptyText: { textAlign: 'center', color: '#555', padding: 24 },
});
