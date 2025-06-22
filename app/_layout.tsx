import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { useColorScheme } from '@/hooks/useColorScheme';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isLoading, isInitialized, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized || isLoading) {
      console.log('🔴 RootLayout: Waiting for initialization/loading to complete');
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const currentSegments = segments;

    // Get user to check if they're new (for subscription flow)
    const userIsNew = user?.isNewUser || false;

    console.log('🔴 Route navigation check:', {
      isAuthenticated,
      inAuthGroup,
      inSubscriptionGroup,
      currentSegments,
      userIsNew,
      user: user?.username || null
    });

    if (!isAuthenticated) {
      // User is not authenticated, redirect to login
      console.log('🔴 RootLayout: User not authenticated, checking if redirect needed');
      if (!inAuthGroup) {
        console.log('🔴 RootLayout: Redirecting to login from:', segments);
        router.replace('/auth/login');
      }
    } else {
      // User is authenticated
      console.log('🔴 RootLayout: User authenticated, checking current location');
      if (inAuthGroup) {
        // If user is authenticated but in auth group, redirect to home
        console.log('🔴 RootLayout: User authenticated in auth group, redirecting to home');
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, isInitialized, segments, router, user]);

  if (!isInitialized || isLoading) {
    console.log('🔴 RootLayout: Still loading...');
    return null; // or a loading screen
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <CartProvider>
          <RootLayoutNav />
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}