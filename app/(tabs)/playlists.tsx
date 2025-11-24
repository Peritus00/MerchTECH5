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
  Image,
} from 'react-native';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import HeaderWithLogo from '@/components/HeaderWithLogo';
import { CartHeader } from '@/components/CartHeader';
import { Playlist, MediaFile } from '@/shared/media-schema';
import PlaylistCard from '@/components/PlaylistCard';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import CustomAlert from '@/components/CustomAlert';
import EditPlaylistModal from '@/components/EditPlaylistModal';

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [selectedTab, setSelectedTab] = useState<'my-playlists' | 'public'>('my-playlists');
  const [searchQuery, setSearchQuery] = useState('');
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{
      text: string;
      onPress: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>;
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      console.log('🔴 PLAYLISTS: Fetching real data from database...');

      // Fetch real playlists and media files from the database
      const { playlistsAPI, mediaAPI } = await import('@/services/api');

      console.log('🔴 PLAYLISTS: About to call playlistsAPI.getAll()...');
      const realPlaylistsResponse = await playlistsAPI.getAll();
      console.log('🔴 PLAYLISTS: Playlists API call successful! Response:', realPlaylistsResponse);
      
      // Extract playlists array from response
      const realPlaylists = realPlaylistsResponse?.playlists || realPlaylistsResponse || [];
      console.log('🔴 PLAYLISTS: Extracted playlists array:', realPlaylists?.length || 0, realPlaylists);
      
      // DEBUG: Log each playlist's access control status
      console.log('🔴 PLAYLISTS: ===== PLAYLIST ACCESS CONTROL STATUS DEBUG =====');
      realPlaylists.forEach((playlist: any, index: number) => {
        console.log(`🔴 PLAYLISTS: Playlist ${index + 1}:`, {
          id: playlist.id,
          name: playlist.name,
          requiresActivationCode: playlist.requiresActivationCode,
          requiresActivationCodeType: typeof playlist.requiresActivationCode,
          requires_activation_code: playlist.requires_activation_code,
          requires_activation_code_type: typeof playlist.requires_activation_code,
          isPublic: playlist.isPublic,
          is_public: playlist.is_public
        });
      });
      console.log('🔴 PLAYLISTS: ===== END PLAYLIST ACCESS CONTROL STATUS DEBUG =====');

      // Filter out any null/undefined playlists and log any issues
      const validPlaylists = (realPlaylists || []).filter((playlist: any) => {
        if (!playlist) {
          console.warn('🔴 PLAYLISTS: Found null/undefined playlist, filtering out');
          return false;
        }
        if (!playlist.name) {
          console.warn('🔴 PLAYLISTS: Found playlist without name, filtering out:', playlist);
          return false;
        }
        return true;
      });
      
      console.log('🔴 PLAYLISTS: Valid playlists after filtering:', validPlaylists.length, validPlaylists);

      console.log('🔴 PLAYLISTS: About to call mediaAPI.getAll()...');
      const realMediaFilesResponse = await mediaAPI.getAll();
      console.log('🔴 PLAYLISTS: Media API response:', realMediaFilesResponse);
      
      // Extract media array from response
      const realMediaFiles = realMediaFilesResponse?.media || realMediaFilesResponse || [];
      console.log('🔴 PLAYLISTS: Media API call successful! Loaded media files:', realMediaFiles?.length || 0, realMediaFiles);

      setPlaylists(validPlaylists);
      setMediaFiles(realMediaFiles || []);
      
      console.log('🔴 PLAYLISTS: State updated successfully, new playlists count:', validPlaylists.length);
      console.log('🔴 PLAYLISTS: State updated successfully, new media files count:', (realMediaFiles || []).length);
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

  const handleUpdatePlaylist = async (updatedPlaylist: Playlist) => {
    try {
      console.log('🔴 PLAYLISTS: Updating playlist in state:', updatedPlaylist);
      
      // Update the playlist in the state
      setPlaylists(prev => prev.map(p => 
        p.id === updatedPlaylist.id ? updatedPlaylist : p
      ));
      
      setShowEditModal(false);
      setEditingPlaylist(null);
      
      console.log('🔴 PLAYLISTS: Playlist updated successfully in state');
      
      // Also refresh the data to ensure we have the latest from server
      console.log('🔴 PLAYLISTS: Refreshing data from server to ensure consistency');
      await fetchData();
      
    } catch (error) {
      console.error('Error handling updated playlist:', error);
      Alert.alert('Error', 'Failed to update playlist');
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    console.log('🔴 PLAYLISTS: Delete playlist function called for ID:', playlistId);
    
    const playlistToDelete = playlists.find(p => p.id === playlistId);
    console.log('🔴 PLAYLISTS: Found playlist to delete:', {
      id: playlistToDelete?.id,
      name: playlistToDelete?.name,
      mediaFiles: playlistToDelete?.mediaFiles?.length || 0
    });
    
    console.log('🔴 PLAYLISTS: Showing delete confirmation alert...');
    setAlertConfig({
      visible: true,
      title: 'Delete Playlist',
      message: 'Are you sure you want to delete this playlist?',
      buttons: [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => {
            console.log('🔴 PLAYLISTS: Delete cancelled by user');
          }
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('🔴 PLAYLISTS: User confirmed delete, removing from state...');
            setPlaylists(prev => prev.filter(p => p.id !== playlistId));
            console.log('🔴 PLAYLISTS: Playlist removed from state, showing success alert...');
            
            // Show success message
            setTimeout(() => {
              setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Playlist deleted successfully',
                buttons: [
                  {
                    text: 'OK',
                    onPress: () => {
                      console.log('🔴 PLAYLISTS: Delete operation completed');
                    },
                  },
                ],
              });
            }, 100);
          },
        },
      ],
    });
  };

  const handleEditPlaylist = (playlist: Playlist) => {
    console.log('🔴 PLAYLISTS: Edit playlist function called for:', {
      id: playlist.id,
      name: playlist.name,
      mediaFiles: playlist.mediaFiles?.length || 0
    });
    
    console.log('🔴 PLAYLISTS: Opening edit modal...');
    setEditingPlaylist(playlist);
    setShowEditModal(true);
    
    console.log('🔴 PLAYLISTS: Edit playlist function completed');
  };

  const handleViewPlaylist = (playlist: Playlist) => {
    try {
      if (!playlist.mediaFiles || playlist.mediaFiles.length === 0) {
        Alert.alert('No Media', "This playlist doesn't have any media files to play.");
        return;
      }

      if (!playlist.requiresActivationCode) {
        const navigationPath = `/playlist-player/${playlist.id}?type=playlist`;
        router.push(navigationPath);
      } else {
        const navigationPath = `/playlist-access/${playlist.id}`;
        router.push(navigationPath);
      }
    } catch (error) {
      console.error('Error in handleViewPlaylist:', error);
      Alert.alert('Error', 'Failed to open playlist');
    }
  };

  const handleToggleProtection = async (playlist: Playlist) => {
    try {
      console.log('🔴 PLAYLISTS: ===== TOGGLE PROTECTION DEBUG START =====');
      console.log('🔴 PLAYLISTS: Toggling protection for playlist:', playlist.id, 'Current status:', playlist.requiresActivationCode);
      
      const { playlistsAPI } = await import('@/services/api');
      // Handle undefined case - default to false (public)
      const currentStatus = playlist.requiresActivationCode ?? false;
      const newProtectionStatus = !currentStatus;
      
      console.log('🔴 PLAYLISTS: Current status (with fallback):', currentStatus, 'New status:', newProtectionStatus);
      console.log('🔴 PLAYLISTS: About to call playlistsAPI.update with:', {
        playlistId: playlist.id,
        requiresActivationCode: newProtectionStatus
      });
      
      // Update the playlist protection status
      const updatedPlaylist = await playlistsAPI.update(playlist.id, {
        requiresActivationCode: newProtectionStatus
      });
      
      console.log('🔴 PLAYLISTS: Protection toggled successfully. New status:', newProtectionStatus);
      console.log('🔴 PLAYLISTS: Server response:', updatedPlaylist);
      
      // Update the local state
      console.log('🔴 PLAYLISTS: Updating local state...');
      setPlaylists(prev => {
        const updated = prev.map(p => 
          p.id === playlist.id 
            ? { ...p, requiresActivationCode: newProtectionStatus }
            : p
        );
        console.log('🔴 PLAYLISTS: Local state updated. Updated playlist:', updated.find(p => p.id === playlist.id));
        return updated;
      });
      
      console.log('🔴 PLAYLISTS: Showing success alert...');
      Alert.alert(
        'Protection Updated', 
        newProtectionStatus 
          ? 'Playlist is now protected and requires an activation code'
          : 'Playlist is now public and freely accessible'
      );
      
      console.log('🔴 PLAYLISTS: ===== TOGGLE PROTECTION DEBUG END =====');
      
    } catch (error: any) {
      console.error('🔴 PLAYLISTS: ❌ Error toggling protection:', error);
      console.error('🔴 PLAYLISTS: Error details:', error.response?.data || error.message);
      Alert.alert('Error', `Failed to update playlist protection: ${error.message || 'Unknown error'}`);
    }
  };

  const handleAccessSettings = (playlist: Playlist) => {
    router.push(`/playlist-access/${playlist.id}`);
  };

  const filteredPlaylists = playlists.filter(playlist => {
    // Skip playlists that don't have a name (defensive programming)
    if (!playlist || !playlist.name) {
      console.warn('🔴 PLAYLISTS: Skipping playlist with missing name:', playlist);
      return false;
    }
    
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
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Playlists</Text>
        </View>
        <View style={styles.headerCenter}>
          <Image
            source={require('../../assets/images/merchtechlogogoldnoBgColor.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerRight}>
          <CartHeader color="#6b7280" size={24} />
        </View>
      </View>

      {/* Refresh Button and Add Playlist Button */}
      <View style={styles.refreshContainer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            console.log('🔴 PLAYLISTS: Manual refresh triggered');
            onRefresh();
          }}
        >
          <MaterialIconWithFallback name="refresh" size={20} color="#3b82f6" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.addButtonContainer}
          onPress={() => setShowCreateModal(true)}
        >
          <MaterialIconWithFallback name="add" size={20} color="#3b82f6" />
          <Text style={styles.addButtonText}>CLICK HERE TO ADD NEW PLAYLIST</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
                      <MaterialIconWithFallback name="search" size={20} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search playlists..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIconWithFallback name="clear" size={20} color="#6b7280" />
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
            <MaterialIconWithFallback name="queue-music" size={64} color="#9ca3af" />
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
                <MaterialIconWithFallback name="add" size={20} color="#fff" />
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
              onToggleProtection={() => handleToggleProtection(playlist)}
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

      {/* Edit Playlist Modal */}
      <EditPlaylistModal
        visible={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingPlaylist(null);
        }}
        onUpdatePlaylist={handleUpdatePlaylist}
        playlist={editingPlaylist}
        allMediaFiles={mediaFiles}
      />

      {/* Custom Alert */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    minHeight: 60,
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  logo: {
    width: 80,
    height: 32,
  },
  addButton: {
    padding: 4,
  },
  addButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  refreshContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
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