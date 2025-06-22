import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isAuthenticated, isInitialized, user, isLoggingOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationLockRef = useRef(false);

  useEffect(() => {
    // NUCLEAR NAVIGATION LOCK: Block ALL navigation during nuclear logout
    if (isLoggingOut || navigationLockRef.current) {
      console.log('NUCLEAR NAVIGATION BLOCKED: Logout in progress');
      return;
    }
    
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';

    console.log('Route navigation check:', { 
      isAuthenticated, 
      inAuthGroup, 
      inSubscriptionGroup, 
      currentSegments: segments,
      userIsNew: user?.isNewUser 
    });

    if (!isAuthenticated) {
      // User is not authenticated, redirect to login
      if (!inAuthGroup) {
        console.log('Redirecting to login - user not authenticated');
        router.replace('/auth/login');
      }
    } else if (isAuthenticated && user) {
      // Only redirect if we have a valid user object
      // Check if user is new and needs to select subscription
      if (user.isNewUser && !inSubscriptionGroup) {
        console.log('Redirecting to subscription - new user');
        router.replace('/subscription/?newUser=true');
      } else if (inAuthGroup && !user.isNewUser) {
        // User is authenticated but still in auth screens, redirect to main app
        console.log('Redirecting to main app - user authenticated');
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isInitialized, segments, user, isLoggingOut]);

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
          <StatusBar style="auto" />
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}