import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PreviewPlayer from '@/components/PreviewPlayer';
import { slideshowsAPI, slideshowAccessAPI } from '@/services/api';
import { env } from '@/config/environment';

// Define the structure of a Slideshow and its Images
interface SlideshowImage {
  id: number;
  slideshowId: number;
  imageUrl: string;
  caption?: string;
  displayOrder: number;
}

interface Slideshow {
  id: number;
  name: string;
  description?: string;
  images: SlideshowImage[];
  audioUrl?: string;
  autoplayInterval?: number;
  productLinks?: any[];
}

export default function PreviewPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Responsive breakpoint
  const isWideScreen = width > 768;

  useEffect(() => {
    if (id) {
      loadPreviewData(id);
    }
  }, [id]);

  const loadPreviewData = async (slideshowId: string) => {
    setIsLoading(true);
    try {
      console.log(`⚙️ Loading preview for slideshow ID: ${slideshowId}`);
      // Use the public slideshow access endpoint for preview
      const data = await slideshowAccessAPI.getByIdForAccess(slideshowId);
      console.log('✅ Successfully fetched slideshow data:', data);
      // Normalize casing so creator id is always available for store routing
      const mapped = data ? { ...data, userId: (data as any).user_id || (data as any).userId } : null;
      setSlideshow(mapped);
    } catch (error) {
      console.error('❌ Error loading slideshow preview:', error);
      Alert.alert('Error', 'Failed to load slideshow preview.');
      router.back(); // Go back if loading fails
    } finally {
      setIsLoading(false);
    }
  };

  // Memoize the formatted media files to prevent re-renders
  const formattedMediaFiles = useMemo(() => {
    if (!slideshow) return [];

    const baseUrl = env.apiBaseUrl.replace('/api', '');
    
    console.log('🖼️ Processing slideshow for preview:', {
      id: slideshow.id,
      name: slideshow.name,
      imageCount: slideshow.images?.length || 0,
      hasAudio: !!slideshow.audioUrl,
      autoplayInterval: slideshow.autoplayInterval
    });
    
    // Map images to media files for the preview player
    const imageFiles = slideshow.images?.map((image, index) => {
      // Always use streaming endpoint for consistent S3 handling
      // The server now provides the correct streaming URL directly.
      const streamUrl = image.url;
      
      console.log(`🖼️ Image ${index + 1}:`, {
        id: image.id,
        originalUrl: "REDACTED", // No longer sending originalUrl
        streamUrl: streamUrl,
        caption: image.caption
      });
      
      return {
        id: image.id,
        title: image.caption || `Image ${index + 1}`,
        url: streamUrl,
        fileType: 'image',
        contentType: 'image/jpeg',
        duration: slideshow.autoplayInterval || 5000, // Duration for each image in ms
      };
    }) || [];

    // Background audio will be handled separately by PreviewPlayer
    if (slideshow.audioUrl) {
      console.log('🎵 Background audio available:', {
        audioUrl: slideshow.audioUrl
      });
      
      // Don't add to imageFiles array - PreviewPlayer will handle it separately
    }
      
    console.log('🖼️ Final formatted media files for slideshow preview:', imageFiles);
    return imageFiles;
  }, [slideshow]);

  const handleBackPress = () => {
    // Clean up any background audio before going back
    if (typeof window !== 'undefined') {
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
    router.back();
  };

  // Function to cleanup audio before navigation
  const cleanupAudioAndNavigate = (destination: string) => {
    // Clean up any background audio that might still be playing
    if (typeof window !== 'undefined') {
      // Find any audio elements and stop them
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
    
    // Navigate to destination
    router.push(destination);
  };

  const handlePreviewComplete = () => {
    // Redirect to the slideshow creator's store
    const storeUrl = slideshow?.userId ? `/store/user/${slideshow.userId}` : '/store/master';
    
    Alert.alert(
      '⏰ Preview Complete',
      'Your slideshow preview has ended. Enter an activation code for full access or visit the creator\'s store.',
      [
        { text: 'Enter Code', onPress: () => cleanupAudioAndNavigate(`/slideshow-access/${id}`) },
        { text: 'Visit Store', onPress: () => cleanupAudioAndNavigate(storeUrl) }
      ]
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <ThemedText style={styles.loadingText}>Loading slideshow preview...</ThemedText>
      </ThemedView>
    );
  }

  if (!slideshow) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText style={styles.errorText}>Slideshow not found</ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header with Back Button */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          style={styles.headerBackButton}
          onPress={handleBackPress}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Slideshow Preview</ThemedText>
        <View style={{ width: 80 }} />
      </View>

      {/* Enhanced Preview Player */}
      <PreviewPlayer
        mediaFiles={formattedMediaFiles}
        playlistName={slideshow.name}
        previewDuration={30}
        autoplay={false}
        productLinks={slideshow.productLinks || []}
        onPreviewComplete={handlePreviewComplete}
        backgroundAudioUrl={slideshow.audioUrl ? 
          `http://localhost:5001/api/slideshow-audio/${slideshow.id}/stream`
          : undefined}
        userId={slideshow.userId}
      />

      {/* Slideshow Info Section */}
      <View style={styles.infoSection}>
        <View style={styles.slideshowInfo}>
          <View style={styles.slideshowIcon}>
            <Ionicons name="images" size={24} color="#7c3aed" />
          </View>
          <View style={styles.slideshowDetails}>
            <ThemedText style={styles.slideshowTitle}>{slideshow.name}</ThemedText>
            {slideshow.description && (
              <ThemedText style={styles.slideshowDescription}>
                {slideshow.description}
              </ThemedText>
            )}
            <View style={styles.slideshowStats}>
              <View style={styles.statItem}>
                <Ionicons name="images-outline" size={16} color="#6b7280" />
                <ThemedText style={styles.statText}>
                  {slideshow.images?.length || 0} images
                </ThemedText>
              </View>
              {slideshow.audioUrl && (
                <View style={styles.statItem}>
                  <Ionicons name="musical-notes-outline" size={16} color="#6b7280" />
                  <ThemedText style={styles.statText}>Background audio</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={styles.accessButton}
          onPress={() => cleanupAudioAndNavigate(`/slideshow-access/${id}`)}
        >
          <Ionicons name="lock-open" size={20} color="#fff" />
          <ThemedText style={styles.accessButtonText}>Get Full Access</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.storeButton}
          onPress={() => {
            const storeUrl = slideshow?.userId ? `/store/user/${slideshow.userId}` : '/store/master';
            cleanupAudioAndNavigate(storeUrl);
          }}
        >
          <Ionicons name="storefront" size={20} color="#3b82f6" />
          <ThemedText style={styles.storeButtonText}>Visit Store</ThemedText>
        </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerBackButton: {
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  infoSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slideshowInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  slideshowIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  slideshowDetails: {
    flex: 1,
  },
  slideshowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  slideshowDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  slideshowStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  accessButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  accessButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  storeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#3b82f6',
    gap: 8,
  },
  storeButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
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
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});