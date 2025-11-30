import { useState } from 'react';
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

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();

  const signIn = async (): Promise<GoogleSignInResult> => {
    setLoading(true);
    try {
      // For iOS/Android, use Google OAuth
      // Note: You'll need to configure Google OAuth credentials in Google Cloud Console
      // and set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your environment variables
      
      const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      
      if (!googleClientId) {
        return { success: false, error: 'Google OAuth not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID' };
      }

      // Use expo-auth-session for Google sign-in with discovery document
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      const request = new AuthSession.AuthRequest({
        clientId: googleClientId,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        redirectUri: AuthSession.makeRedirectUri({
          scheme: 'merchtechapp',
          path: 'auth/google',
        }),
        usePKCE: false, // Google doesn't require PKCE for ID token flow
      });

      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        return { success: false, error: 'Google sign-in was cancelled' };
      }

      // Extract ID token from the result
      const idToken = result.params.id_token;
      
      if (!idToken) {
        return { success: false, error: 'No ID token received from Google' };
      }

      // Use AuthContext to handle the login
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

