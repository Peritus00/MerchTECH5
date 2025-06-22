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
    const inMainApp = segments[0] === '(tabs)';

    console.log('Route navigation check:', { 
      isAuthenticated, 
      inAuthGroup, 
      inSubscriptionGroup, 
      inMainApp,
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
      // User is authenticated - check their status and current location
      if (user.isNewUser) {
        // New user should go to subscription page (unless already there)
        if (!inSubscriptionGroup) {
          console.log('Redirecting to subscription - new user');
          router.replace('/subscription/?newUser=true');
        }
      } else {
        // Existing user should go to main app (unless already there)
        if (inAuthGroup || inSubscriptionGroup) {
          console.log('Redirecting to main app - existing user');
          router.replace('/(tabs)');
        }
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