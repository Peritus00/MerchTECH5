import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { slideshowsAPI, adminAPI } from '@/services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Slideshow {
  id: number;
  name: string;
  description?: string;
  images?: any[];
}

export default function FallbackSlideshowSelectorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [currentFallbackId, setCurrentFallbackId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load current fallback config
      const fallbackData = await adminAPI.getFallbackContent();
      if (fallbackData?.fallbackSlideshow?.id) {
        setCurrentFallbackId(fallbackData.fallbackSlideshow.id);
      }
      
      // Load all slideshows
      const slideshowsData = await slideshowsAPI.getAll();
      const slideshowsArray = Array.isArray(slideshowsData) ? slideshowsData : (slideshowsData?.slideshows || []);
      setSlideshows(slideshowsArray);
    } catch (error) {
      console.error('Error loading slideshows:', error);
      Alert.alert('Error', 'Failed to load slideshows');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSlideshow = async (slideshowId: number) => {
    try {
      setSaving(true);
      await adminAPI.setFallbackSlideshow(slideshowId);
      Alert.alert('Success', 'Fallback slideshow updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Error setting fallback slideshow:', error);
      Alert.alert('Error', 'Failed to set fallback slideshow');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <ThemedText type="title">Select Fallback Slideshow</ThemedText>
        </ThemedView>
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading slideshows...</ThemedText>
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
          <ThemedText type="title">Select Fallback Slideshow</ThemedText>
          <ThemedText style={styles.subtitle}>
            Choose which slideshow to show when QR codes or owners are deleted
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.listContainer}>
          {slideshows.length === 0 ? (
            <ThemedView style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>No slideshows found</ThemedText>
            </ThemedView>
          ) : (
            slideshows.map((slideshow) => (
              <TouchableOpacity
                key={slideshow.id}
                style={[
                  styles.slideshowItem,
                  currentFallbackId === slideshow.id && styles.currentFallbackItem,
                ]}
                onPress={() => handleSelectSlideshow(slideshow.id)}
                disabled={saving}
              >
                <ThemedView style={styles.slideshowContent}>
                  <ThemedView style={styles.slideshowInfo}>
                    <ThemedText style={styles.slideshowName}>
                      {slideshow.name}
                      {currentFallbackId === slideshow.id && (
                        <ThemedText style={styles.currentBadge}> (Current fallback)</ThemedText>
                      )}
                    </ThemedText>
                    {slideshow.description && (
                      <ThemedText style={styles.slideshowDescription}>
                        {slideshow.description}
                      </ThemedText>
                    )}
                    <ThemedText style={styles.slideshowId}>ID: {slideshow.id}</ThemedText>
                    {slideshow.images && (
                      <ThemedText style={styles.slideshowStats}>
                        {slideshow.images.length} image{slideshow.images.length !== 1 ? 's' : ''}
                      </ThemedText>
                    )}
                  </ThemedView>
                  {currentFallbackId === slideshow.id ? (
                    <MaterialIcons name="check-circle" size={24} color="#34C759" />
                  ) : (
                    <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
                  )}
                </ThemedView>
              </TouchableOpacity>
            ))
          )}
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
  listContainer: {
    padding: 20,
  },
  slideshowItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  currentFallbackItem: {
    borderColor: '#34C759',
    borderWidth: 2,
    backgroundColor: '#f0fdf4',
  },
  slideshowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slideshowInfo: {
    flex: 1,
  },
  slideshowName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  currentBadge: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  slideshowDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  slideshowId: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  slideshowStats: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
  },
});

