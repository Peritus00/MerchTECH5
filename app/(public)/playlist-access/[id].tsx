import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist } from '@/shared/media-schema';
import MediaPlayer from '@/components/MediaPlayer';
import PreviewPlayer from '@/components/PreviewPlayer';
import PlaylistPlayer from '@/components/PlaylistPlayer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { accessCodeAPI, playlistAccessAPI } from '@/services/api';
import { env } from '@/config/environment';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import PreviewGateModal from '@/components/PreviewGateModal';
import BuyActivationCodeModal from '@/components/BuyActivationCodeModal';
import LockedAccessSignupModal from '@/components/LockedAccessSignupModal';
import { saveUserAge, getAgeForTracking } from '@/utils/ageStorage';
import { saveUserGender, getGenderForTracking } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';

export default function PlaylistAccessScreen() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { id } = route.params as { id: string };
  const previewQuery = useLocalSearchParams<{ previewVerified?: string; previewToken?: string }>();
  const smsAutoPreviewStartedRef = useRef(false);
  const { user, isAuthenticated, register, login } = useAuth();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPreviewGateModal, setShowPreviewGateModal] = useState(false);
  const [previewCompleted, setPreviewCompleted] = useState(false);
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
  const [showBuyCodeModal, setShowBuyCodeModal] = useState(false);
  const [showLockedAccessSignup, setShowLockedAccessSignup] = useState(false);

  useEffect(() => {
    fetchPlaylist();
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

  // Check access after playlist is loaded or user authentication changes
  useEffect(() => {
    if (playlist) {
      checkExistingAccess();
    }
  }, [playlist, isAuthenticated, user]);

  // Attempt browser geolocation shortly after load and submit
  useEffect(() => {
    const submitGeo = async () => {
      try {
        const qrId = (playlist as any)?.qr_code_id || (playlist as any)?.qrCodeId;
        if (!qrId) return;
        if (!('geolocation' in navigator)) return;
        
        // Check if geolocation is allowed via Permissions API (avoids Permissions-Policy violation logs)
        try {
          if ('permissions' in navigator) {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            if (permissionStatus.state === 'denied') {
              // Permission explicitly denied, don't attempt geolocation
              return;
            }
          }
        } catch (permError) {
          // Permissions API not available or blocked, continue to try geolocation anyway
        }
        
        // Check if geolocation is allowed (may be blocked by Permissions-Policy)
        const getPos = () => new Promise<GeolocationPosition>((resolve, reject) => {
          // Set a timeout to prevent hanging
          const timeoutId = setTimeout(() => {
            reject(new Error('Geolocation timeout'));
          }, 3000);
          
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeoutId);
              resolve(pos);
            },
            (err) => {
              clearTimeout(timeoutId);
              reject(err);
            },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 3000 }
          );
        });
        
        const pos = await getPos();
        await (await import('@/services/analyticsService')).analyticsService.submitBrowserGeo(
          Number(qrId), pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined
        );
      } catch (error: any) {
        // Silently ignore geolocation errors (permissions policy, user denial, timeout, etc.)
        // Don't log or throw - geolocation is optional
        if (process.env.NODE_ENV === 'development') {
          console.debug('Geolocation not available:', error?.message || 'unknown error');
        }
      }
    };
    if (playlist && !isLoading) {
      const t = setTimeout(submitGeo, 1500);
      return () => clearTimeout(t);
    }
  }, [playlist, isLoading]);

  // Show demographics survey ONLY for anonymous users OR authenticated users without demographics
  // Show AFTER content starts playing (with access code validated or full access granted)
  useEffect(() => {
    const checkAndShowSurvey = async () => {
      console.log('🔍 DEMOGRAPHICS: Checking if survey needed...', {
        hasPlaylist: !!playlist,
        isLoading,
        isAuthenticated,
        userDemographics,
        showRegistrationFlow,
        showAppDownload,
      });
      
      // Only show survey after content is accessible
      if (!playlist || isLoading) {
        console.log('🔍 DEMOGRAPHICS: Skipping - playlist not loaded or still loading');
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
  }, [playlist, isLoading, isAuthenticated, userDemographics, showRegistrationFlow, showAppDownload]);

  const fetchPlaylist = async () => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: Fetching playlist with ID:', id);

      const { playlistAccessAPI } = await import('@/services/api');
      
      // Check if we have a validated activation code to use
      const activationCodeToUse = validatedCode?.code;
      console.log('🔴 PLAYLIST_ACCESS: Using activation code for access:', activationCodeToUse || 'none');
      
      const playlistData = await playlistAccessAPI.getByIdForAccess(id, activationCodeToUse);

      console.log('🔴 PLAYLIST_ACCESS: API response:', playlistData);

      // Normalize server response to ensure creator userId is present
      const mappedPlaylist = playlistData
        ? {
            ...playlistData,
            userId: playlistData.user_id || playlistData.userId,
            previewCouponId: playlistData.preview_coupon_id ?? playlistData.previewCouponId ?? null,
          }
        : null;

      // Log media files from server (URLs are now correct from server)
      if (playlistData.mediaFiles) {
        console.log('🔴 PLAYLIST_ACCESS: Media files from server:', playlistData.mediaFiles);
        
        // Media files are ready for use
      }

      setPlaylist(mappedPlaylist);

      // NOTE: Tracking is done in playlist-player screen to avoid duplicate scans
      // when redirecting from playlist-access to playlist-player
    } catch (error: any) {
      console.error('🔴 PLAYLIST_ACCESS: Error fetching playlist:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load playlist';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingAccess = async () => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: ===== STARTING ACCESS CHECK =====');
      console.log('🔴 PLAYLIST_ACCESS: Checking for existing access to playlist:', id);
      console.log('🔴 PLAYLIST_ACCESS: Current user state:', { isAuthenticated, userId: user?.id, username: user?.username });
      
      // Wait for playlist to be loaded before checking protection status
      if (!playlist) {
        console.log('🔴 PLAYLIST_ACCESS: Playlist not loaded yet, waiting...');
        return;
      }

      console.log('🔴 PLAYLIST_ACCESS: Playlist loaded:', {
        id: playlist.id,
        name: playlist.name,
        requiresActivationCode: playlist.requiresActivationCode,
        mediaFiles: playlist.mediaFiles?.length || 0
      });

      // CRITICAL CHECK: If playlist doesn't require activation code, go directly to playlist player
      if (!playlist.requiresActivationCode) {
        console.log('🔴 PLAYLIST_ACCESS: Playlist is NOT protected, redirecting directly to playlist player');
        const token = (playlist as any).playbackToken;
        if (token) {
          await AsyncStorage.setItem(`playlist_playback_token_${id}`, token);
        }
        router.replace(`/playlist-player/${id}`);
        return;
      }

      console.log('🔴 PLAYLIST_ACCESS: ⚠️  PLAYLIST IS PROTECTED - checking for existing access');
      
      // If user just logged in with a pending activation code, attach it and redirect
      if (isAuthenticated && user) {
        const pendingCode = await AsyncStorage.getItem('pending_activation_code');
        if (pendingCode) {
          try {
            const validationResult = await accessCodeAPI.validate(pendingCode, id, undefined);
            if (validationResult.valid) {
              await accessCodeAPI.attach(pendingCode);
              await AsyncStorage.removeItem('pending_activation_code');
              await AsyncStorage.setItem(`playlist_access_${id}`, pendingCode);
              try {
                const { playbackToken } = await playlistAccessAPI.issuePlaybackToken(id, pendingCode);
                if (playbackToken) await AsyncStorage.setItem(`playlist_playback_token_${id}`, playbackToken);
              } catch (e) { /* non-blocking */ }
              router.replace(`/playlist-player/${id}`);
              return;
            }
          } catch (e) {
            console.warn('🔴 PLAYLIST_ACCESS: Failed to attach pending code:', e);
          }
        }
        console.log('🔴 PLAYLIST_ACCESS: User is authenticated, checking profile access codes');
        console.log('🔴 PLAYLIST_ACCESS: User details:', { userId: user.id, username: user.username });
        console.log('🔴 PLAYLIST_ACCESS: Looking for access to playlist ID:', id, 'as number:', parseInt(id));
        try {
          const userAccessCodes = await accessCodeAPI.getMyAccess();
          console.log('🔴 PLAYLIST_ACCESS: User access codes response:', userAccessCodes);
          console.log('🔴 PLAYLIST_ACCESS: Number of access codes found:', userAccessCodes?.length || 0);

          if (userAccessCodes && userAccessCodes.length > 0) {
            userAccessCodes.forEach((accessCode: any, index: number) => {
              console.log(`🔴 PLAYLIST_ACCESS: Access code ${index + 1}:`, {
                id: accessCode.id,
                code: accessCode.code,
                playlist_id: accessCode.playlist_id,
                playlistId: accessCode.playlistId,
                playlist_name: accessCode.playlist_name,
                content_type: accessCode.content_type
              });
            });
          }
          
          // Check if any of the user's access codes are valid for this playlist
          const hasValidAccess = userAccessCodes.some((accessCode: any) => {
            const playlistIdMatch = accessCode.playlist_id === parseInt(id) || accessCode.playlistId === parseInt(id);
            console.log(`🔴 PLAYLIST_ACCESS: Checking access code ${accessCode.code} - playlist_id: ${accessCode.playlist_id}, target: ${parseInt(id)}, match: ${playlistIdMatch}`);
            return playlistIdMatch;
          });
          
          console.log('🔴 PLAYLIST_ACCESS: Has valid access result:', hasValidAccess);
          
          if (hasValidAccess) {
            console.log('🔴 PLAYLIST_ACCESS: User has valid access code for this playlist, redirecting to playlist player');
            try {
              const { playbackToken } = await playlistAccessAPI.issuePlaybackToken(id);
              if (playbackToken) await AsyncStorage.setItem(`playlist_playback_token_${id}`, playbackToken);
            } catch (e) { /* non-blocking */ }
            router.replace(`/playlist-player/${id}`);
            return;
          } else {
            console.log('🔴 PLAYLIST_ACCESS: User has no valid access codes for this playlist');
          }
        } catch (error) {
          console.error('🔴 PLAYLIST_ACCESS: Error checking user access codes:', error);
          // Continue with other checks if API call fails
        }
      } else {
        console.log('🔴 PLAYLIST_ACCESS: User not authenticated:', { isAuthenticated, hasUser: !!user });
      }
      
      // Check if user has a stored activation code for this playlist (fallback)
      console.log('🔴 PLAYLIST_ACCESS: Checking AsyncStorage for stored code...');
      const storedCode = await AsyncStorage.getItem(`playlist_access_${id}`);
      if (storedCode) {
        console.log('🔴 PLAYLIST_ACCESS: ⚠️  FOUND STORED CODE - This could be the bypass issue!');
        console.log('🔴 PLAYLIST_ACCESS: Stored code:', storedCode);
        console.log('🔴 PLAYLIST_ACCESS: Validating stored code with server...');
        
        // SECURITY FIX: Validate the stored code before trusting it
        try {
          const validationResult = await accessCodeAPI.validate(storedCode, id);
          console.log('🔴 PLAYLIST_ACCESS: Validation result:', validationResult);
          
          if (validationResult.valid) {
            console.log('🔴 PLAYLIST_ACCESS: ❌ SECURITY BYPASS DETECTED! Stored code is still valid - this is why user bypasses access screen');
            console.log('🔴 PLAYLIST_ACCESS: User previously had access but it was removed from their profile');
            console.log('🔴 PLAYLIST_ACCESS: The stored code should be invalidated when removed from profile');
            
            // For now, let's remove the stored code to fix the bypass
            console.log('🔴 PLAYLIST_ACCESS: 🔒 SECURITY FIX: Removing stored code to prevent bypass');
            await AsyncStorage.removeItem(`playlist_access_${id}`);
            console.log('🔴 PLAYLIST_ACCESS: Stored code removed - user will now see access screen');
            
            // Don't redirect to media player - show access screen instead
            // router.replace(`/media-player/${id}`);
            // return;
          } else {
            console.log('🔴 PLAYLIST_ACCESS: ✅ Stored activation code is no longer valid, removing from storage');
            await AsyncStorage.removeItem(`playlist_access_${id}`);
          }
        } catch (error) {
          console.error('🔴 PLAYLIST_ACCESS: ❌ Error validating stored code:', error);
          console.log('🔴 PLAYLIST_ACCESS: Removing invalid stored code due to validation error');
          // Remove invalid stored code
          await AsyncStorage.removeItem(`playlist_access_${id}`);
        }
      } else {
        console.log('🔴 PLAYLIST_ACCESS: ✅ No stored code found in AsyncStorage');
      }

      // Check if user has purchased access (you can implement this based on your payment system)
      const hasPurchasedAccess = await checkPurchasedAccess(id);
      if (hasPurchasedAccess) {
        console.log('🔴 PLAYLIST_ACCESS: User has purchased access, redirecting to playlist player');
        try {
          const { playbackToken } = await playlistAccessAPI.issuePlaybackToken(id);
          if (playbackToken) await AsyncStorage.setItem(`playlist_playback_token_${id}`, playbackToken);
        } catch (e) { /* non-blocking */ }
        router.replace(`/playlist-player/${id}`);
        return;
      }

      console.log('🔴 PLAYLIST_ACCESS: ===== ACCESS CHECK COMPLETE =====');
      console.log('🔴 PLAYLIST_ACCESS: ✅ No existing access found for protected content, showing access options');
      console.log('🔴 PLAYLIST_ACCESS: User will see the activation code input screen');
    } catch (error) {
      console.error('🔴 PLAYLIST_ACCESS: ❌ Error checking existing access:', error);
    }
  };

  const checkPurchasedAccess = async (playlistId: string): Promise<boolean> => {
    try {
      // TODO: Implement actual API call to check if user has purchased access
      // This could check against your payment/subscription system
      // For now, returning false to show access options
      return false;
    } catch (error) {
      console.error('🔴 PLAYLIST_ACCESS: Error checking purchased access:', error);
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
      console.log('🎵 PLAYLIST_ACCESS: Validating activation code:', activationCode);
      const validationResult = await accessCodeAPI.validate(activationCode, id, undefined);

      if (validationResult.valid) {
        console.log('🎵 PLAYLIST_ACCESS: Valid activation code:', validationResult);
        setValidatedCode(validationResult);
        const trimmedCode = activationCode.trim();
        await AsyncStorage.setItem('pending_activation_code', trimmedCode);
        
        // Check if user is authenticated
        if (isAuthenticated) {
          // User is logged in - attach code and redirect to media player
          await handleAttachCodeAndRedirect(trimmedCode);
        } else {
          setActivationCode(trimmedCode);
          setShowLockedAccessSignup(true);
        }
      } else {
        console.log('🎵 PLAYLIST_ACCESS: Invalid activation code');
        Alert.alert('Invalid Code', 'The activation code you entered is not valid for this playlist.');
        
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= 3) {
          console.log('🔴 PLAYLIST_ACCESS: 3 failed attempts reached, blocking and redirecting to store');
          setIsBlocked(true);
          Alert.alert(
            'Access Blocked', 
            'You have entered an invalid activation code 3 times. You will be redirected to our store to purchase access.',
            [
              {
                text: 'Go to Store',
                onPress: () => {
                  const storeUrl = playlist?.userId ? `/store/user/${playlist.userId}` : '/store/master';
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
      console.error('🔴 PLAYLIST_ACCESS: Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAttachCodeAndRedirect = async (code: string) => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: Attaching code to user account:', code);
      await accessCodeAPI.attach(code);
      
      // Store the activation code for future access
      await AsyncStorage.setItem(`playlist_access_${id}`, code);
      
      try {
        const { playbackToken } = await playlistAccessAPI.issuePlaybackToken(id, code);
        if (playbackToken) await AsyncStorage.setItem(`playlist_playback_token_${id}`, playbackToken);
      } catch (e) { /* non-blocking */ }
      
      // Redirect to playlist player
      router.replace(`/playlist-player/${id}`);
    } catch (error) {
      console.error('🔴 PLAYLIST_ACCESS: Error attaching code:', error);
      Alert.alert('Error', 'Failed to link activation code to your account');
    }
  };

  const handleLockedAccessCompleted = async (code: string) => {
    await AsyncStorage.setItem(`playlist_access_${id}`, code);
    await AsyncStorage.removeItem('pending_activation_code');
    try {
      const { playbackToken } = await playlistAccessAPI.issuePlaybackToken(id, code);
      if (playbackToken) await AsyncStorage.setItem(`playlist_playback_token_${id}`, playbackToken);
    } catch (e) { /* non-blocking */ }
    router.replace(`/playlist-player/${id}`);
  };

  const handleRegistrationSubmit = async () => {
    const { email, password, confirmPassword, username, firstName } = registrationData;
    
    // Validation
    if (!email || !password || !username) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setIsRegistering(true);
    try {
      console.log('🔴 PLAYLIST_ACCESS: Creating new user account');
      const result = await register(email, password, username, firstName);
      
      if (result.success) {
        console.log('🔴 PLAYLIST_ACCESS: Registration successful, attaching activation code');
        // Try to get the pending activation code from AsyncStorage
        let codeToAttach = activationCode;
        try {
          const pendingCode = await AsyncStorage.getItem('pending_activation_code');
          if (pendingCode) {
            codeToAttach = pendingCode;
          }
        } catch (e) { /* ignore */ }
        if (codeToAttach) {
          await accessCodeAPI.attach(codeToAttach);
          await AsyncStorage.removeItem('pending_activation_code');
        }
        // Show app download screen
        setShowRegistrationFlow(false);
        setShowAppDownload(true);
      } else {
        Alert.alert('Registration Failed', result.error || 'Failed to create account');
      }
    } catch (error: any) {
      console.error('🔴 PLAYLIST_ACCESS: Registration error:', error);
      Alert.alert('Registration Failed', error.message || 'Failed to create account');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleHaveAccountLogin = async () => {
    const { email, password } = registrationData;
    
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }

    setIsRegistering(true);
    try {
      console.log('🔴 PLAYLIST_ACCESS: Logging in existing user');
      await login(email, password);
      
      console.log('🔴 PLAYLIST_ACCESS: Login successful, attaching activation code');
      
      // Try to get the pending activation code from AsyncStorage
      let codeToAttach = activationCode;
      try {
        const pendingCode = await AsyncStorage.getItem('pending_activation_code');
        if (pendingCode) {
          codeToAttach = pendingCode;
        }
      } catch (e) { /* ignore */ }
      if (codeToAttach) {
        await accessCodeAPI.attach(codeToAttach);
        await AsyncStorage.removeItem('pending_activation_code');
      }
      
      // Show app download screen
      setShowRegistrationFlow(false);
      setShowAppDownload(true);
    } catch (error: any) {
      console.error('🔴 PLAYLIST_ACCESS: Login error:', error);
      Alert.alert('Login Failed', error.message || 'Invalid email or password');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDownloadApp = () => {
    // Open app store or provide download links
    const appStoreUrl = 'https://apps.apple.com/app/your-app'; // Replace with actual URL
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=your.app'; // Replace with actual URL
    
    Alert.alert(
      '🎉 Your Access Code is Saved!',
      'Your activation code is now linked to your profile! Download the app and sign in with your email to access your content anywhere, or continue in the web player.',
      [
        {
          text: '📱 iOS App Store',
          onPress: () => Linking.openURL(appStoreUrl),
        },
        {
          text: '📱 Google Play',
          onPress: () => Linking.openURL(playStoreUrl),
        },
        {
          text: '🌐 Continue in Web',
          onPress: () => router.replace(`/playlist-player/${id}`),
          style: 'default',
        },
      ]
    );
  };

  const handlePreviewStart = () => {
    console.log('🔴 PLAYLIST_ACCESS: Showing preview gate modal');
    setShowPreviewGateModal(true);
  };

  const handlePreviewGateStart = () => {
    console.log('🔴 PLAYLIST_ACCESS: Starting 30-second preview');
    setShowPreviewGateModal(false);
    setShowPreview(true);
  };

  // After SMS verification link: land on this page with ?previewVerified=1 and jump straight into preview.
  useEffect(() => {
    if (!playlist || isLoading) return;
    const v = previewQuery.previewVerified;
    const verified = v === '1' || v === 'true';
    if (!verified || smsAutoPreviewStartedRef.current) return;
    if (!playlist.requiresActivationCode || !playlist.requirePhoneForPreview) return;

    smsAutoPreviewStartedRef.current = true;
    setShowPreviewGateModal(false);
    setShowPreview(true);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has('previewVerified') || u.searchParams.has('previewToken')) {
          u.searchParams.delete('previewVerified');
          u.searchParams.delete('previewToken');
          const qs = u.searchParams.toString();
          window.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : ''));
        }
      } catch {
        /* ignore */
      }
    }
  }, [playlist, isLoading, previewQuery.previewVerified]);

  const handlePreviewComplete = () => {
    console.log('🔴 PLAYLIST_ACCESS: 30-second preview completed, returning to access screen');
    setShowPreview(false);
    
    // Redirect to the playlist creator's store
    const storeUrl = playlist?.userId ? `/store/user/${playlist.userId}` : '/store/master';
    
    // Show a brief message that preview is complete
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
    // Redirect to the playlist creator's store
    const storeUrl = playlist?.userId ? `/store/user/${playlist.userId}` : '/store/master';
    router.push(storeUrl);
  };

  if (isLoading || !playlist) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading playlist...</ThemedText>
      </ThemedView>
    );
  }

  // If playlist is not protected, show loading while redirecting to media player
  if (!playlist.requiresActivationCode) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <MaterialIcons name="queue-music" size={64} color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Starting playlist...</ThemedText>
        <ThemedText style={[styles.loadingText, { fontSize: 14, marginTop: 8 }]}>
          {playlist.name}
        </ThemedText>
      </ThemedView>
    );
  }

  // Full access mode with guest access and visible auth options
  if (isFullAccess && playlist) {
    return (
      <ThemedView style={styles.fullAccessContainer}>
        {/* Guest Access Header with Sign-up/Sign-in Options */}
        {!isAuthenticated && (
          <View style={styles.guestAccessHeader}>
            <View style={styles.guestAccessContent}>
              <Text style={styles.guestAccessText}>
                You are viewing as a guest with your activation code
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
              <TouchableOpacity
                style={styles.viewerSignupLink}
                onPress={() => {
                  const code = (validatedCode?.code || activationCode || '').trim();
                  if (!code) {
                    Alert.alert(
                      'Activation code required',
                      'Create a viewer account from this screen after your code is validated, or open Viewer sign up and paste your code there.'
                    );
                    return;
                  }
                  router.push(
                    `/auth/register-viewer?activationCode=${encodeURIComponent(code)}` as any
                  );
                }}
              >
                <Text style={styles.viewerSignupLinkText}>
                  Create a viewer account to save this activation code to your profile
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Full Playlist Player */}
        <PlaylistPlayer
          playlistId={id}
          playlist={playlist}
          media={playlist.mediaFiles}
          autoPlay={false}
        />
      </ThemedView>
    );
  }

  if (showPreview) {
    const formattedFiles = playlist.mediaFiles?.map((file: any) => ({
      id: file.id,
      title: file.title,
              url: `${env.apiBaseUrl.replace('/api', '')}/api/media/${file.id}/stream`,
      fileType: file.fileType,
      contentType: file.contentType,
    })) || [];

    return (
      <ThemedView style={styles.container}>
        {/* Preview Header */}
        <View style={styles.previewHeader}>
          <TouchableOpacity 
            style={styles.previewBackButton}
            onPress={() => setShowPreview(false)}
          >
            <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <View style={styles.previewHeaderContent}>
            <Text style={styles.previewTitle}>30-Second Preview</Text>
            <Text style={styles.previewSubtitle}>{playlist.name}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <PreviewPlayer
          mediaFiles={formattedFiles}
          playlistName={playlist.name}
          playlistId={id}
          autoplay={false}
          previewDuration={30}
          productLinks={playlist.productLinks || []}
          onPreviewComplete={handlePreviewComplete}
          userId={playlist.userId}
        />
        
        <View style={styles.previewActions}>
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

  if (previewCompleted) {
    return (
      <ThemedView style={styles.redirectContainer}>
        <MaterialIcons name="storefront" size={64} color="#3b82f6" />
        <Text style={styles.redirectTitle}>Preview Complete!</Text>
        <Text style={styles.redirectText}>
          Redirecting you to our store to explore more content...
        </Text>
        <ActivityIndicator size="large" color="#3b82f6" style={styles.redirectSpinner} />
      </ThemedView>
    );
  }

  // Registration Flow Screen
  if (showRegistrationFlow) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowRegistrationFlow(false)}>
              <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Account</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.content}>
            {/* Success Message */}
            <View style={styles.successBanner}>
              <MaterialIcons name="check-circle" size={32} color="#10b981" />
              <Text style={styles.successTitle}>Valid Activation Code!</Text>
              <Text style={styles.successText}>
                Your activation code is valid for {playlist?.name}. Create an account to save this access to your profile.
              </Text>
            </View>

            {/* Registration Form */}
            <View style={styles.formContainer}>
              <Text style={styles.formTitle}>Create Your Account</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Email Address *"
                value={registrationData.email}
                onChangeText={(text) => setRegistrationData({...registrationData, email: text})}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              
              <TextInput
                style={styles.input}
                placeholder="Username *"
                value={registrationData.username}
                onChangeText={(text) => setRegistrationData({...registrationData, username: text})}
                autoCapitalize="none"
                autoComplete="username"
              />
              
              <TextInput
                style={styles.input}
                placeholder="First Name"
                value={registrationData.firstName}
                onChangeText={(text) => setRegistrationData({...registrationData, firstName: text})}
                autoComplete="given-name"
              />
              
              <TextInput
                style={styles.input}
                placeholder="Password *"
                value={registrationData.password}
                onChangeText={(text) => setRegistrationData({...registrationData, password: text})}
                secureTextEntry
                autoComplete="new-password"
              />
              
              <TextInput
                style={styles.input}
                placeholder="Confirm Password *"
                value={registrationData.confirmPassword}
                onChangeText={(text) => setRegistrationData({...registrationData, confirmPassword: text})}
                secureTextEntry
                autoComplete="new-password"
              />

              <TouchableOpacity
                style={[styles.submitButton, isRegistering && styles.submitButtonDisabled]}
                onPress={handleRegistrationSubmit}
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="person-add" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>Create Account & Save Access</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Already have account */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Already have an account?</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, isRegistering && styles.submitButtonDisabled]}
                onPress={handleHaveAccountLogin}
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <>
                    <MaterialIcons name="login" size={20} color="#3b82f6" />
                    <Text style={styles.loginButtonText}>Sign In Instead</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.benefitsText}>
                ✅ Access saved to your profile{'\n'}
                ✅ Download our app for seamless experience{'\n'}
                ✅ No need to re-enter codes{'\n'}
                ✅ Works across all devices
              </Text>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // App Download Screen
  if (showAppDownload) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ width: 24 }} />
            <Text style={styles.headerTitle}>Account Created!</Text>
            <TouchableOpacity onPress={() => router.replace(`/playlist-player/${id}`)}>
              <MaterialIcons name="close" size={24} color="#1f2937" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Success Message */}
            <View style={styles.appDownloadContainer}>
              <MaterialIcons name="celebration" size={64} color="#10b981" />
              <Text style={styles.appDownloadTitle}>You are all set!</Text>
              <Text style={styles.appDownloadSubtitle}>
                Your account has been created and the activation code for {playlist?.name} is now saved to your profile.
              </Text>
              
              {/* App Download Options */}
              <View style={styles.downloadOptions}>
                <Text style={styles.downloadTitle}>Choose Your Experience:</Text>
                
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={handleDownloadApp}
                >
                  <MaterialIcons name="phone-android" size={24} color="#fff" />
                  <View style={styles.downloadButtonText}>
                    <Text style={styles.downloadButtonTitle}>Download Mobile App</Text>
                    <Text style={styles.downloadButtonSubtitle}>Best experience + offline access</Text>
                  </View>
                  <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.webPlayerButton}
                  onPress={() => router.replace(`/playlist-player/${id}`)}
                >
                  <MaterialIcons name="play-circle" size={24} color="#3b82f6" />
                  <View style={styles.downloadButtonText}>
                    <Text style={styles.webPlayerButtonTitle}>Continue in Web Player</Text>
                    <Text style={styles.webPlayerButtonSubtitle}>Start listening right now</Text>
                  </View>
                  <MaterialIcons name="arrow-forward" size={20} color="#3b82f6" />
                </TouchableOpacity>
              </View>

              <View style={styles.benefitsContainer}>
                <Text style={styles.benefitsTitle}>What is next?</Text>
                <Text style={styles.benefitsText}>
                  • Your activation code is permanently saved to your account{'\n'}
                  • Sign in to the app with your email and password{'\n'}
                  • Access your content instantly without re-entering codes{'\n'}
                  • Enjoy seamless syncing across all your devices
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // Demographics survey handler
  const handleDemographicsSubmit = async (demographics: { ageRange: string; gender: string }) => {
    console.log('👤 PLAYLIST_ACCESS: User provided demographics:', demographics);
    
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
        const qrId = playlist?.qr_code_id || playlist?.qrCodeId;
        if (qrId) {
          console.log('📊 PLAYLIST_ACCESS: Re-tracking scan with new demographics...');
          await analyticsService.trackQRScan(Number(qrId), {
            userAge: demographics.ageRange,
            userGender: demographics.gender,
          });
          console.log('✅ PLAYLIST_ACCESS: Scan re-tracked with demographics!');
        }
      } catch (e) {
        console.warn('Failed to re-track scan with demographics:', e);
      }
      
      setShowDemographicsSurvey(false);
    } catch (error) {
      console.error('❌ PLAYLIST_ACCESS: Error in demographics submit:', error);
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

      {/* Scrollable content to ensure store link is reachable */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
      <View style={styles.content}>
        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <MaterialIcons name="queue-music" size={48} color="#3b82f6" />
          <Text style={styles.playlistName}>{playlist.name}</Text>
          <Text style={styles.playlistSubtitle}>
            {playlist.mediaFiles.length} tracks • Premium Content
          </Text>
        </View>

        {/* Access Options */}
        <View style={styles.accessOptions}>
          <Text style={styles.sectionTitle}>Choose an option to continue:</Text>

          {/* Activation Code Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="vpn-key" size={24} color="#10b981" />
              <Text style={styles.optionTitle}>Enter Activation Code</Text>
              <TouchableOpacity
                style={styles.buyCodeButton}
                onPress={() => setShowBuyCodeModal(true)}
              >
                <Text style={styles.buyCodeButtonText}>Buy Activation Code</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.optionDescription}>
              Have an activation code? Enter it below for full access to this playlist.
            </Text>

            <View style={styles.codeInputContainer}>
              <TextInput
                style={[styles.codeInput, isBlocked && styles.blockedInput]}
                value={activationCode}
                onChangeText={setActivationCode}
                placeholder={isBlocked ? "Access blocked" : "Enter activation code"}
                placeholderTextColor={isBlocked ? "#ef4444" : "#9ca3af"}
                autoCapitalize="characters"
                maxLength={20}
                editable={!isBlocked}
              />
              <TouchableOpacity
                style={[
                  styles.submitButton, 
                  (!activationCode.trim() || isValidating || isBlocked) && styles.disabledButton
                ]}
                onPress={handleActivationCodeSubmit}
                disabled={!activationCode.trim() || isValidating || isBlocked}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : isBlocked ? (
                  <MaterialIcons name="block" size={20} color="#fff" />
                ) : (
                  <MaterialIcons name="check" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
            
            {/* Failed attempts indicator */}
            {failedAttempts > 0 && !isBlocked && (
              <View style={styles.attemptsWarning}>
                <MaterialIcons name="warning" size={16} color="#f59e0b" />
                <Text style={styles.attemptsText}>
                  {failedAttempts}/3 failed attempts
                </Text>
              </View>
            )}
            
            {/* Blocked message */}
            {isBlocked && (
              <View style={styles.blockedMessage}>
                <MaterialIcons name="block" size={16} color="#ef4444" />
                <Text style={styles.blockedText}>
                  Access blocked after 3 failed attempts. Visit our store to purchase access.
                </Text>
              </View>
            )}
          </View>

          {/* Preview Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="preview" size={24} color="#f59e0b" />
              <Text style={styles.optionTitle}>30-Second Preview</Text>
            </View>
            <Text style={styles.optionDescription}>
              Get a taste of this playlist with a 30-second preview of each track.
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
      </ScrollView>

      {/* Preview Gate Modal (phone + consent before preview) */}
      <PreviewGateModal
        visible={showPreviewGateModal}
        onClose={() => setShowPreviewGateModal(false)}
        onStartPreview={handlePreviewGateStart}
        contentType="playlist"
        contentId={id}
        contentName={playlist?.name}
        couponId={playlist?.previewCouponId != null ? Number(playlist.previewCouponId) : undefined}
        ownerId={playlist?.userId != null ? Number(playlist.userId) : undefined}
        requirePhoneForPreview={playlist?.requirePhoneForPreview === true}
      />

      <LockedAccessSignupModal
        visible={showLockedAccessSignup}
        onClose={() => setShowLockedAccessSignup(false)}
        contentType="playlist"
        contentId={id}
        activationCode={activationCode}
        contentName={playlist?.name}
        onCompleted={handleLockedAccessCompleted}
      />

      {/* Demographics Survey Overlay */}
      <DemographicsSurveyOverlay
        visible={showDemographicsSurvey}
        artistName={playlist?.creatorName || playlist?.username}
        onSubmit={handleDemographicsSubmit}
      />

      {/* Buy Activation Code Modal */}
      <BuyActivationCodeModal
        visible={showBuyCodeModal}
        onClose={() => setShowBuyCodeModal(false)}
        contentType="playlist"
        contentId={id}
        contentName={playlist?.name}
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
  redirectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  redirectTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  redirectText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  redirectSpinner: {
    marginTop: 16,
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
    paddingBottom: 48,
  },
  playlistInfo: {
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
  playlistName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
    textAlign: 'center',
  },
  playlistSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
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
    flex: 1,
  },
  buyCodeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buyCodeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  previewActions: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  blockedInput: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  attemptsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    gap: 6,
  },
  attemptsText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },
  blockedMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    gap: 6,
  },
  blockedText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  
  // Registration Flow Styles
  successBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#047857',
    marginTop: 8,
    textAlign: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#065f46',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 14,
    color: '#6b7280',
    marginHorizontal: 12,
  },
  loginButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  benefitsText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
  },
  
  // App Download Screen Styles
  appDownloadContainer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  appDownloadTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  appDownloadSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  downloadOptions: {
    width: '100%',
    marginBottom: 32,
  },
  downloadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  downloadButtonText: {
    flex: 1,
    marginLeft: 16,
  },
  downloadButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  downloadButtonSubtitle: {
    fontSize: 14,
    color: '#cbd5e1',
    marginTop: 2,
  },
  webPlayerButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  webPlayerButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  webPlayerButtonSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  benefitsContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    width: '100%',
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  
  // Preview Header Styles
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  previewBackButton: {
    padding: 5,
  },
  previewHeaderContent: {
    flex: 1,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  previewSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
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
  viewerSignupLink: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  viewerSignupLinkText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});