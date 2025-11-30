

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
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Slideshow } from '@/shared/media-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { accessCodeAPI } from '@/services/api';
import { useRef } from 'react';
import PreviewPlayer from '@/components/PreviewPlayer';
import SlideshowPlayer from '@/components/SlideshowPlayer';
import { env } from '@/config/environment';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import { saveUserAge, getAgeForTracking } from '@/utils/ageStorage';
import { saveUserGender, getGenderForTracking } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';

export default function SlideshowAccessScreen() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { id } = route.params as { id: string };
  const { user, isAuthenticated, register, login } = useAuth();
  
  const [slideshow, setSlideshow] = useState<Slideshow | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState(30);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isFullAccess, setIsFullAccess] = useState(false); // Track if user has full access
  
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

  // Combined demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);

  // Format slideshow data for PreviewPlayer component - MUST be before any conditional returns
  const formattedMediaFiles = React.useMemo(() => {
    if (!slideshow?.images) {
      console.log('🎬 SLIDESHOW_ACCESS: No slideshow images found');
      return [];
    }
    
    const baseUrl = env.apiBaseUrl.replace('/api', '');
    
    console.log('🎬 SLIDESHOW_ACCESS: Formatting slideshow images:', slideshow.images);
    console.log('🎬 SLIDESHOW_ACCESS: Base URL:', baseUrl);
    console.log('🎬 SLIDESHOW_ACCESS: Slideshow autoplay interval:', slideshow.autoplayInterval, 'ms');
    
    // DEBUG: Log raw slideshow data
    console.log('🐛 DEBUG: Raw slideshow object:', JSON.stringify(slideshow, null, 2));
    console.log('🐛 DEBUG: slideshow.images array:', slideshow.images);
    console.log('🐛 DEBUG: slideshow.images.length:', slideshow.images.length);
    
    // Map images to media files for the preview player
    const imageFiles = slideshow.images.map((image: any, index: number) => {
      // The server now provides the correct streaming URL directly.
      // No client-side manipulation is needed.
      const streamUrl = image.url;
      
      console.log('🐛 DEBUG: Processing image', index + 1, ':', {
        id: image.id,
        url: streamUrl,
        caption: image.caption,
        displayOrder: image.displayOrder
      });
        
      console.log(`🎬 SLIDESHOW_ACCESS: Image ${index + 1}:`, {
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
        type: 'image' as 'image', // Add type property like the playlist does
        duration: slideshow.autoplayInterval || 5000,
      };
    });

    console.log('🐛 DEBUG: Final imageFiles array:', JSON.stringify(imageFiles, null, 2));
    console.log('🐛 DEBUG: About to return imageFiles, length:', imageFiles.length);

    // Don't add background audio as a separate media file
    // The PreviewPlayer will handle slideshow background audio separately
    // Just log the audio URL for debugging
    if (slideshow.audioUrl) {
      console.log('🎬 SLIDESHOW_ACCESS: Background audio available:', {
        audioUrl: slideshow.audioUrl
      });
      
      // Don't add to imageFiles array - PreviewPlayer will handle it separately
    }
    
    console.log('🎬 SLIDESHOW_ACCESS: Final formatted media files:', imageFiles);
    return imageFiles;
  }, [slideshow]);

  useEffect(() => {
    fetchSlideshow();
  }, [id]);

  // Fetch user demographics if authenticated
  useEffect(() => {
    const loadUserDemographics = async () => {
      if (isAuthenticated) {
        const demographics = await fetchUserDemographics();
        setUserDemographics(demographics);
      }
    };
    loadUserDemographics();
  }, [isAuthenticated]);

  // Show demographics survey ONLY for anonymous users OR authenticated users without demographics
  // Show AFTER content starts playing (with access code validated or full access granted)
  useEffect(() => {
    const checkAndShowSurvey = async () => {
      console.log('🔍 DEMOGRAPHICS: Checking if survey needed...', {
        hasSlideshow: !!slideshow,
        isLoading,
        isAuthenticated,
        userDemographics,
        showRegistrationFlow,
        showAppDownload,
      });
      
      // Only show survey after content is accessible
      if (!slideshow || isLoading) {
        console.log('🔍 DEMOGRAPHICS: Skipping - slideshow not loaded or still loading');
        return;
      }
      
      // Don't show during registration flow
      if (showRegistrationFlow || showAppDownload) {
        console.log('🔍 DEMOGRAPHICS: Skipping - in registration or app download flow');
        return;
      }
      
      // Check if survey is needed
      const needsSurvey = await shouldShowDemographicsSurvey(isAuthenticated, userDemographics);
      console.log('🔍 DEMOGRAPHICS: Survey needed?', needsSurvey);
      
      if (needsSurvey) {
        console.log('🔍 DEMOGRAPHICS: Setting 5-second timer for survey (testing)...');
        // Show survey after 5 seconds of content being accessible (TESTING - will be 15s in production)
        const timer = setTimeout(() => {
          console.log('✅ DEMOGRAPHICS: Showing survey now!');
          setShowDemographicsSurvey(true);
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        console.log('🔍 DEMOGRAPHICS: Survey not needed - user already has demographics');
      }
    };
    
    checkAndShowSurvey();
  }, [slideshow, isLoading, isAuthenticated, userDemographics, showRegistrationFlow, showAppDownload]);

  // Attempt browser geolocation shortly after load and submit
  useEffect(() => {
    const submitGeo = async () => {
      try {
        const qrId = (slideshow as any)?.qr_code_id || (slideshow as any)?.qrCodeId;
        if (!qrId) return;
        if (!('geolocation' in navigator)) return;
        const getPos = () => new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 60000, timeout: 4000 })
        );
        const pos = await getPos();
        const { analyticsService } = await import('@/services/analyticsService');
        await analyticsService.submitBrowserGeo(
          Number(qrId), pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined
        );
      } catch (_e) {
        // ignore failures
      }
    };
    if (slideshow && !isLoading) {
      const t = setTimeout(submitGeo, 1500);
      return () => clearTimeout(t);
    }
  }, [slideshow, isLoading]);

  // Check access after slideshow is loaded or user authentication changes
  useEffect(() => {
    if (slideshow) {
      checkExistingAccess();
    }
  }, [slideshow, isAuthenticated, user]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
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

  // Note: Image cycling is now handled by PreviewPlayer component
  // This effect is no longer needed as PreviewPlayer handles the slideshow cycling
  // useEffect(() => {
  //   let interval: NodeJS.Timeout;
  //   
  //   if (showPreview && slideshow) {
  //     interval = setInterval(() => {
  //       setCurrentImageIndex(prev => 
  //         prev >= slideshow.images.length - 1 ? 0 : prev + 1
  //       );
  //     }, 3000); // Change image every 3 seconds
  //   }
  //
  //   return () => {
  //     if (interval) clearInterval(interval);
  //   };
  // }, [showPreview, slideshow]);

  // Cleanup audio when component unmounts
  useEffect(() => {
    // This effect can be used for other cleanup if needed
  }, []);

  const fetchSlideshow = async (activationCode?: string) => {
    try {
      console.log('🎬 SLIDESHOW_ACCESS: Fetching slideshow with ID:', id);

      const { slideshowAccessAPI } = await import('@/services/api');
      
      // Use provided activation code or check state
      const activationCodeToUse = activationCode || validatedCode?.code;
      console.log('🎬 SLIDESHOW_ACCESS: Using activation code for access:', activationCodeToUse || 'none');
      
      const slideshowData = await slideshowAccessAPI.getByIdForAccess(id, activationCodeToUse);

      console.log('🎬 SLIDESHOW_ACCESS: Raw API response:', slideshowData);
      console.log('🎬 SLIDESHOW_ACCESS: Response type:', typeof slideshowData);
      console.log('🎬 SLIDESHOW_ACCESS: Response keys:', slideshowData ? Object.keys(slideshowData) : 'null/undefined');
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow name from API:', slideshowData?.name);
      console.log('🎬 SLIDESHOW_ACCESS: Images array from API:', slideshowData?.images);
      console.log('🎬 SLIDESHOW_ACCESS: Images count from API:', slideshowData?.images?.length || 0);
      
      if (slideshowData?.images && slideshowData.images.length > 0) {
        console.log('🎬 SLIDESHOW_ACCESS: First image sample:', slideshowData.images[0]);
      }
      
      if (!slideshowData) {
        console.error('🎬 SLIDESHOW_ACCESS: No slideshow data received');
        setError('Slideshow not found');
        return;
      }

      console.log('🎬 SLIDESHOW_ACCESS: Loaded slideshow:', slideshowData);
      // NOTE: Tracking is done in slideshow-player screen to avoid duplicate scans
      // when redirecting from slideshow-access to slideshow-player
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow name:', slideshowData?.name);
      console.log('🎬 SLIDESHOW_ACCESS: Slideshow images:', slideshowData?.images);
      console.log('🎬 SLIDESHOW_ACCESS: Images length:', slideshowData?.images?.length);
      console.log('🎬 SLIDESHOW_ACCESS: requiresActivationCode:', slideshowData?.requiresActivationCode);

      // Check if access is restricted
      if (slideshowData.accessRestricted) {
        console.log('🎬 SLIDESHOW_ACCESS: Access is restricted, showing access options');
        // Map snake_case fields to camelCase for frontend compatibility
        const mappedSlideshow = {
          ...slideshowData,
          audioUrl: slideshowData.audio_url || slideshowData.audioUrl,
          requiresActivationCode: slideshowData.requires_activation_code || slideshowData.requiresActivationCode,
          autoplayInterval: slideshowData.autoplay_interval || slideshowData.autoplayInterval,
          // Ensure creator userId is available for store routing
          userId: slideshowData.user_id || slideshowData.userId
        };
        setSlideshow(mappedSlideshow);
        // Don't set isFullAccess to true - user needs to enter activation code
      } else {
        console.log('🎬 SLIDESHOW_ACCESS: Full access granted');
        // Map snake_case fields to camelCase for frontend compatibility
        const mappedSlideshow = {
          ...slideshowData,
          audioUrl: slideshowData.audio_url || slideshowData.audioUrl,
          requiresActivationCode: slideshowData.requires_activation_code || slideshowData.requiresActivationCode,
          autoplayInterval: slideshowData.autoplay_interval || slideshowData.autoplayInterval,
          // Ensure creator userId is available for store routing
          userId: slideshowData.user_id || slideshowData.userId
        };
        setSlideshow(mappedSlideshow);
        // Access is granted, user can view slideshow
      }

      // Log images from server
      if (slideshowData.images) {
        console.log('🎬 SLIDESHOW_ACCESS: Images from server:', slideshowData.images);
        
        // Test first image URL if available
        if (slideshowData.images.length > 0) {
          const firstImage = slideshowData.images[0];
          console.log('🎬 SLIDESHOW_ACCESS: Testing first image URL:', firstImage.url);
          fetch(firstImage.url, { method: 'HEAD' })
            .then(response => {
              console.log('🎬 SLIDESHOW_ACCESS: First image URL test response:', {
                status: response.status,
                statusText: response.statusText,
                url: firstImage.url
              });
            })
            .catch(error => {
              console.error('🎬 SLIDESHOW_ACCESS: First image URL test failed:', error);
            });
        }
      }

    } catch (error: any) {
      console.error('🎬 SLIDESHOW_ACCESS: Error fetching slideshow:', error);
      
      // Handle 403 errors specifically - this means slideshow exists but access is denied
      if (error.response && error.response.status === 403) {
        console.log('🎬 SLIDESHOW_ACCESS: 403 error - slideshow exists but access denied, showing access form');
        // Create a minimal slideshow object so the access form can be shown
        const minimalSlideshow: Slideshow = {
          id: parseInt(id),
          uniqueId: id,
          name: 'Protected Slideshow',
          requiresActivationCode: true,
          images: [],
          description: 'This slideshow requires an activation code to access.',
          audioUrl: '',
          autoplayInterval: 5000,
          transition: 'fade',
          createdAt: new Date().toISOString(),
        };
        setSlideshow(minimalSlideshow);
      } else {
        // Handle other errors
        const errorMessage = error.response?.data?.error || error.message || 'Failed to load slideshow';
        Alert.alert('Error', errorMessage);
      }
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

      // CRITICAL CHECK: If slideshow doesn't require activation code, redirect directly to slideshow player
      const requiresCode = slideshow.requiresActivationCode;
      if (!requiresCode) {
        console.log('🎬 SLIDESHOW_ACCESS: Slideshow is NOT protected, redirecting directly to slideshow player');
        router.replace(`/slideshow-player/${id}`);
        return;
      }

      console.log('🎬 SLIDESHOW_ACCESS: Slideshow IS protected, checking for existing access');
      
      // First check if user is authenticated and has access codes attached to their profile
      if (isAuthenticated && user) {
        console.log('🎬 SLIDESHOW_ACCESS: User is authenticated, checking profile access codes');
        console.log('🎬 SLIDESHOW_ACCESS: User details:', { userId: user.id, username: user.username });
        console.log('🎬 SLIDESHOW_ACCESS: Looking for access to slideshow ID:', id, 'as number:', parseInt(id));
        try {
          const response: any = await accessCodeAPI.getMyAccess();
          const userAccessCodes = Array.isArray(response) ? response : response?.accessCodes || [];
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
            console.log('🎬 SLIDESHOW_ACCESS: User has valid access code for this slideshow, redirecting directly to slideshow player');
            // Redirect directly to slideshow player for users with valid access codes
            router.replace(`/slideshow-player/${id}`);
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
          const validationResult = await accessCodeAPI.validate(storedCode, undefined, id);
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
        console.log('🎬 SLIDESHOW_ACCESS: User has purchased access, redirecting directly to slideshow player');
        router.replace(`/slideshow-player/${id}`);
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
      
      const validationResult = await accessCodeAPI.validate(activationCode, undefined, id);
      
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
          // User not logged in but has valid code - grant guest access
          console.log('🎬 SLIDESHOW_ACCESS: Granting guest access with valid activation code');
          
          // Refetch slideshow data with the validated activation code
          console.log('🎬 SLIDESHOW_ACCESS: Refetching slideshow with validated activation code');
          await fetchSlideshow(activationCode);
          
          setIsFullAccess(true);
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
                  const storeUrl = slideshow?.userId ? `/store/user/${slideshow.userId}` : '/store/master';
                  router.replace(storeUrl);
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
      await accessCodeAPI.attach(code);
      
      // Store the activation code for future access
      await AsyncStorage.setItem(`slideshow_access_${id}`, code);
      
      // Redirect directly to slideshow player with full access
      console.log('🎬 SLIDESHOW_ACCESS: Code attached successfully, redirecting to slideshow player');
      router.replace(`/slideshow-player/${id}`);
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error attaching code:', error);
      Alert.alert('Error', 'Failed to link activation code to your account');
    }
  };

  const handlePreviewStart = async () => {
    console.log('🎬 SLIDESHOW_ACCESS: Starting slideshow preview');
    try {
      setIsLoading(true);
      const { slideshowAccessAPI } = await import('@/services/api');
      const previewData = await slideshowAccessAPI.getByIdForPreview(id);
      
      if (previewData && previewData.images && previewData.images.length > 0) {
        // Normalize fields for preview as well (userId required for creator store link)
        const mappedPreview = {
          ...previewData,
          audioUrl: previewData.audio_url || previewData.audioUrl,
          requiresActivationCode: previewData.requires_activation_code || previewData.requiresActivationCode,
          autoplayInterval: previewData.autoplay_interval || previewData.autoplayInterval,
          userId: previewData.user_id || previewData.userId,
        } as any;
        setSlideshow(mappedPreview);
        setShowPreview(true);
      } else {
        Alert.alert('Preview Not Available', 'There are no images in this slideshow to preview.');
      }
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error fetching slideshow preview:', error);
      Alert.alert('Error', 'Failed to load slideshow preview. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewComplete = () => {
    console.log('🎬 SLIDESHOW_ACCESS: Preview completed, returning to access screen');
    setShowPreview(false);

    // Redirect to the slideshow creator's store after preview
    const storeUrl = slideshow?.userId ? `/store/user/${slideshow.userId}` : '/store/master';
    
    Alert.alert(
      '⏰ Preview Complete',
      'Your 30-second preview has ended. Enter an activation code for full access or visit the creator\'s store.',
      [
        { text: 'Enter Code', style: 'default' },
        { text: 'Visit Store', onPress: () => router.push(storeUrl) }
      ]
    );
  };

  const handleGoToStore = () => {
    // Redirect to the slideshow creator's store
    const storeUrl = slideshow?.userId ? `/store/user/${slideshow.userId}` : '/store/master';
    router.push(storeUrl);
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
        <PreviewPlayer
          mediaFiles={formattedMediaFiles}
          playlistName={slideshow.name}
          playlistId={slideshow.id.toString()}
          autoplay={false}
          previewDuration={30}
          onPreviewComplete={handlePreviewComplete}
          backgroundAudioUrl={slideshow.audioUrl}
          userId={slideshow.userId}
        />
      </ThemedView>
    );
  }



  // Full access mode with guest access and visible auth options
  if (isFullAccess && slideshow) {
    return (
      <ThemedView style={styles.fullAccessContainer}>
        {/* Guest Access Header with Sign-up/Sign-in Options */}
        {!isAuthenticated && (
          <View style={styles.guestAccessHeader}>
            <View style={styles.guestAccessContent}>
              <Text style={styles.guestAccessText}>
                You're viewing as a guest with your activation code
              </Text>
              <View style={styles.authButtonsContainer}>
                <TouchableOpacity
                  style={styles.signInButton}
                  onPress={() => router.push('/auth/login')}
                >
                  <Text style={styles.signInButtonText}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.signUpButton}
                  onPress={() => router.push('/auth/register')}
                >
                  <Text style={styles.signUpButtonText}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        
        {/* Full Slideshow Player */}
        {(() => {
          console.log('🎬 SLIDESHOW_ACCESS: Passing slideshow to SlideshowPlayer:', slideshow);
          console.log('🎬 SLIDESHOW_ACCESS: Slideshow name:', slideshow?.name);
          console.log('🎬 SLIDESHOW_ACCESS: Slideshow images:', slideshow?.images);
          console.log('🎬 SLIDESHOW_ACCESS: Images count:', slideshow?.images?.length || 0);
          return null;
        })()}
        <SlideshowPlayer
          slideshowId={id}
          slideshow={slideshow}
          autoPlay={false}
        />
      </ThemedView>
    );
  }

  // Demographics survey handler
  const handleDemographicsSubmit = async (demographics: { ageRange: string; gender: string }) => {
    console.log('👤 SLIDESHOW_ACCESS: User provided demographics:', demographics);
    
    try {
      // Save demographics (to profile if authenticated, localStorage if anonymous)
      await saveDemographics(
        demographics,
        isAuthenticated,
        (ageRange, gender) => {
          saveUserAge(ageRange);
          saveUserGender(gender);
        }
      );
      
      // Update local state if authenticated
      if (isAuthenticated) {
        setUserDemographics(demographics);
      }
      
      // Re-track the scan with the new demographics
      try {
        const qrId = slideshow?.qr_code_id || slideshow?.qrCodeId;
        if (qrId) {
          console.log('📊 SLIDESHOW_ACCESS: Re-tracking scan with new demographics...');
          await analyticsService.trackQRScan(Number(qrId), {
            userAge: demographics.ageRange,
            userGender: demographics.gender,
          });
          console.log('✅ SLIDESHOW_ACCESS: Scan re-tracked with demographics!');
        }
      } catch (e) {
        console.warn('Failed to re-track scan with demographics:', e);
      }
      
      setShowDemographicsSurvey(false);
    } catch (error) {
      console.error('❌ SLIDESHOW_ACCESS: Error in demographics submit:', error);
      setShowDemographicsSurvey(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Access Required</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Make the content scrollable so small screens can reach the store link */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
      <View style={styles.content}>
        {/* Slideshow Info */}
        <View style={styles.slideshowInfo}>
          <MaterialIcons name="slideshow" size={48} color="#3b82f6" />
          <Text style={styles.slideshowName}>{slideshow.name}</Text>
          <Text style={styles.slideshowSubtitle}>
            {slideshow.images?.length || 0} images | Premium Content
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

          {/* Go to Store Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="storefront" size={24} color="#8b5cf6" />
              <Text style={styles.optionTitle}>Visit Our Store</Text>
            </View>
            <Text style={styles.optionDescription}>
              If you don't have an activation code, you can visit our store to purchase one.
            </Text>
            <TouchableOpacity
              style={styles.storePromoButton}
              onPress={handleGoToStore}
            >
              <Text style={styles.storePromoButtonText}>Visit Store</Text>
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
      </ScrollView>

      {/* Demographics Survey Overlay */}
      <DemographicsSurveyOverlay
        visible={showDemographicsSurvey}
        artistName={slideshow?.creatorName || slideshow?.username}
        onSubmit={handleDemographicsSubmit}
      />
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
    backgroundColor: '#f8fafc',
  },
  previewMainContent: {
    flex: 1,
    padding: 20,
  },
  fullPanel: {
    flex: 1,
    flexDirection: 'column',
    gap: 20,
  },
  mediaSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chatSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 400,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
    flex: 1,
  },
  chatBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  chatBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  chatMessages: {
    flex: 1,
    maxHeight: 200,
    marginBottom: 16,
  },
  chatEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  chatEmptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  chatInputWrapper: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
  },
  chatInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
    backgroundColor: '#f9fafb',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.5,
  },
  chatInputFooter: {
    marginTop: 4,
  },
  chatInputHint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  },
  chatAuthPrompt: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  chatAuthText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  chatAuthButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  chatAuthButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingTop: 50, // Account for status bar
  },
  previewBackButton: {
    padding: 8,
  },
  previewHeaderContent: {
    flex: 1,
    alignItems: 'center',
  },
  previewSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  backButton: {
    padding: 8,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
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
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    flex: 1,
    width: '100%',
    resizeMode: 'contain',
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
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48, // ensure last button isn’t obscured by browser toolbars
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
  // New styles for guest access with full player
  fullAccessContainer: {
    flex: 1,
  },
  guestAccessHeader: {
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  guestAccessContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestAccessText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
    flex: 1,
    minWidth: 200,
  },
  authButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  signInButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  signInButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  signUpButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  signUpButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
