import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { UploadProvider } from '@/contexts/UploadContext';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { ConsentBanner } from '@/components/ConsentBanner';
import { useAppVersion } from '@/hooks/useAppVersion';
import { UpdateNotificationModal } from '@/components/UpdateNotificationModal';

// Initialize debug logging system early to capture all logs from app startup
import '@/utils/debugLogger';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, isLoading, isInitialized } = useAuth(); // <-- Add isInitialized
  const segments = useSegments();
  const router = useRouter();
  const { currentVersion, versionInfo, checkForUpdates } = useAppVersion();
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // This effect handles waiting for auth to initialize and then hiding the splash screen.
  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  // Check for updates on app launch and show modal if update is available
  useEffect(() => {
    if (isInitialized && user) {
      // Small delay to let the app fully initialize
      const checkTimer = setTimeout(async () => {
        await checkForUpdates();
        // Check versionInfo after a brief delay to ensure state is updated
        setTimeout(() => {
          if (versionInfo?.updateAvailable) {
            setShowUpdateModal(true);
          }
        }, 500);
      }, 2000); // Wait 2 seconds after initialization

      return () => clearTimeout(checkTimer);
    }
  }, [isInitialized, user]);

  // Show update modal when versionInfo changes and update is available
  useEffect(() => {
    if (versionInfo?.updateAvailable && isInitialized && user) {
      setShowUpdateModal(true);
    }
  }, [versionInfo?.updateAvailable, isInitialized, user]);
  
  // This effect handles auth-based routing.
  useEffect(() => {
    // Wait until auth is initialized before running any routing logic.
    if (!isInitialized) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const inNotFoundGroup = segments[0] === '+not-found';
    const inTabsGroup = segments[0] === '(tabs)';
    
    // Determine if the current route is one that should be publicly accessible
    const isPublicRoute = 
      segments[0] === '(public)' || // All routes under (public) group
      segments[0] === 'slideshow-access' || 
      segments[0] === 'playlist-access' ||
      segments[0] === 'media-player' ||
      segments[0] === 'playlist-player' || // Public playlist players
      segments[0] === 'slideshow-player' || // Public slideshow players
      segments[0] === 'preview-player' || // Public preview players
      segments[0] === 'slideshow-preview' || // Public slideshow preview
      segments[0] === 'shop' || // Public master shop page
      (
        segments[0] === 'store' && // Allow public access to specific store pages
        (
          // Make the base store route public (we'll redirect to master)
          segments.length === 1 ||
          segments[1] === 'cart' ||
          segments[1] === 'checkout-success' ||
          segments[1] === 'checkout-cancel' ||
          segments[1] === 'product' ||
          segments[1] === 'user' ||
          segments[1] === 'master'
        )
      );



    // Add a small delay to prevent rapid navigation changes
    const navigationTimeout = setTimeout(() => {
      if (user) {
        // User is signed in
        if (inAuthGroup) {
          // Redirect away from sign-in if already authenticated
          router.replace('/');
        } else if (user.isNewUser && !inSubscriptionGroup && !inNotFoundGroup && !inTabsGroup) {
          // Only redirect new users to subscription if they're not already in tabs or subscription
          // Dev user bypass - skip subscription flow
          if (user.email === 'djjetfuel@gmail.com' || user.username === 'djjetfuel') {
            console.log('🔴 Dev user detected, redirecting to dashboard');
            router.replace('/');
          } else {
            console.log('🔴 New user detected outside subscription flow, redirecting to subscription');
            router.replace('/subscription');
          }
        }
      } else if (!isLoading) {
        // User is not signed in and we're done loading
        // Only redirect if it's not an auth route, a not-found route, or a designated public route
        if (!inAuthGroup && !inNotFoundGroup && !isPublicRoute) {
          console.log('🔴 No user found, redirecting to login');
          router.replace('/auth/login');
        }
      } else if (isLoading && !inAuthGroup && !inNotFoundGroup && !isPublicRoute) {
        // Still loading but not in a public-accessible group - redirect to login immediately
        // This prevents the loading screen from showing on the main app
        console.log('🔴 Still loading and not in auth, redirecting to login immediately');
        router.replace('/auth/login');
      }
    }, 100);

    return () => clearTimeout(navigationTimeout);
  }, [user, segments, isLoading, isInitialized]); // <-- Add isInitialized to dependency array

  // Render nothing until the auth state is initialized.
  // This prevents the hydration mismatch.
  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="qr-details/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="preview-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="slideshow-preview/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="slideshow-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="playlist-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="product-links/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="demo-players" options={{ headerShown: false }} />
        <Stack.Screen name="shop" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <ConsentBanner onConsentGiven={(consent) => {
        console.log('User consent:', consent ? 'accepted' : 'declined');
      }} />
      <StatusBar style="auto" />
      <UploadProgressIndicator />
      <UpdateNotificationModal
        visible={showUpdateModal}
        currentVersion={currentVersion}
        latestVersion={versionInfo?.latestVersion || null}
        onDismiss={() => setShowUpdateModal(false)}
        onDownload={() => setShowUpdateModal(false)}
      />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  // Configure fonts based on platform
  const fontConfig = {
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...(Platform.OS === 'web' ? {
      Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
      MaterialIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
      MaterialCommunityIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
    } : {}),
  };
  
  const [loaded] = useFonts(fontConfig);

  useEffect(() => {
    if (loaded) {
      // Defer hiding the splash screen until auth is also ready in RootLayoutNav
      // SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // Web-only build - no Stripe React Native provider needed
  console.log('Web platform - using standard payment processing');

  return (
    <QueryClientProvider client={queryClient}>
      <ActionSheetProvider>
        <AuthProvider>
          <CartProvider>
            <NotificationProvider>
              <UploadProvider>
                <RootLayoutNav />
              </UploadProvider>
            </NotificationProvider>
          </CartProvider>
        </AuthProvider>
      </ActionSheetProvider>
    </QueryClientProvider>
  );
}