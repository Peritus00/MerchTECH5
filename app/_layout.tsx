import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';

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
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const inNotFoundGroup = segments[0] === '+not-found';

    // Add a small delay to prevent rapid navigation changes
    const navigationTimeout = setTimeout(() => {
      if (user) {
        // User is signed in
        if (inAuthGroup) {
          // Redirect away from sign-in if already authenticated
          router.replace('/(tabs)/');
        } else if (user.isNewUser && !inSubscriptionGroup && !inNotFoundGroup) {
          console.log('🔴 New user detected outside subscription flow, redirecting to subscription');
          router.replace('/subscription');
        }
      } else {
        // User is not signed in
        if (!inAuthGroup && !inNotFoundGroup) {
          router.replace('/auth/login');
        }
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
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
        <Stack.Screen name="qr-details/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="media-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="preview-player/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="playlist-access/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="product-links/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="demo-players" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

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
        <RootLayoutNav />
      </CartProvider>
    </AuthProvider>
  );
}