import { useState, useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

// Complete the auth session for better UX
WebBrowser.maybeCompleteAuthSession();

interface GoogleSignInResult {
  success: boolean;
  error?: string;
}

// Declare Google Identity Services types for web
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
        };
      };
    };
  }
}

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();

  // Load Google Identity Services script for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      return () => {
        // Cleanup script on unmount
        const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (existingScript) {
          existingScript.remove();
        }
      };
    }
  }, []);

  const signIn = async (): Promise<GoogleSignInResult> => {
    setLoading(true);
    try {
      const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      
      if (!googleClientId) {
        return { success: false, error: 'Google OAuth not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID' };
      }

      // Use expo-auth-session for all platforms (works on web, iOS, and Android)
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      const redirectUri = Platform.OS === 'web' 
        ? AuthSession.makeRedirectUri({ useProxy: false, native: `${window.location.origin}/auth/google` })
        : AuthSession.makeRedirectUri({
            scheme: 'merchtechapp',
            path: 'auth/google',
          });

      const request = new AuthSession.AuthRequest({
        clientId: googleClientId,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        redirectUri,
        usePKCE: false,
      });

      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        return { success: false, error: 'Google sign-in was cancelled' };
      }

      const idToken = result.params.id_token;
      
      if (!idToken) {
        return { success: false, error: 'No ID token received from Google' };
      }

      await socialLogin('google', idToken);
      return { success: true };
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      return { 
        success: false, 
        error: error.message || 'Google sign-in failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  return { signIn, loading };
}

