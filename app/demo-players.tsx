
import React from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import MediaPlayer from '@/components/MediaPlayer';
import PreviewPlayer from '@/components/PreviewPlayer';
import { Ionicons } from '@expo/vector-icons';

// Mock media files for demo
const mockMediaFiles = [
  {
    id: 1,
    title: 'Demo Track 1.mp3',
    url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Replace with actual URLs
    fileType: 'audio',
    contentType: 'audio/wav',
  },
  {
    id: 2,
    title: 'Demo Track 2.mp3',
    url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Replace with actual URLs
    fileType: 'audio',
    contentType: 'audio/wav',
  },
];

export default function DemoPlayersScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText type="title">Media Player Demo</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Full Media Player */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Full Media Player
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Complete audio player with playlist, controls, and seeking
          </ThemedText>
          <MediaPlayer
            mediaFiles={mockMediaFiles}
            shouldAutoplay={false}
            playlistId="demo-playlist"
          />
        </View>

        {/* Preview Player */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Preview Player
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            25-second preview player with gradient design
          </ThemedText>
          <View style={styles.previewContainer}>
            <PreviewPlayer
              mediaFiles={mockMediaFiles}
              playlistName="Demo Playlist"
              previewDuration={25}
              autoplay={false}
            />
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionDescription: {
    paddingHorizontal: 20,
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  previewContainer: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    height: 400,
  },
});
