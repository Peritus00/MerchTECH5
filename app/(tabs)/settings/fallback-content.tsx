import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { adminAPI } from '@/services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface FallbackContent {
  fallbackPlaylist: {
    id: number;
    name: string;
    description: string;
  } | null;
  fallbackSlideshow: {
    id: number;
    name: string;
    description: string;
  } | null;
}

export default function FallbackContentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<FallbackContent | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadFallbackContent();
  }, []);

  const loadFallbackContent = async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getFallbackContent();
      setContent(data);
    } catch (error) {
      console.error('Error loading fallback content:', error);
      Alert.alert('Error', 'Failed to load fallback content');
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlaylist = () => {
    if (content?.fallbackPlaylist?.id) {
      router.push(`/(tabs)/playlists?edit=${content.fallbackPlaylist.id}`);
    }
  };

  const handleEditSlideshow = () => {
    if (content?.fallbackSlideshow?.id) {
      // Navigate to slideshow editor - adjust route as needed
      router.push(`/slideshows/${content.fallbackSlideshow.id}/edit`);
    }
  };

  const handleChangePlaylist = () => {
    router.push('/(tabs)/settings/fallback-playlist-selector');
  };

  const handleChangeSlideshow = () => {
    router.push('/(tabs)/settings/fallback-slideshow-selector');
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <ThemedText type="title">Fallback Content</ThemedText>
        </ThemedView>
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <ThemedText type="title">Fallback Content</ThemedText>
          <ThemedText style={styles.subtitle}>
            Manage content shown when QR codes or owners are deleted
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.contentContainer}>
          {/* Fallback Playlist Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Fallback Playlist</ThemedText>
            <ThemedText style={styles.sectionDescription}>
              This playlist is shown when a QR code pointing to a playlist is deleted or its owner is deleted.
            </ThemedText>

            {content?.fallbackPlaylist ? (
              <ThemedView style={styles.currentContent}>
                <ThemedView style={styles.contentInfo}>
                  <ThemedText style={styles.contentName}>
                    {content.fallbackPlaylist.name}
                  </ThemedText>
                  {content.fallbackPlaylist.description && (
                    <ThemedText style={styles.contentDescription}>
                      {content.fallbackPlaylist.description}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.contentId}>
                    ID: {content.fallbackPlaylist.id}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.editButton]}
                    onPress={handleEditPlaylist}
                  >
                    <MaterialIcons name="edit" size={20} color="#fff" />
                    <ThemedText style={styles.buttonText}>Edit</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.changeButton]}
                    onPress={handleChangePlaylist}
                  >
                    <MaterialIcons name="swap-horiz" size={20} color="#fff" />
                    <ThemedText style={styles.buttonText}>Change</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </ThemedView>
            ) : (
              <ThemedView style={styles.noContent}>
                <ThemedText style={styles.noContentText}>
                  No fallback playlist configured
                </ThemedText>
                <TouchableOpacity
                  style={[styles.button, styles.changeButton]}
                  onPress={handleChangePlaylist}
                >
                  <MaterialIcons name="add" size={20} color="#fff" />
                  <ThemedText style={styles.buttonText}>Set Fallback Playlist</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </ThemedView>

          {/* Fallback Slideshow Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Fallback Slideshow</ThemedText>
            <ThemedText style={styles.sectionDescription}>
              This slideshow is shown when a QR code pointing to a slideshow is deleted or its owner is deleted.
            </ThemedText>

            {content?.fallbackSlideshow ? (
              <ThemedView style={styles.currentContent}>
                <ThemedView style={styles.contentInfo}>
                  <ThemedText style={styles.contentName}>
                    {content.fallbackSlideshow.name}
                  </ThemedText>
                  {content.fallbackSlideshow.description && (
                    <ThemedText style={styles.contentDescription}>
                      {content.fallbackSlideshow.description}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.contentId}>
                    ID: {content.fallbackSlideshow.id}
                  </ThemedText>
                </ThemedView>
                <ThemedView style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.editButton]}
                    onPress={handleEditSlideshow}
                  >
                    <MaterialIcons name="edit" size={20} color="#fff" />
                    <ThemedText style={styles.buttonText}>Edit</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.changeButton]}
                    onPress={handleChangeSlideshow}
                  >
                    <MaterialIcons name="swap-horiz" size={20} color="#fff" />
                    <ThemedText style={styles.buttonText}>Change</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </ThemedView>
            ) : (
              <ThemedView style={styles.noContent}>
                <ThemedText style={styles.noContentText}>
                  No fallback slideshow configured
                </ThemedText>
                <TouchableOpacity
                  style={[styles.button, styles.changeButton]}
                  onPress={handleChangeSlideshow}
                >
                  <MaterialIcons name="add" size={20} color="#fff" />
                  <ThemedText style={styles.buttonText}>Set Fallback Slideshow</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  contentContainer: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  currentContent: {
    marginTop: 8,
  },
  contentInfo: {
    marginBottom: 16,
  },
  contentName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  contentDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  contentId: {
    fontSize: 12,
    color: '#94a3b8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  changeButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noContent: {
    alignItems: 'center',
    padding: 20,
  },
  noContentText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
});

