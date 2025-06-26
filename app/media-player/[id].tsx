
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import MediaPlayer from '@/components/MediaPlayer';
import { MediaFile } from '@/shared/media-schema';

export default function MediaPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlaylistData();
  }, [id]);

  const loadPlaylistData = async () => {
    try {
      // Fetch actual playlist data from API
      const response = await fetch(`https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5000/api/playlists/${id}`, {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load playlist: ${response.statusText}`);
      }

      const playlist = await response.json();
      
      // Convert to format expected by MediaPlayer
      const formattedFiles = playlist.mediaFiles?.map((file: any) => ({
        id: file.id,
        title: file.title,
        url: `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5000${file.filePath}`,
        fileType: file.fileType,
        contentType: file.contentType,
      })) || [];

      setMediaFiles(formattedFiles);
      setPlaylistName(playlist.name || `Playlist ${id}`);
    } catch (error) {
      console.error('Error loading playlist:', error);
      Alert.alert('Error', 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaybackStateChange = (isPlaying: boolean, trackIndex: number) => {
    console.log(`Playback state changed: ${isPlaying ? 'Playing' : 'Paused'} track ${trackIndex + 1}`);
    // Here you could track analytics, update UI, etc.
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
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title">{playlistName}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {mediaFiles.length} track{mediaFiles.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>

        {/* Media Player */}
        <MediaPlayer
          mediaFiles={mediaFiles}
          playlistId={id}
          shouldAutoplay={false}
          onSetPlaybackState={handlePlaybackStateChange}
        />
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
});
