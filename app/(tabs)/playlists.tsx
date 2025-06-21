
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
      // Mock data - replace with actual API calls
      const mockPlaylists: Playlist[] = [
        {
          id: '1',
          userId: 1,
          name: 'My Favorite Tracks',
          requiresActivationCode: false,
          isPublic: false,
          createdAt: new Date().toISOString(),
          mediaFiles: [
            {
              id: 1,
              uniqueId: 'audio-1',
              title: 'Sample Audio Track.mp3',
              fileType: 'audio',
              filePath: '/path/to/audio.mp3',
              contentType: 'audio/mpeg',
              filesize: 5242880,
              createdAt: new Date().toISOString(),
            },
            {
              id: 2,
              uniqueId: 'audio-2',
              title: 'Another Track.mp3',
              fileType: 'audio',
              filePath: '/path/to/audio2.mp3',
              contentType: 'audio/mpeg',
              filesize: 3242880,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        {
          id: '2',
          userId: 1,
          name: 'Video Collection',
          requiresActivationCode: false,
          isPublic: true,
          createdAt: new Date().toISOString(),
          mediaFiles: [
            {
              id: 3,
              uniqueId: 'video-1',
              title: 'Sample Video.mp4',
              fileType: 'video',
              filePath: '/path/to/video.mp4',
              contentType: 'video/mp4',
              filesize: 15728640,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      const mockMediaFiles: MediaFile[] = [
        {
          id: 1,
          uniqueId: 'audio-1',
          title: 'Sample Audio Track.mp3',
          fileType: 'audio',
          filePath: '/path/to/audio.mp3',
          contentType: 'audio/mpeg',
          filesize: 5242880,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          uniqueId: 'video-1',
          title: 'Sample Video.mp4',
          fileType: 'video',
          filePath: '/path/to/video.mp4',
          contentType: 'video/mp4',
          filesize: 15728640,
          createdAt: new Date().toISOString(),
        },
      ];
      
      setPlaylists(mockPlaylists);
      setMediaFiles(mockMediaFiles);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load playlists');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreatePlaylist = async (name: string, description: string, selectedMediaIds: number[]) => {
    try {
      const newPlaylist: Playlist = {
        id: Date.now().toString(),
        name: name.trim(),
        requiresActivationCode: false,
        isPublic: false,
        createdAt: new Date().toISOString(),
        mediaFiles: mediaFiles.filter(file => selectedMediaIds.includes(file.id)),
      };

      setPlaylists(prev => [newPlaylist, ...prev]);
      setShowCreateModal(false);
      Alert.alert('Success', 'Playlist created successfully');
    } catch (error) {
      console.error('Error creating playlist:', error);
      Alert.alert('Error', 'Failed to create playlist');
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
    Alert.alert('View Playlist', `Playing: ${playlist.name}`);
    // Navigate to playlist viewer when implemented
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
