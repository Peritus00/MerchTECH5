
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
      // Mock data - replace with actual API call
      const mockMediaFiles: MediaFile[] = [
        {
          id: 1,
          uniqueId: 'audio-1',
          title: 'Sample Track 1.mp3',
          fileType: 'audio',
          filePath: '/path/to/audio1.mp3',
          contentType: 'audio/mpeg',
          filesize: 5242880,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          uniqueId: 'audio-2',
          title: 'Sample Track 2.mp3',
          fileType: 'audio',
          filePath: '/path/to/audio2.mp3',
          contentType: 'audio/mpeg',
          filesize: 4194304,
          createdAt: new Date().toISOString(),
        },
        {
          id: 3,
          uniqueId: 'audio-3',
          title: 'Sample Track 3.mp3',
          fileType: 'audio',
          filePath: '/path/to/audio3.mp3',
          contentType: 'audio/mpeg',
          filesize: 6291456,
          createdAt: new Date().toISOString(),
        },
      ];

      // Convert to format expected by MediaPlayer
      const formattedFiles = mockMediaFiles.map(file => ({
        id: file.id,
        title: file.title,
        url: file.filePath, // In production, this would be the actual URL
        fileType: file.fileType,
        contentType: file.contentType,
      }));

      setMediaFiles(formattedFiles);
      setPlaylistName(`Playlist ${id}`);
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
