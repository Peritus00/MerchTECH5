
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Slideshow } from '@/shared/media-schema';

export default function SlideshowAccessScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(30);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    fetchSlideshow();
  }, [id]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (showPreview && previewTimeLeft > 0) {
      interval = setInterval(() => {
        setPreviewTimeLeft(prev => {
          if (prev <= 1) {
            setShowPreview(false);
            handlePreviewComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showPreview, previewTimeLeft]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (showPreview && slideshow) {
      interval = setInterval(() => {
        setCurrentImageIndex(prev => 
          prev >= slideshow.images.length - 1 ? 0 : prev + 1
        );
      }, 3000); // Change image every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showPreview, slideshow]);

  const fetchSlideshow = async () => {
    try {
      // Mock data - replace with actual API call
      const mockSlideshow: Slideshow = {
        id: parseInt(id),
        uniqueId: `slideshow-${id}`,
        name: 'Product Showcase Premium',
        description: 'Exclusive product gallery',
        autoplayInterval: 3000,
        transition: 'fade',
        requiresActivationCode: true,
        createdAt: new Date().toISOString(),
        images: [
          {
            id: 1,
            slideshowId: parseInt(id),
            url: 'https://picsum.photos/400/300?random=1',
            caption: 'Premium Product 1',
            position: 0,
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            slideshowId: parseInt(id),
            url: 'https://picsum.photos/400/300?random=2', 
            caption: 'Premium Product 2',
            position: 1,
            createdAt: new Date().toISOString(),
          },
          {
            id: 3,
            slideshowId: parseInt(id),
            url: 'https://picsum.photos/400/300?random=3',
            caption: 'Premium Product 3',
            position: 2,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      
      setSlideshow(mockSlideshow);
    } catch (error) {
      console.error('Error fetching slideshow:', error);
      Alert.alert('Error', 'Failed to load slideshow');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivationCodeSubmit = async () => {
    if (!activationCode.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    setIsValidating(true);
    try {
      // Mock validation - replace with actual API call
      const isValid = activationCode === 'SLIDE123'; // Mock valid code
      
      if (isValid) {
        // Redirect to full slideshow player
        router.replace(`/slideshow-player/${id}`);
      } else {
        Alert.alert('Invalid Code', 'The activation code you entered is not valid.');
        setActivationCode('');
      }
    } catch (error) {
      console.error('Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handlePreviewStart = () => {
    setShowPreview(true);
    setPreviewTimeLeft(30);
    setCurrentImageIndex(0);
  };

  const handlePreviewComplete = () => {
    // Redirect to store after preview
    setTimeout(() => {
      router.push('/store');
    }, 2000);
  };

  const handleGoToStore = () => {
    router.push('/store');
  };

  if (isLoading || !slideshow) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading slideshow...</ThemedText>
      </ThemedView>
    );
  }

  if (showPreview) {
    return (
      <ThemedView style={styles.previewContainer}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>{slideshow.name}</Text>
          <View style={styles.previewTimer}>
            <MaterialIcons name="timer" size={16} color="#f59e0b" />
            <Text style={styles.previewTimerText}>{previewTimeLeft}s</Text>
          </View>
        </View>

        <View style={styles.imageContainer}>
          {slideshow.images.length > 0 && (
            <Image
              source={{ uri: slideshow.images[currentImageIndex].url }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.imageOverlay}>
            <Text style={styles.imageCaption}>
              {slideshow.images[currentImageIndex]?.caption}
            </Text>
            <Text style={styles.imageCounter}>
              {currentImageIndex + 1} / {slideshow.images.length}
            </Text>
          </View>
        </View>

        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.stopPreviewButton}
            onPress={() => setShowPreview(false)}
          >
            <Text style={styles.stopPreviewText}>Stop Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.storeButton}
            onPress={handleGoToStore}
          >
            <MaterialIcons name="storefront" size={20} color="#fff" />
            <Text style={styles.storeButtonText}>Visit Store</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Access Required</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Slideshow Info */}
        <View style={styles.slideshowInfo}>
          <MaterialIcons name="slideshow" size={48} color="#3b82f6" />
          <Text style={styles.slideshowName}>{slideshow.name}</Text>
          <Text style={styles.slideshowSubtitle}>
            {slideshow.images.length} images • Premium Content
          </Text>
          {slideshow.description && (
            <Text style={styles.slideshowDescription}>{slideshow.description}</Text>
          )}
        </View>

        {/* Access Options */}
        <View style={styles.accessOptions}>
          <Text style={styles.sectionTitle}>Choose an option to continue:</Text>

          {/* Activation Code Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="vpn-key" size={24} color="#10b981" />
              <Text style={styles.optionTitle}>Enter Activation Code</Text>
            </View>
            <Text style={styles.optionDescription}>
              Have an activation code? Enter it below for full access to this slideshow.
            </Text>
            
            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                value={activationCode}
                onChangeText={setActivationCode}
                placeholder="Enter activation code"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                maxLength={20}
              />
              <TouchableOpacity
                style={[styles.submitButton, (!activationCode.trim() || isValidating) && styles.disabledButton]}
                onPress={handleActivationCodeSubmit}
                disabled={!activationCode.trim() || isValidating}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="check" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Preview Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="preview" size={24} color="#f59e0b" />
              <Text style={styles.optionTitle}>30-Second Preview</Text>
            </View>
            <Text style={styles.optionDescription}>
              Get a preview of this slideshow for 30 seconds.
            </Text>
            
            <TouchableOpacity
              style={styles.previewButton}
              onPress={handlePreviewStart}
            >
              <MaterialIcons name="play-circle" size={20} color="#f59e0b" />
              <Text style={styles.previewButtonText}>Start Preview</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Store Promotion */}
        <View style={styles.storePromo}>
          <MaterialIcons name="storefront" size={32} color="#6b7280" />
          <Text style={styles.storePromoTitle}>Want full access?</Text>
          <Text style={styles.storePromoText}>
            Check out our store for activation codes and exclusive content!
          </Text>
          <TouchableOpacity
            style={styles.storePromoButton}
            onPress={handleGoToStore}
          >
            <Text style={styles.storePromoButtonText}>Visit Store</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  previewTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  previewTimerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 16,
  },
  imageCaption: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  imageCounter: {
    fontSize: 12,
    color: '#e5e7eb',
  },
  previewActions: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    gap: 12,
  },
  stopPreviewButton: {
    flex: 1,
    backgroundColor: '#6b7280',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopPreviewText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  storeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  slideshowInfo: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  slideshowName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
    textAlign: 'center',
  },
  slideshowSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  slideshowDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  accessOptions: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  codeInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  storePromo: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
  },
  storePromoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 4,
  },
  storePromoText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  storePromoButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  storePromoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
