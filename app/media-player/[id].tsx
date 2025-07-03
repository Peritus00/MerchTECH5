import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import MediaPlayer from '@/components/MediaPlayer';
import PlaylistChat from '@/components/PlaylistChat';
import { MediaFile } from '@/shared/media-schema';
import { MaterialIcons } from '@expo/vector-icons';
import ProductCard from '@/components/ProductCard';

export default function MediaPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistData, setPlaylistData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Responsive breakpoint - use horizontal layout on wider screens
  const isWideScreen = width > 768;
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    console.log('🔴 MEDIA_PLAYER: Component mounted with ID:', id);
    console.log('🔴 MEDIA_PLAYER: Starting to load playlist data...');
    loadPlaylistData();
  }, [id]);

  const loadPlaylistData = async () => {
    try {
      console.log('🔴 MEDIA_PLAYER: loadPlaylistData called with ID:', id);
      console.log('🔴 MEDIA_PLAYER: typeof id:', typeof id);

      // First, determine what type of content this ID represents
      console.log('🔴 MEDIA_PLAYER: About to determine content type...');
      const contentType = await determineContentType(id);
      console.log('🔴 MEDIA_PLAYER: Content type determined as:', contentType);
      
      if (contentType === 'playlist') {
        console.log('🔴 MEDIA_PLAYER: Loading as playlist...');
        await loadPlaylist(id);
        console.log('🔴 MEDIA_PLAYER: Playlist loaded successfully');
      } else if (contentType === 'media') {
        console.log('🔴 MEDIA_PLAYER: Loading as individual media file...');
        await loadMediaFile(id);
        console.log('🔴 MEDIA_PLAYER: Media file loaded successfully');
      } else {
        console.log('🔴 MEDIA_PLAYER: Unknown content type, throwing error');
        throw new Error('Content not found or invalid ID');
      }
    } catch (error) {
      console.error('🔴 MEDIA_PLAYER: Error in loadPlaylistData:', error);
      console.error('🔴 MEDIA_PLAYER: Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      Alert.alert('Error', 'Failed to load media');
    } finally {
      console.log('🔴 MEDIA_PLAYER: Setting isLoading to false');
      setIsLoading(false);
    }
  };

  const determineContentType = async (contentId: string): Promise<'playlist' | 'media' | 'unknown'> => {
    try {
      console.log('🔴 MEDIA_PLAYER: determineContentType called with ID:', contentId);
      
      // Use the smart content detection endpoint for efficient type checking
      console.log('🔴 MEDIA_PLAYER: Importing API...');
      const { api } = await import('@/services/api');
      
      console.log('🔴 MEDIA_PLAYER: Making API call to /content/' + contentId + '/type');
      const response = await api.get(`/content/${contentId}/type`);
      console.log('🔴 MEDIA_PLAYER: API response received:', response.data);
      
      const { type } = response.data;
      
      console.log(`🔴 MEDIA_PLAYER: Content identified as ${type}`);
      return type as 'playlist' | 'media' | 'unknown';
      
    } catch (error: any) {
      console.error('🔴 MEDIA_PLAYER: Error in determineContentType:', error);
      
      // If the endpoint returns 404, the content doesn't exist
      if (error.response?.status === 404) {
        console.log('🔴 MEDIA_PLAYER: Content not found (404)');
        return 'unknown';
      }
      
      console.error('🔴 MEDIA_PLAYER: Unexpected error determining content type:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      return 'unknown';
    }
  };

  const loadPlaylist = async (playlistId: string) => {
    const { playlistAPI } = await import('@/services/api');
    const playlist = await playlistAPI.getById(playlistId);

    console.log('🔴 MEDIA_PLAYER: Loaded playlist:', playlist);

    // Store full playlist data for chat component
    setPlaylistData(playlist);

    // Convert to format expected by MediaPlayer using streaming endpoint
    const formattedFiles = playlist.mediaFiles?.map((file: any) => ({
      id: file.id,
      title: file.title,
              url: `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${file.id}/stream`,
      fileType: file.fileType,
      contentType: file.contentType,
    })) || [];

    console.log('🔴 MEDIA_PLAYER: Raw playlist media files:', playlist.mediaFiles);
    console.log('🔴 MEDIA_PLAYER: Formatted files for MediaPlayer:', formattedFiles);
    
    // Test first media file URL
    if (formattedFiles.length > 0) {
      const firstFile = formattedFiles[0];
      console.log('🔴 MEDIA_PLAYER: Testing first media file URL:', firstFile.url);
      fetch(firstFile.url, { method: 'HEAD' })
        .then(response => {
          console.log('🔴 MEDIA_PLAYER: First file URL test response:', {
            status: response.status,
            statusText: response.statusText,
            url: firstFile.url
          });
        })
        .catch(error => {
          console.error('🔴 MEDIA_PLAYER: First file URL test failed:', error);
        });
    }
    setMediaFiles(formattedFiles);
    setPlaylistName(playlist.name || `Playlist ${playlistId}`);
  };

  const loadMediaFile = async (mediaId: string) => {
    const { mediaAPI } = await import('@/services/api');
    const mediaFile = await mediaAPI.getById(mediaId);

    console.log('🔴 MEDIA_PLAYER: Loaded individual media file:', mediaFile);

    // For individual media files, we don't have playlist data for chat
    setPlaylistData(null);

    // Convert single file to array format expected by MediaPlayer using streaming endpoint
    const formattedFile = {
      id: mediaFile.id,
      title: mediaFile.title,
      url: `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${mediaFile.id}/stream`,
      fileType: mediaFile.fileType || mediaFile.file_type,
      contentType: mediaFile.contentType || mediaFile.content_type,
    };

    console.log('🔴 MEDIA_PLAYER: Formatted file for MediaPlayer:', formattedFile);
    setMediaFiles([formattedFile]);
    setPlaylistName(`Playing: ${mediaFile.title}`);
  };

  const handlePlaybackStateChange = (isPlaying: boolean, trackIndex: number) => {
    console.log(`Playback state changed: ${isPlaying ? 'Playing' : 'Paused'} track ${trackIndex + 1}`);
    // Here you could track analytics, update UI, etc.
  };

  const handleBackPress = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading playlist...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          <ThemedText style={styles.backText}>Back to Dashboard</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Main Content - Full Width Media Player */}
      <View style={styles.mainContainer}>
        {/* Media Player Container */}
        <View style={styles.mediaPlayerContainer}>
          {/* Playlist Info */}
          <View style={styles.playlistHeader}>
            <View style={styles.playlistIcon}>
              <MaterialIcons name="queue-music" size={24} color="#3b82f6" />
            </View>
            <View style={styles.playlistInfo}>
              <ThemedText style={styles.playlistTitle}>{playlistName}</ThemedText>
              <View style={styles.protectionBadge}>
                <MaterialIcons name="lock" size={16} color="#10b981" />
                <ThemedText style={styles.protectionText}>Access Granted</ThemedText>
              </View>
            </View>

          </View>

          {/* Media Player */}
          <View style={styles.playerContainer}>
            <MediaPlayer
              mediaFiles={mediaFiles}
              playlistId={id}
              shouldAutoplay={false}
              onSetPlaybackState={handlePlaybackStateChange}
              productLinks={playlistData?.productLinks || []}
            />
          </View>

          {/* Chat Component - Only show for playlists */}
          {playlistData && (
            <View style={styles.chatSection}>
              <PlaylistChat
                playlistId={id}
                playlistName={playlistData.name}
              />
            </View>
          )}
        </View>


      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60, // Account for status bar
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 8,
    fontWeight: '500',
  },
  mainContainer: {
    flex: 1,
  },
  mediaPlayerContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  playlistIcon: {
    marginRight: 12,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  protectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectionText: {
    fontSize: 12,
    color: '#10b981',
    marginLeft: 4,
    fontWeight: '500',
  },

  playerContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chatSection: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
});