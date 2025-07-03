import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist } from '@/shared/media-schema';
import MediaPlayer from '@/components/MediaPlayer';
import PreviewPlayer from '@/components/PreviewPlayer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { activationCodesAPI } from '@/services/api';

export default function PlaylistAccessScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const { user, isAuthenticated, register, login } = useAuth();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  
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
    fetchPlaylist();
  }, [id]);

  // Check access after playlist is loaded or user authentication changes
  useEffect(() => {
    if (playlist) {
      checkExistingAccess();
    }
  }, [playlist, isAuthenticated, user]);

  const fetchPlaylist = async () => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: Fetching playlist with ID:', id);

      const { playlistAPI } = await import('@/services/api');
      const playlistData = await playlistAPI.getById(id);

      console.log('🔴 PLAYLIST_ACCESS: Loaded playlist:', playlistData);

      // Log media files from server (URLs are now correct from server)
      if (playlistData.mediaFiles) {
        console.log('🔴 PLAYLIST_ACCESS: Media files from server:', playlistData.mediaFiles);
        
        // Test first media file URL
        if (playlistData.mediaFiles.length > 0) {
          const firstFile = playlistData.mediaFiles[0];
          console.log('🔴 PLAYLIST_ACCESS: Testing first media file URL:', firstFile.url);
          fetch(firstFile.url, { method: 'HEAD' })
            .then(response => {
              console.log('🔴 PLAYLIST_ACCESS: First file URL test response:', {
                status: response.status,
                statusText: response.statusText,
                url: firstFile.url
              });
            })
            .catch(error => {
              console.error('🔴 PLAYLIST_ACCESS: First file URL test failed:', error);
            });
        }
      }

      setPlaylist(playlistData);
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

      // CRITICAL CHECK: If playlist doesn't require activation code, go directly to media player
      if (!playlist.requiresActivationCode) {
        console.log('🔴 PLAYLIST_ACCESS: Playlist is NOT protected, redirecting directly to media player');
        router.replace(`/media-player/${id}`);
        return;
      }

      console.log('🔴 PLAYLIST_ACCESS: ⚠️  PLAYLIST IS PROTECTED - checking for existing access');
      
      // First check if user is authenticated and has access codes attached to their profile
      if (isAuthenticated && user) {
        console.log('🔴 PLAYLIST_ACCESS: User is authenticated, checking profile access codes');
        console.log('🔴 PLAYLIST_ACCESS: User details:', { userId: user.id, username: user.username });
        console.log('🔴 PLAYLIST_ACCESS: Looking for access to playlist ID:', id, 'as number:', parseInt(id));
        try {
          const userAccessCodes = await activationCodesAPI.getMyAccess();
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
            console.log('🔴 PLAYLIST_ACCESS: User has valid access code for this playlist, redirecting to media player');
            router.replace(`/media-player/${id}`);
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
          const validationResult = await activationCodesAPI.validate(storedCode, id);
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
        console.log('🔴 PLAYLIST_ACCESS: User has purchased access, redirecting to media player');
        router.replace(`/media-player/${id}`);
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
      console.log('🔴 PLAYLIST_ACCESS: Validating activation code:', activationCode);
      
      // Use real API to validate the activation code
      const validationResult = await activationCodesAPI.validate(activationCode, id);
      
      if (validationResult.valid) {
        console.log('🔴 PLAYLIST_ACCESS: Valid activation code:', validationResult);
        setValidatedCode(validationResult);
        // Store the activation code in AsyncStorage as a fallback
        await AsyncStorage.setItem('pending_activation_code', activationCode);
        
        // Check if user is authenticated
        if (isAuthenticated) {
          // User is logged in - attach code and redirect to media player
          await handleAttachCodeAndRedirect(activationCode);
        } else {
          // User not logged in - start registration flow
          setShowRegistrationFlow(true);
        }
      } else {
        console.log('🔴 PLAYLIST_ACCESS: Invalid activation code, attempt:', failedAttempts + 1);
        
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
      console.error('🔴 PLAYLIST_ACCESS: Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAttachCodeAndRedirect = async (code: string) => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: Attaching code to user account:', code);
      await activationCodesAPI.attach(code);
      
      // Store the activation code for future access
      await AsyncStorage.setItem(`playlist_access_${id}`, code);
      
      // Redirect to media player
      router.replace(`/media-player/${id}`);
    } catch (error) {
      console.error('🔴 PLAYLIST_ACCESS: Error attaching code:', error);
      Alert.alert('Error', 'Failed to link activation code to your account');
    }
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
          await activationCodesAPI.attach(codeToAttach);
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
        await activationCodesAPI.attach(codeToAttach);
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
          onPress: () => router.replace(`/media-player/${id}`),
          style: 'default',
        },
      ]
    );
  };

  const handlePreviewStart = () => {
    console.log('🔴 PLAYLIST_ACCESS: Starting 30-second preview');
    setShowPreview(true);
  };

  const handlePreviewComplete = () => {
    console.log('🔴 PLAYLIST_ACCESS: 30-second preview completed, returning to access screen');
    setShowPreview(false);
    
    // Show a brief message that preview is complete
    Alert.alert(
      '⏰ Preview Complete',
      'Your 30-second preview has ended. Enter an activation code for full access or visit our store.',
      [
        { text: 'Enter Code', style: 'default' },
        { text: 'Visit Store', onPress: () => router.push('/store') }
      ]
    );
  };

  const handleGoToStore = () => {
    router.push('/store');
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

  if (showPreview) {
    const formattedFiles = playlist.mediaFiles?.map((file: any) => ({
      id: file.id,
      title: file.title,
      url: `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/api/media/${file.id}/stream`,
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
          playlistId={id}
          shouldAutoplay={true}
          previewDuration={30}
          productLinks={playlist.productLinks || []}
          onPreviewComplete={handlePreviewComplete}
          onSetPlaybackState={(isPlaying, trackIndex) => {
            console.log(`Preview playback state: ${isPlaying ? 'Playing' : 'Paused'} track ${trackIndex + 1}`);
          }}
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
              <Text style={styles.successTitle}>Valid Activation Code! 🎉</Text>
              <Text style={styles.successText}>
                Your activation code is valid for "{playlist?.name}". 
                Create an account to save this access to your profile.
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
            <TouchableOpacity onPress={() => router.replace(`/media-player/${id}`)}>
              <MaterialIcons name="close" size={24} color="#1f2937" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Success Message */}
            <View style={styles.appDownloadContainer}>
              <MaterialIcons name="celebration" size={64} color="#10b981" />
              <Text style={styles.appDownloadTitle}>You're All Set! 🎉</Text>
              <Text style={styles.appDownloadSubtitle}>
                Your account has been created and the activation code for "{playlist?.name}" 
                is now saved to your profile.
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
                  onPress={() => router.replace(`/media-player/${id}`)}
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
                <Text style={styles.benefitsTitle}>What's Next?</Text>
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
  scrollView: {
    flex: 1,
  },
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
});