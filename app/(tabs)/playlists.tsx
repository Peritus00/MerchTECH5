import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist, MediaFile } from '@/shared/media-schema';
import PlaylistCard from '@/components/PlaylistCard';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'my-playlists' | 'public'>('my-playlists');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      console.log('🔴 PLAYLISTS: Fetching real data from database...');

      // Fetch real playlists and media files from the database
      const { playlistAPI, mediaAPI } = await import('@/services/api');

      console.log('🔴 PLAYLISTS: About to call playlistAPI.getAll()...');
      const realPlaylists = await playlistAPI.getAll();
      console.log('🔴 PLAYLISTS: Playlists API call successful! Loaded playlists:', realPlaylists?.length || 0, realPlaylists);

      console.log('🔴 PLAYLISTS: About to call mediaAPI.getAll()...');
      const realMediaFiles = await mediaAPI.getAll();
      console.log('🔴 PLAYLISTS: Media API call successful! Loaded media files:', realMediaFiles?.length || 0, realMediaFiles);

      setPlaylists(realPlaylists || []);
      setMediaFiles(realMediaFiles || []);
    } catch (error: any) {
      console.error('🔴 PLAYLISTS: Error fetching data:', error);
      console.error('🔴 PLAYLISTS: Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        stack: error.stack
      });

      // Set empty arrays if API fails
      setPlaylists([]);
      setMediaFiles([]);

      Alert.alert('Error', `Failed to load playlists: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreatePlaylist = async (playlist: Playlist) => {
    try {
      console.log('🔴 PLAYLISTS: Adding new playlist to state:', playlist);
      
      // Add the newly created playlist to the state
      setPlaylists(prev => [playlist, ...prev]);
      setShowCreateModal(false);
      
      Alert.alert('Success', 'Playlist created successfully');
    } catch (error) {
      console.error('Error handling created playlist:', error);
      Alert.alert('Error', 'Failed to add playlist to list');
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    Alert.alert(
      'Delete Playlist',
      'Are you sure you want to delete this playlist?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPlaylists(prev => prev.filter(p => p.id !== playlistId));
            Alert.alert('Success', 'Playlist deleted successfully');
          },
        },
      ]
    );
  };

  const handleEditPlaylist = (playlist: Playlist) => {
    Alert.alert('Edit Playlist', `Editing: ${playlist.name}`);
    // Navigate to playlist editor when implemented
  };

  const handleViewPlaylist = (playlist: Playlist) => {
    console.log('🔴 PLAYLISTS: Play button clicked for playlist:', {
      id: playlist.id,
      name: playlist.name,
      mediaFiles: playlist.mediaFiles?.length || 0,
      requiresActivationCode: playlist.requiresActivationCode,
      playlist: playlist
    });

    try {
      // Check if playlist has media files
      if (!playlist.mediaFiles || playlist.mediaFiles.length === 0) {
        console.log('🔴 PLAYLISTS: Playlist has no media files, showing alert');
        Alert.alert('No Media', 'This playlist doesn\'t have any media files to play.');
        return;
      }

      // SCENARIO LOGIC:
      // 1. If playlist is NOT protected -> go directly to media player
      // 2. If playlist IS protected -> go to access control page (handles activation code + preview)
      
      if (!playlist.requiresActivationCode) {
        // SCENARIO 1: Not protected - direct access
        console.log('🔴 PLAYLISTS: Playlist is public, navigating directly to media player');
        const navigationPath = `/media-player/${playlist.id}`;
        console.log('🔴 PLAYLISTS: Navigation path:', navigationPath);
        router.push(navigationPath);
        
      } else {
        // SCENARIO 2 & 3: Protected - needs activation code or preview
        console.log('🔴 PLAYLISTS: Playlist is protected, navigating to access control');
        const navigationPath = `/playlist-access/${playlist.id}`;
        console.log('🔴 PLAYLISTS: Navigation path:', navigationPath);
        router.push(navigationPath);
      }
      
      console.log('🔴 PLAYLISTS: Navigation command sent successfully');
      
    } catch (error) {
      console.error('🔴 PLAYLISTS: Error in handleViewPlaylist:', error);
      Alert.alert('Error', 'Failed to open playlist');
    }
  };

  const handleAccessSettings = (playlist: Playlist) => {
    router.push(`/playlist-access/${playlist.id}`);
  };

  const filteredPlaylists = playlists.filter(playlist => {
    const matchesSearch = playlist.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedTab === 'public') {
      return playlist.isPublic && matchesSearch;
    }
    return !playlist.isPublic && matchesSearch;
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading playlists...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title">Playlists</ThemedText>
        <TouchableOpacity onPress={() => setShowCreateModal(true)}>
          <MaterialIcons name="add" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search playlists..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIcons name="clear" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {['my-playlists', 'public'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              selectedTab === tab && styles.activeTab,
            ]}
            onPress={() => setSelectedTab(tab as any)}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === tab && styles.activeTabText,
              ]}
            >
              {tab === 'my-playlists' ? 'My Playlists' : 'Public'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Playlists List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredPlaylists.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="queue-music" size={64} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>
              {searchQuery ? 'No playlists found' : 'No playlists yet'}
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try adjusting your search terms'
                : selectedTab === 'my-playlists'
                ? 'Create your first playlist to get started'
                : 'No public playlists available'
              }
            </ThemedText>
            {!searchQuery && selectedTab === 'my-playlists' && (
              <TouchableOpacity 
                style={styles.createButton} 
                onPress={() => setShowCreateModal(true)}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.createButtonText}>Create Playlist</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onView={() => handleViewPlaylist(playlist)}
              onEdit={() => handleEditPlaylist(playlist)}
              onDelete={() => handleDeletePlaylist(playlist.id)}
              onAccessSettings={() => handleAccessSettings(playlist)}
              showActions={selectedTab === 'my-playlists'}
            />
          ))
        )}
      </ScrollView>

      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreatePlaylist={handleCreatePlaylist}
        mediaFiles={mediaFiles}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 24,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});