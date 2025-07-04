import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ConsentBanner } from '@/components/ConsentBanner';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  console.log('🔴 Route navigation check:', {
    isAuthenticated: !!user,
    inAuthGroup: segments[0] === 'auth',
    inSubscriptionGroup: segments[0] === 'subscription',
    inNotFoundGroup: segments[0] === '+not-found',
    currentSegments: segments,
    userIsNew: user?.isNewUser,
    user: user?.username
  });

  useEffect(() => {
    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const inNotFoundGroup = segments[0] === '+not-found';
    const inTabsGroup = segments[0] === '(tabs)';

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
        if (!inAuthGroup && !inNotFoundGroup) {
          console.log('🔴 No user found, redirecting to login');
          router.replace('/auth/login');
        }
      } else if (isLoading && !inAuthGroup && !inNotFoundGroup) {
        // Still loading but not in auth group - redirect to login immediately
        // This prevents the loading screen from showing on the main app
        console.log('🔴 Still loading and not in auth, redirecting to login immediately');
        router.replace('/auth/login');
      }
    }, 100);

    return () => clearTimeout(navigationTimeout);
  }, [user, segments, isLoading]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
        <Stack.Screen name="qr-details/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="media-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="preview-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="playlist-access/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="product-links/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="demo-players" options={{ headerShown: false }} />
        <Stack.Screen name="shop" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <ConsentBanner onConsentGiven={(consent) => {
        console.log('User consent:', consent ? 'accepted' : 'declined');
      }} />
      <StatusBar style="auto" />
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
    } : {}),
  };
  
  const [loaded] = useFonts(fontConfig);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // Web-only build - no Stripe React Native provider needed
  console.log('Web platform - using standard payment processing');

  return (
    <AuthProvider>
      <CartProvider>
        <NotificationProvider>
          <RootLayoutNav />
        </NotificationProvider>
      </CartProvider>
    </AuthProvider>
  );
}