import { useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/contexts/AuthContext';

interface AppleSignInResult {
  success: boolean;
  error?: string;
}

// Declare Apple Sign-In types for web
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup?: boolean;
        }) => void;
        signIn: (config?: {
          requestedScopes?: string[];
        }) => Promise<{
          authorization: {
            code: string;
            id_token: string;
            state: string;
          };
          user: {
            email?: string;
            name?: {
              firstName?: string;
              lastName?: string;
            };
          };
        }>;
      };
    };
  }
}

export function useAppleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();
  const [appleReady, setAppleReady] = useState(false);

  // Note: We're using manual OAuth redirect flow, not the Apple SDK
  // So we don't need to load the Apple Sign-In JavaScript SDK
  // This prevents CSP violations and simplifies the implementation
  useEffect(() => {
    // For mobile platforms, Apple Sign-In is ready if on iOS
    if (Platform.OS === 'ios') {
      setAppleReady(true);
    } else if (Platform.OS === 'web') {
      // For web, we use manual redirect, so we're always "ready"
      setAppleReady(true);
    }
  }, []);

  const initializeAppleAuth = () => {
    try {
      const appleClientId = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
      
      if (!appleClientId) {
        console.error('❌ Apple Client ID not configured');
        return;
      }

      // Determine the correct redirect URI
      let currentOrigin = window.location.origin;
      if (currentOrigin.includes('merchtrader.org')) {
        currentOrigin = 'https://www.merchtrader.org';
      }
      const redirectURI = `${currentOrigin}/auth/apple`;

      // Initialize Apple Sign-In
      window.AppleID?.auth.init({
        clientId: appleClientId,
        scope: 'name email',
        redirectURI: redirectURI,
        usePopup: false, // Use redirect flow for better compatibility
      });

      setAppleReady(true);
      console.log('✅ Apple Sign-In initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Apple Sign-In:', error);
    }
  };

  const signIn = async (): Promise<AppleSignInResult> => {
    setLoading(true);
    try {
      // For web, use Apple OAuth redirect flow
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        console.log('🌐 Using Apple Sign-In OAuth redirect flow for web');

        // Get Apple Client ID from environment variables
        // Note: In Expo web builds, these are injected at build time
        const appleClientId = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
        
        console.log('🍎 Apple Client ID check:', {
          hasClientId: !!process.env.EXPO_PUBLIC_APPLE_CLIENT_ID,
          hasServiceId: !!process.env.EXPO_PUBLIC_APPLE_SERVICE_ID,
          resolvedClientId: appleClientId
        });
        
        if (!appleClientId) {
          console.error('❌ Apple OAuth not configured - environment variables missing');
          console.error('❌ EXPO_PUBLIC_APPLE_CLIENT_ID:', process.env.EXPO_PUBLIC_APPLE_CLIENT_ID);
          console.error('❌ EXPO_PUBLIC_APPLE_SERVICE_ID:', process.env.EXPO_PUBLIC_APPLE_SERVICE_ID);
          return { 
            success: false, 
            error: 'Apple OAuth not configured. Please set EXPO_PUBLIC_APPLE_CLIENT_ID' 
          };
        }

        // Generate a random nonce for security
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Store nonce in sessionStorage to verify on callback
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem('apple_oauth_nonce', nonce);
          console.log('🍎 Stored nonce in sessionStorage');
        }

        // Determine the correct redirect URI
        let currentOrigin = window.location.origin;
        if (currentOrigin.includes('merchtrader.org')) {
          currentOrigin = 'https://www.merchtrader.org';
        }
        const redirectURI = `${currentOrigin}/auth/apple`;
        console.log('🔄 Current origin:', window.location.origin);
        console.log('🔄 Using redirect URI:', redirectURI);
        console.log('🔄 Apple Client ID:', appleClientId);

        // Use Apple's redirect flow
        // For web OAuth, try id_token with query mode
        // Note: Apple may require specific Service ID configuration for id_token to work
        const appleAuthUrl = `https://appleid.apple.com/auth/authorize?` +
          `client_id=${encodeURIComponent(appleClientId)}` +
          `&redirect_uri=${encodeURIComponent(redirectURI)}` +
          `&response_type=id_token` +
          `&scope=name email` +
          `&response_mode=query` +
          `&state=${encodeURIComponent(nonce)}` +
          `&nonce=${encodeURIComponent(nonce)}`;

        console.log('🔄 Apple Auth URL:', appleAuthUrl);
        console.log('🔄 Redirecting to Apple Sign-In...');
        
        // Redirect to Apple - this will navigate away from the page
        // Set location immediately - browser will navigate away
        window.location.href = appleAuthUrl;
        
        // Return a special value indicating redirect is in progress
        // The handler should not treat this as an error
        return { success: true, redirecting: true };
      } else if (Platform.OS === 'ios') {
        // For iOS, use native Apple Authentication
        console.log('📱 Using native Apple Authentication for iOS');

        // Check if Apple Authentication is available
        const isAvailable = await AppleAuthentication.isAvailableAsync();
        if (!isAvailable) {
          return { 
            success: false, 
            error: 'Apple Sign-In is not available on this device' 
          };
        }

        // Generate a random nonce for security
        const nonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
        );

        // Request Apple authentication
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce,
        });

        if (!credential.identityToken) {
          return { success: false, error: 'No identity token received from Apple' };
        }

        // Use AuthContext to handle the login
        await socialLogin('apple', credential.identityToken, nonce);
        
        return { success: true };
      } else {
        // Android or other platforms
        return { 
          success: false, 
          error: 'Apple Sign-In is only available on iOS devices and web browsers' 
        };
      }
    } catch (error: any) {
      console.error('❌ Apple sign-in error:', error);
      
      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { success: false, error: 'Apple sign-in was cancelled' };
      }
      
      return { 
        success: false, 
        error: error.message || 'Apple sign-in failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  return { signIn, loading };
}

