import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PreviewPlayer from '@/components/PreviewPlayer';
import ProductCard from '@/components/ProductCard';
import { MediaFile } from '@/shared/media-schema';

export default function PreviewPlayerScreen() {
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
    loadPreviewData();
  }, [id]);

  const loadPreviewData = async () => {
    try {
      // Fetch actual playlist data from API for preview
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/playlists/${id}`, {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load playlist: ${response.statusText}`);
      }

      const playlist = await response.json();

      // Store full playlist data for product links
      setPlaylistData(playlist);

      // Convert to format expected by PreviewPlayer
      const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001';
      const formattedFiles = playlist.mediaFiles?.map((file: any) => ({
        id: file.id,
        title: file.title,
        url: `${baseUrl}/api/media/${file.id}/stream`,
        fileType: file.fileType,
        contentType: file.contentType,
      })) || [];

      setMediaFiles(formattedFiles);
      setPlaylistName(`Preview: ${playlist.name || `Playlist ${id}`}`);
    } catch (error) {
      console.error('Error loading preview:', error);
      Alert.alert('Error', 'Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackPress = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <ThemedText style={styles.loadingText}>Loading preview...</ThemedText>
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
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
          <ThemedText style={styles.backText}>Back to Dashboard</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Main Content - Full Width Preview Player */}
      <View style={styles.mainContainer}>
        {/* Preview Player Container */}
        <View style={styles.previewPlayerContainer}>
          {/* Playlist Info */}
          <View style={styles.playlistHeader}>
            <View style={styles.playlistIcon}>
              <Ionicons name="musical-notes" size={24} color="#7c3aed" />
            </View>
            <View style={styles.playlistInfo}>
              <ThemedText style={styles.playlistTitle}>{playlistName}</ThemedText>
              <View style={styles.protectionBadge}>
                <Ionicons name="lock-closed" size={16} color="#7c3aed" />
                <ThemedText style={styles.protectionText}>Protected</ThemedText>
              </View>
            </View>
            <TouchableOpacity style={styles.previewButton}>
              <Ionicons name="play" size={20} color="#fff" />
              <ThemedText style={styles.previewButtonText}>25s PREVIEW</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Preview Player Container */}
          <View style={styles.playerContainer}>
            <PreviewPlayer
              mediaFiles={mediaFiles}
              playlistName={playlistData?.name || playlistName}
              previewDuration={25}
              autoplay={false}
              productLinks={playlistData?.productLinks || []}
            />
          </View>

          {/* Preview Info */}
          <View style={styles.previewInfo}>
            <ThemedText style={styles.previewInfoTitle}>🎵 25-Second Preview</ThemedText>
            <ThemedText style={styles.previewInfoText}>
              Experience a taste of this premium content. Get full access with an activation code or explore our store for more music!
            </ThemedText>
            <TouchableOpacity 
              style={styles.storeButton}
              onPress={() => router.push('/store')}
            >
              <Ionicons name="storefront" size={20} color="#fff" />
              <ThemedText style={styles.storeButtonText}>Visit Store</ThemedText>
            </TouchableOpacity>
          </View>
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
  previewPlayerContainer: {
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
    color: '#7c3aed',
    marginLeft: 4,
    fontWeight: '500',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 4,
  },
  playerContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 300,
  },
  previewInfo: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  previewInfoText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  storeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
});