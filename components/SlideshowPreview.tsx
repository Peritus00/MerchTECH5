import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { activationCodesAPI } from '@/services/api';
import { Audio } from 'expo-av';

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
  uniqueId: string;
  autoplayInterval: number;
  transition: string;
  audioUrl?: string;
  requiresActivationCode: boolean;
  createdAt: string;
  images: SlideshowImage[];
}

interface SlideshowPreviewProps {
  visible: boolean;
  slideshow: Slideshow | null;
  onClose: () => void;
  skipAccessCheck?: boolean;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SlideshowPreview: React.FC<SlideshowPreviewProps> = ({
  visible,
  slideshow,
  onClose,
  skipAccessCheck,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activationCode, setActivationCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(skipAccessCheck || false);
  const [showAccessForm, setShowAccessForm] = useState(false);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!visible) {
      stopAutoplay();
    } else if (slideshow) {
      if (skipAccessCheck) {
        setIsAuthorized(true);
        startAutoplay();
      } else if (!slideshow.requiresActivationCode) {
        setIsAuthorized(true);
        startAutoplay();
      }
    }
  }, [visible, slideshow, skipAccessCheck]);

  useEffect(() => {
    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const startAutoplay = () => {
    if (!slideshow || slideshow.images.length <= 1) return;
    
    autoplayRef.current = setInterval(() => {
      setCurrentImageIndex(prev => 
        prev >= slideshow.images.length - 1 ? 0 : prev + 1
      );
    }, slideshow.autoplayInterval);

    // Start background audio once when authorized
    if (slideshow?.audioUrl && !soundRef.current) {
      (async () => {
        try {
          const { sound } = await Audio.Sound.createAsync({ uri: slideshow.audioUrl }, { shouldPlay: true, isLooping: true });
          soundRef.current = sound;
        } catch (err) {
          console.warn('Failed to load slideshow audio', err);
        }
      })();
    }
  };

  const stopAutoplay = () => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  const handleValidateCode = async () => {
    if (!slideshow || !activationCode.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    setIsValidating(true);
    try {
      // Use the backend API to validate the activation code
      await activationCodesAPI.validate(activationCode.trim(), undefined, String(slideshow.id));
      
      // If validation succeeds, show the slideshow
      setIsAuthorized(true);
      setShowAccessForm(false);
      startAutoplay();
      
    } catch (error: any) {
      console.error('Activation code validation failed:', error);
      Alert.alert('Error', error.response?.data?.error || 'Invalid activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    stopAutoplay();
    setCurrentImageIndex(0);
    setActivationCode('');
    setIsAuthorized(false);
    setShowAccessForm(false);
    onClose();
  };

  const handleManualNavigation = (direction: 'prev' | 'next') => {
    if (!slideshow) return;
    
    stopAutoplay();
    setCurrentImageIndex(prev => {
      if (direction === 'prev') {
        return prev <= 0 ? slideshow.images.length - 1 : prev - 1;
      } else {
        return prev >= slideshow.images.length - 1 ? 0 : prev + 1;
      }
    });
  };

  if (!slideshow) return null;

  const currentImage = slideshow.images[currentImageIndex];
  const hasImages = slideshow.images.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {slideshow.name}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Access Control Form */}
        {showAccessForm && (
          <View style={styles.accessForm}>
            <View style={styles.accessFormContent}>
              <MaterialIcons name="lock" size={48} color="#f59e0b" />
              <Text style={styles.accessFormTitle}>Access Required</Text>
              <Text style={styles.accessFormSubtitle}>
                This slideshow requires an activation code to view
              </Text>
              
              <TextInput
                style={styles.codeInput}
                placeholder="Enter activation code"
                value={activationCode}
                onChangeText={setActivationCode}
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <TouchableOpacity
                style={styles.validateButton}
                onPress={handleValidateCode}
                disabled={isValidating}
              >
                {isValidating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.validateButtonText}>Validate Code</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Slideshow Content */}
        {isAuthorized && (
          <View style={styles.content}>
            {hasImages ? (
              <>
                {/* Image Display */}
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: currentImage.imageUrl }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                  
                  {/* Navigation Controls */}
                  <TouchableOpacity
                    style={[styles.navButton, styles.prevButton]}
                    onPress={() => handleManualNavigation('prev')}
                  >
                    <MaterialIcons name="chevron-left" size={32} color="#fff" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.navButton, styles.nextButton]}
                    onPress={() => handleManualNavigation('next')}
                  >
                    <MaterialIcons name="chevron-right" size={32} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Image Info */}
                <View style={styles.imageInfo}>
                  <Text style={styles.imageCaption}>
                    {currentImage.caption || `Image ${currentImageIndex + 1}`}
                  </Text>
                  <Text style={styles.imageCounter}>
                    {currentImageIndex + 1} of {slideshow.images.length}
                  </Text>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => {
                      if (autoplayRef.current) {
                        stopAutoplay();
                      } else {
                        startAutoplay();
                      }
                    }}
                  >
                    <MaterialIcons
                      name={autoplayRef.current ? "pause" : "play-arrow"}
                      size={24}
                      color="#3b82f6"
                    />
                    <Text style={styles.controlButtonText}>
                      {autoplayRef.current ? "Pause" : "Play"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="slideshow" size={64} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No images in slideshow</Text>
                <Text style={styles.emptyStateSubtext}>
                  Add some images to see the preview
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  headerSpacer: {
    width: 40,
  },
  accessForm: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessFormContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  accessFormTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  accessFormSubtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  codeInput: {
    width: '100%',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  validateButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 120,
    alignItems: 'center',
  },
  validateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: screenWidth,
    height: screenHeight * 0.6,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -20 }],
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prevButton: {
    left: 20,
  },
  nextButton: {
    right: 20,
  },
  imageInfo: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  imageCaption: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  imageCounter: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  controlButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

export default SlideshowPreview; 