import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { playlistsAPI, adminAPI } from '@/services/api';
import { Playlist } from '@/shared/media-schema';
import { MaterialIcons } from '@expo/vector-icons';

export default function FallbackPlaylistSelectorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentFallbackId, setCurrentFallbackId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load current fallback config
      const fallbackData = await adminAPI.getFallbackContent();
      if (fallbackData?.fallbackPlaylist?.id) {
        setCurrentFallbackId(fallbackData.fallbackPlaylist.id);
      }
      
      // Load all playlists
      const playlistsData = await playlistsAPI.getAll();
      const playlistsArray = Array.isArray(playlistsData) ? playlistsData : (playlistsData?.playlists || []);
      setPlaylists(playlistsArray);
    } catch (error) {
      console.error('Error loading playlists:', error);
      Alert.alert('Error', 'Failed to load playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlaylist = async (playlistId: number) => {
    try {
      setSaving(true);
      await adminAPI.setFallbackPlaylist(playlistId);
      Alert.alert('Success', 'Fallback playlist updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Error setting fallback playlist:', error);
      Alert.alert('Error', 'Failed to set fallback playlist');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <ThemedText type="title">Select Fallback Playlist</ThemedText>
        </ThemedView>
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading playlists...</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <ThemedText type="title">Select Fallback Playlist</ThemedText>
          <ThemedText style={styles.subtitle}>
            Choose which playlist to show when QR codes or owners are deleted
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.listContainer}>
          {playlists.length === 0 ? (
            <ThemedView style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>No playlists found</ThemedText>
            </ThemedView>
          ) : (
            playlists.map((playlist) => (
              <TouchableOpacity
                key={playlist.id}
                style={[
                  styles.playlistItem,
                  currentFallbackId === playlist.id && styles.currentFallbackItem,
                ]}
                onPress={() => handleSelectPlaylist(playlist.id)}
                disabled={saving}
              >
                <ThemedView style={styles.playlistContent}>
                  <ThemedView style={styles.playlistInfo}>
                    <ThemedText style={styles.playlistName}>
                      {playlist.name}
                      {currentFallbackId === playlist.id && (
                        <ThemedText style={styles.currentBadge}> (Current fallback)</ThemedText>
                      )}
                    </ThemedText>
                    {playlist.description && (
                      <ThemedText style={styles.playlistDescription}>
                        {playlist.description}
                      </ThemedText>
                    )}
                    <ThemedText style={styles.playlistId}>ID: {playlist.id}</ThemedText>
                    {playlist.mediaFiles && (
                      <ThemedText style={styles.playlistStats}>
                        {playlist.mediaFiles.length} media file{playlist.mediaFiles.length !== 1 ? 's' : ''}
                      </ThemedText>
                    )}
                  </ThemedView>
                  {currentFallbackId === playlist.id ? (
                    <MaterialIcons name="check-circle" size={24} color="#34C759" />
                  ) : (
                    <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
                  )}
                </ThemedView>
              </TouchableOpacity>
            ))
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  listContainer: {
    padding: 20,
  },
  playlistItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  currentFallbackItem: {
    borderColor: '#34C759',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  playlistContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  currentBadge: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  playlistDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  playlistId: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  playlistStats: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
  },
});

