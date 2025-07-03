
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
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Slideshow } from '@/shared/media-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { activationCodesAPI } from '@/services/api';
import { Audio } from 'expo-av';
import { useRef } from 'react';

export default function SlideshowAccessScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const { user, isAuthenticated, register, login } = useAuth();
  
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(30);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isFullAccess, setIsFullAccess] = useState(false); // Track if user has full access
  
  // Audio support
  const soundRef = useRef<Audio.Sound | null>(null);
  
  // Enhanced registration flow states
  const [showRegistrationFlow, setShowRegistrationFlow] = useState(false);
  const [validatedCode, setValidatedCode] = useState<any>(null);
  const [showAppDownload, setShowAppDownload] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    firstName: '',
  });

  useEffect(() => {
    fetchSlideshow();
  }, [id]);

  // Check access after slideshow is loaded or user authentication changes
  useEffect(() => {
    if (slideshow) {
      checkExistingAccess();
    }
  }, [slideshow, isAuthenticated, user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // Only run timer for limited preview, not full access
    if (showPreview && !isFullAccess && previewTimeLeft > 0) {
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
  }, [showPreview, isFullAccess, previewTimeLeft]);

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

  // Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const fetchSlideshow = async () => {
    try {
      console.log('🎬 SLIDESHOW_ACCESS: Fetching slideshow with ID:', id);

      const { slideshowAPI } = await import('@/services/api');
      const slideshowData = await slideshowAPI.getById(id);

      console.log('🎬 SLIDESHOW_ACCESS: Loaded slideshow:', slideshowData);

      // Log images from server
      if (slideshowData.images) {
        console.log('🎬 SLIDESHOW_ACCESS: Images from server:', slideshowData.images);
        
        // Test first image URL if available
        if (slideshowData.images.length > 0) {
          const firstImage = slideshowData.images[0];
          console.log('🎬 SLIDESHOW_ACCESS: Testing first image URL:', firstImage.imageUrl);
          fetch(firstImage.imageUrl, { method: 'HEAD' })
            .then(response => {
              console.log('🎬 SLIDESHOW_ACCESS: First image URL test response:', {
                status: response.status,
                statusText: response.statusText,
                url: firstImage.imageUrl
              });
            })
            .catch(error => {
              console.error('🎬 SLIDESHOW_ACCESS: First image URL test failed:', error);
            });
        }
      }

      setSlideshow(slideshowData);
    } catch (error: any) {
      console.error('🎬 SLIDESHOW_ACCESS: Error fetching slideshow:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load slideshow';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingAccess = async () => {
    try {
      console.log('🎬 SLIDESHOW_ACCESS: ===== STARTING ACCESS CHECK =====');
      console.log('🎬 SLIDESHOW_ACCESS: Checking for existing access to slideshow:', id);
      console.log('🎬 SLIDESHOW_ACCESS: Current user state:', { isAuthenticated, userId: user?.id, username: user?.username });
      
      // Wait for slideshow to be loaded before checking protection status
      if (!slideshow) {
        console.log('🎬 SLIDESHOW_ACCESS: Slideshow not loaded yet, waiting...');
        return;
      }

      // CRITICAL CHECK: If slideshow doesn't require activation code, show slideshow directly with full access
      if (!slideshow.requiresActivationCode) {
        console.log('🎬 SLIDESHOW_ACCESS: Slideshow is NOT protected, showing slideshow directly with full access');
        setIsFullAccess(true);
        setShowPreview(true);
        startAudio(); // Start audio for public slideshows
        return;
      }

      console.log('🎬 SLIDESHOW_ACCESS: Slideshow IS protected, checking for existing access');
      
      // First check if user is authenticated and has access codes attached to their profile
      if (isAuthenticated && user) {
        console.log('🎬 SLIDESHOW_ACCESS: User is authenticated, checking profile access codes');
        console.log('🎬 SLIDESHOW_ACCESS: User details:', { userId: user.id, username: user.username });
        console.log('🎬 SLIDESHOW_ACCESS: Looking for access to slideshow ID:', id, 'as number:', parseInt(id));
        try {
          const userAccessCodes = await activationCodesAPI.getMyAccess();
          console.log('🎬 SLIDESHOW_ACCESS: User access codes response:', userAccessCodes);
          console.log('🎬 SLIDESHOW_ACCESS: Number of access codes found:', userAccessCodes?.length || 0);
          
          if (userAccessCodes && userAccessCodes.length > 0) {
            userAccessCodes.forEach((accessCode: any, index: number) => {
              console.log(`🎬 SLIDESHOW_ACCESS: Access code ${index + 1}:`, {
                id: accessCode.id,
                code: accessCode.code,
                slideshow_id: accessCode.slideshow_id,
                slideshowId: accessCode.slideshowId,
                slideshow_name: accessCode.slideshow_name,
                content_type: accessCode.content_type
              });
            });
          }
          
          // Check if any of the user's access codes are valid for this slideshow
          const hasValidAccess = userAccessCodes.some((accessCode: any) => {
            const slideshowIdMatch = accessCode.slideshow_id === parseInt(id) || accessCode.slideshowId === parseInt(id);
            console.log(`🎬 SLIDESHOW_ACCESS: Checking access code ${accessCode.code} - slideshow_id: ${accessCode.slideshow_id}, target: ${parseInt(id)}, match: ${slideshowIdMatch}`);
            return slideshowIdMatch;
          });
          
          console.log('🎬 SLIDESHOW_ACCESS: Has valid access result:', hasValidAccess);
          
          if (hasValidAccess) {
            console.log('🎬 SLIDESHOW_ACCESS: User has valid access code for this slideshow, showing slideshow');
            setIsFullAccess(true);
            setShowPreview(true);
            startAudio(); // Start audio for authorized users
            return;
          } else {
            console.log('🎬 SLIDESHOW_ACCESS: User has no valid access codes for this slideshow');
          }
        } catch (error) {
          console.error('🎬 SLIDESHOW_ACCESS: Error checking user access codes:', error);
          // Continue with other checks if API call fails
        }
      } else {
        console.log('🎬 SLIDESHOW_ACCESS: User not authenticated:', { isAuthenticated, hasUser: !!user });
      }
      
      // Check if user has a stored activation code for this slideshow (fallback)
      console.log('🎬 SLIDESHOW_ACCESS: Checking AsyncStorage for stored code...');
      const storedCode = await AsyncStorage.getItem(`slideshow_access_${id}`);
      if (storedCode) {
        console.log('🎬 SLIDESHOW_ACCESS: ⚠️  FOUND STORED CODE - This could be the bypass issue!');
        console.log('🎬 SLIDESHOW_ACCESS: Stored code:', storedCode);
        console.log('🎬 SLIDESHOW_ACCESS: Validating stored code with server...');
        
        // SECURITY FIX: Validate the stored code before trusting it
        try {
          const validationResult = await activationCodesAPI.validate(storedCode, undefined, id);
          console.log('🎬 SLIDESHOW_ACCESS: Validation result:', validationResult);
          
          if (validationResult.valid) {
            console.log('🎬 SLIDESHOW_ACCESS: ❌ SECURITY BYPASS DETECTED! Stored code is still valid - this is why user bypasses access screen');
            console.log('🎬 SLIDESHOW_ACCESS: User previously had access but it was removed from their profile');
            console.log('🎬 SLIDESHOW_ACCESS: The stored code should be invalidated when removed from profile');
            
            // For now, let's remove the stored code to fix the bypass
            console.log('🎬 SLIDESHOW_ACCESS: 🔒 SECURITY FIX: Removing stored code to prevent bypass');
            await AsyncStorage.removeItem(`slideshow_access_${id}`);
            console.log('🎬 SLIDESHOW_ACCESS: Stored code removed - user will now see access screen');
            
            // Don't show slideshow - show access screen instead
            // setIsFullAccess(true);
            // setShowPreview(true);
            // startAudio();
            // return;
          } else {
            console.log('🎬 SLIDESHOW_ACCESS: ✅ Stored activation code is no longer valid, removing from storage');
            await AsyncStorage.removeItem(`slideshow_access_${id}`);
          }
        } catch (error) {
          console.error('🎬 SLIDESHOW_ACCESS: ❌ Error validating stored code:', error);
          console.log('🎬 SLIDESHOW_ACCESS: Removing invalid stored code due to validation error');
          // Remove invalid stored code
          await AsyncStorage.removeItem(`slideshow_access_${id}`);
        }
      } else {
        console.log('🎬 SLIDESHOW_ACCESS: ✅ No stored code found in AsyncStorage');
      }

      // Check if user has purchased access (you can implement this based on your payment system)
      const hasPurchasedAccess = await checkPurchasedAccess(id);
      if (hasPurchasedAccess) {
        console.log('🎬 SLIDESHOW_ACCESS: User has purchased access, showing slideshow');
        setIsFullAccess(true);
        setShowPreview(true);
        startAudio(); // Start audio for purchased access
        return;
      }

      console.log('🎬 SLIDESHOW_ACCESS: ===== ACCESS CHECK COMPLETE =====');
      console.log('🎬 SLIDESHOW_ACCESS: ✅ No existing access found for protected content, showing access options');
      console.log('🎬 SLIDESHOW_ACCESS: User will see the activation code input screen');
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error checking existing access:', error);
    }
  };

  const checkPurchasedAccess = async (slideshowId: string): Promise<boolean> => {
    try {
      // TODO: Implement actual API call to check if user has purchased access
      // This could check against your payment/subscription system
      // For now, returning false to show access options
      return false;
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error checking purchased access:', error);
      return false;
    }
  };

  const handleActivationCodeSubmit = async () => {
    if (!activationCode.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    if (isBlocked) {
      Alert.alert('Access Blocked', 'Too many failed attempts. Please visit our store to purchase access.');
      return;
    }

    setIsValidating(true);
    try {
      console.log('🎬 SLIDESHOW_ACCESS: Validating activation code:', activationCode);
      
      // Use real API to validate the activation code
      const validationResult = await activationCodesAPI.validate(activationCode, undefined, id);
      
      if (validationResult.valid) {
        console.log('🎬 SLIDESHOW_ACCESS: Valid activation code:', validationResult);
        setValidatedCode(validationResult);
        // Store the activation code in AsyncStorage as a fallback
        await AsyncStorage.setItem('pending_activation_code', activationCode);
        
        // Check if user is authenticated
        if (isAuthenticated) {
          // User is logged in - attach code and redirect to slideshow player
          await handleAttachCodeAndRedirect(activationCode);
        } else {
          // User not logged in - start registration flow
          setShowRegistrationFlow(true);
        }
      } else {
        console.log('🎬 SLIDESHOW_ACCESS: Invalid activation code, attempt:', failedAttempts + 1);
        
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= 3) {
          console.log('🎬 SLIDESHOW_ACCESS: 3 failed attempts reached, blocking and redirecting to store');
          setIsBlocked(true);
          Alert.alert(
            'Access Blocked', 
            'You have entered an invalid activation code 3 times. You will be redirected to our store to purchase access.',
            [
              {
                text: 'Go to Store',
                onPress: () => {
                  router.replace('/store');
                }
              }
            ]
          );
        } else {
          const remainingAttempts = 3 - newFailedAttempts;
          Alert.alert(
            'Invalid Code', 
            `The activation code you entered is not valid. You have ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
          );
        }
        
        setActivationCode('');
      }
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAttachCodeAndRedirect = async (code: string) => {
    try {
      console.log('🎬 SLIDESHOW_ACCESS: Attaching code to user account:', code);
      await activationCodesAPI.attach(code);
      
      // Store the activation code for future access
      await AsyncStorage.setItem(`slideshow_access_${id}`, code);
      
      // Show slideshow with full access
      setIsFullAccess(true);
      setShowPreview(true);
      startAudio(); // Start audio for attached codes
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error attaching code:', error);
      Alert.alert('Error', 'Failed to link activation code to your account');
    }
  };

  const handlePreviewStart = () => {
    setIsFullAccess(false); // This is just a preview, not full access
    setShowPreview(true);
    setPreviewTimeLeft(30);
    setCurrentImageIndex(0);
    startAudio(); // Start audio for preview
  };

  const handlePreviewComplete = () => {
    stopAudio(); // Stop audio when preview completes
    // Redirect to store after preview
    setTimeout(() => {
      router.push('/store');
    }, 2000);
  };

  const handleGoToStore = () => {
    router.push('/store');
  };

  const startAudio = async () => {
    if (slideshow?.audioUrl && !soundRef.current) {
      try {
        console.log('🎵 SLIDESHOW_ACCESS: Starting audio playback:', slideshow.audioUrl);
        const { sound } = await Audio.Sound.createAsync(
          { uri: slideshow.audioUrl }, 
          { shouldPlay: true, isLooping: true }
        );
        soundRef.current = sound;
        console.log('🎵 SLIDESHOW_ACCESS: Audio started successfully');
      } catch (err) {
        console.warn('🎵 SLIDESHOW_ACCESS: Failed to load slideshow audio:', err);
      }
    }
  };

  const stopAudio = () => {
    if (soundRef.current) {
      console.log('🎵 SLIDESHOW_ACCESS: Stopping audio playback');
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  if (isLoading || !slideshow) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading slideshow...</ThemedText>
      </ThemedView>
    );
  }



  // For now, simplified registration flow - just show message
  if (showRegistrationFlow) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowRegistrationFlow(false)}>
            <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Registration Required</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.content}>
          <View style={styles.slideshowInfo}>
            <MaterialIcons name="account-circle" size={48} color="#3b82f6" />
            <Text style={styles.slideshowName}>Create Account</Text>
            <Text style={styles.slideshowSubtitle}>
              Registration flow would go here
            </Text>
            <TouchableOpacity
              style={styles.storePromoButton}
              onPress={() => {
                setShowRegistrationFlow(false);
                router.push('/auth/register');
              }}
            >
              <Text style={styles.storePromoButtonText}>Go to Registration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    );
  }

  if (showPreview) {
    return (
      <ThemedView style={styles.previewContainer}>
        <View style={styles.previewHeader}>
          {/* Only show header back button for limited previews, not full access */}
          {!isFullAccess && (
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => {
                stopAudio(); // Stop audio when going back
                setShowPreview(false);
                setIsFullAccess(false);
              }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          <Text style={styles.previewTitle}>{slideshow.name}</Text>
          {!isFullAccess && (
            <View style={styles.previewTimer}>
              <MaterialIcons name="timer" size={16} color="#f59e0b" />
              <Text style={styles.previewTimerText}>{previewTimeLeft}s</Text>
            </View>
          )}
          {isFullAccess && (
            <View style={styles.fullAccessBadge}>
              <MaterialIcons name="check-circle" size={16} color="#10b981" />
              <Text style={styles.fullAccessText}>Full Access</Text>
            </View>
          )}
        </View>

        <View style={styles.imageContainer}>
          {slideshow.images.length > 0 && (
            <Image
              source={{ uri: slideshow.images[currentImageIndex].imageUrl }}
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
          {!isFullAccess && (
            <>
              <TouchableOpacity
                style={styles.stopPreviewButton}
                onPress={() => {
                  stopAudio(); // Stop audio when stopping preview
                  setShowPreview(false);
                }}
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
            </>
          )}
          {isFullAccess && (
            <TouchableOpacity
              style={styles.fullAccessButton}
              onPress={() => {
                stopAudio(); // Stop audio when going back to slideshows
                router.back(); // Go directly back to slideshows
              }}
            >
              <MaterialIcons name="home" size={20} color="#fff" />
              <Text style={styles.fullAccessButtonText}>Back to Slideshows</Text>
            </TouchableOpacity>
          )}
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
    paddingTop: 50, // Account for status bar
  },
  backButton: {
    padding: 8,
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
  fullAccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  fullAccessText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
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
  fullAccessButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  fullAccessButtonText: {
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
  fullAccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  fullAccessButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
});
