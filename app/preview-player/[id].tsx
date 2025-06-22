
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PreviewPlayer from '@/components/PreviewPlayer';
import { MediaFile } from '@/shared/media-schema';

export default function PreviewPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPreviewData();
  }, [id]);

  const loadPreviewData = async () => {
    try {
      // Mock data - replace with actual API call
      const mockMediaFiles: MediaFile[] = [
        {
          id: 1,
          uniqueId: 'preview-1',
          title: 'Preview Track 1.mp3',
          fileType: 'audio',
          filePath: '/path/to/preview1.mp3',
          contentType: 'audio/mpeg',
          filesize: 5242880,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          uniqueId: 'preview-2',
          title: 'Preview Track 2.mp3',
          fileType: 'audio',
          filePath: '/path/to/preview2.mp3',
          contentType: 'audio/mpeg',
          filesize: 4194304,
          createdAt: new Date().toISOString(),
        },
      ];

      // Convert to format expected by PreviewPlayer
      const formattedFiles = mockMediaFiles.map(file => ({
        id: file.id,
        title: file.title,
        url: file.filePath, // In production, this would be the actual URL
        fileType: file.fileType,
        contentType: file.contentType,
      }));

      setMediaFiles(formattedFiles);
      setPlaylistName(`Preview: Playlist ${id}`);
    } catch (error) {
      console.error('Error loading preview:', error);
      Alert.alert('Error', 'Failed to load preview');
    } finally {
      setIsLoading(false);
    }
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
    <View style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Preview Player */}
      <PreviewPlayer
        mediaFiles={mediaFiles}
        playlistName={playlistName}
        previewDuration={25}
        autoplay={false}
      />

      {/* Footer with action buttons */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => {
            Alert.alert('Scan QR Code', 'Point your camera at the QR code to get full access');
          }}
        >
          <Ionicons name="qr-code" size={20} color="#ffffff" />
          <ThemedText style={styles.actionButtonText}>Scan for Full Access</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#7c3aed',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  header: {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 44,
    left: 16,
    right: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
