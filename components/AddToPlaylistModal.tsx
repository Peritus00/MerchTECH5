import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Playlist } from '@/shared/media-schema';

interface AddToPlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  playlists: Playlist[];
  mediaIds: number[];
  onAddComplete: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  visible,
  onClose,
  playlists,
  mediaIds,
  onAddComplete,
}) => {
  const [addingToId, setAddingToId] = React.useState<string | null>(null);

  const handleSelectPlaylist = async (playlist: Playlist) => {
    if (mediaIds.length === 0) return;
    setAddingToId(playlist.id);
    try {
      const { playlistsAPI, playlistMediaFilesToUpdateItems } = await import('@/services/api');
      const full = await playlistsAPI.getById(playlist.id);
      const items = playlistMediaFilesToUpdateItems(full.mediaFiles || []);
      const existing = new Set(items.map((i) => i.mediaId));
      for (const mid of mediaIds) {
        if (!existing.has(mid)) {
          items.push({
            mediaId: mid,
            scheduleEnabled: false,
            scheduleStartDate: null,
            scheduleEndDate: null,
            scheduleExactDates: [],
            scheduleRecurringRules: [],
          });
          existing.add(mid);
        }
      }
      await playlistsAPI.updateMedia(playlist.id, items);
      Alert.alert('Success', `Added to "${playlist.name}"`);
      onAddComplete();
      onClose();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to add to playlist';
      Alert.alert('Error', msg);
    } finally {
      setAddingToId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add to Playlist</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.subtitle}>
          Choose a playlist to add {mediaIds.length} item{mediaIds.length !== 1 ? 's' : ''} to
        </Text>
        {playlists.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="queue-music" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No playlists yet</Text>
            <Text style={styles.emptySubtext}>Create a playlist first</Text>
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.playlistItem}
                onPress={() => handleSelectPlaylist(item)}
                disabled={!!addingToId}
              >
                <MaterialIcons name="queue-music" size={24} color="#3b82f6" />
                <Text style={styles.playlistName}>{item.name}</Text>
                {addingToId === item.id ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <MaterialIcons name="add-circle" size={24} color="#3b82f6" />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    gap: 12,
  },
  playlistName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
});
