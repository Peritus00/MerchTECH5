import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
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
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistData, setPlaylistData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      url: `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api/media/${file.id}/stream`,
      fileType: file.fileType,
      contentType: file.contentType,
    })) || [];

    console.log('🔴 MEDIA_PLAYER: Formatted files for MediaPlayer:', formattedFiles);
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
      url: `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api/media/${mediaFile.id}/stream`,
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
      <View style={styles.responsiveRow}>
        {/* Left: Media Player and Chat */}
        <View style={styles.leftColumn}>
          {/* Header with Back Button */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
              <ThemedText style={styles.backText}>Back</ThemedText>
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <ThemedText type="title" style={styles.title}>{playlistName}</ThemedText>
              <ThemedText style={styles.subtitle}>
                {mediaFiles.length} track{mediaFiles.length !== 1 ? 's' : ''}
              </ThemedText>
            </View>
          </View>
          {/* Media Player */}
          <MediaPlayer
            mediaFiles={mediaFiles}
            playlistId={id}
            shouldAutoplay={false}
            onSetPlaybackState={handlePlaybackStateChange}
            productLinks={playlistData?.productLinks || []}
          />
          {/* Chat Component - Only show for playlists */}
          {playlistData && (
            <PlaylistChat
              playlistId={id}
              playlistName={playlistData.name}
            />
          )}
        </View>
        {/* Right: Product Ads */}
        <View style={styles.rightColumn}>
          <ThemedText style={styles.productAdTitle}>Featured Products</ThemedText>
          {playlistData?.productLinks && playlistData.productLinks.length > 0 ? (
            playlistData.productLinks.map((product: any) => (
              <ProductCard key={product.id} product={product} onPress={() => {}} />
            ))
          ) : (
            <ThemedText style={styles.noProductsText}>No products to display.</ThemedText>
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
  responsiveRow: {
    flex: 1,
    flexDirection: 'column',
    '@media (min-width: 900px)': {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
  },
  leftColumn: {
    flex: 2,
    minWidth: 0,
    padding: 20,
    '@media (min-width: 900px)': {
      maxWidth: 700,
    },
  },
  rightColumn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 20,
    padding: 24,
    minWidth: 320,
    maxWidth: 400,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
    '@media (max-width: 899px)': {
      marginTop: 0,
      marginLeft: 0,
      maxWidth: '100%',
      minWidth: 0,
    },
  },
  productAdTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1f2937',
  },
  noProductsText: {
    color: '#6b7280',
    fontSize: 16,
    marginTop: 16,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    padding: 20,
    paddingTop: 60, // Account for status bar
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 8,
    fontWeight: '500',
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
});