import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '@/contexts/AuthContext';
import { env } from '@/config/environment';

interface GoogleSignInResult {
  success: boolean;
  error?: string;
}

const GOOGLE_OAUTH_STATE_KEY = 'google_oauth_state';

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();

  // Initialize Google Sign-In for native only
  useEffect(() => {
    if (Platform.OS !== 'web') {
      GoogleSignin.configure({
        webClientId: env.googleClientId, // Web Client ID for backend verification
        iosClientId: '587879962618-blge4b7msal6lokld99n82hl9f9tpifs.apps.googleusercontent.com', // iOS Client ID
        scopes: ['profile', 'email', 'openid'],
        offlineAccess: true,
      });
    }
  }, []);

  const signIn = async (): Promise<GoogleSignInResult> => {
    setLoading(true);
    try {
      const googleClientId = env.googleClientId;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Web: OAuth authorization code flow - no prompt/FedCM dependency
        const redirectUri = `${env.oauthCallbackHost.replace(/\/+$/, '')}/auth/google`;
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state);
        }
        const authUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(googleClientId)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent('openid profile email')}` +
          `&state=${encodeURIComponent(state)}` +
          `&prompt=select_account`;
        window.location.href = authUrl;
        return { success: true }; // Page navigates away; caller won't receive this
      } else {
        // Native implementation
        console.log('📱 Using native Google Sign-In');
        
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken; // Updated for v13+ structure

        if (!idToken) {
          throw new Error('No ID token returned from Google');
        }

        await socialLogin('google', idToken);
        return { success: true };
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, error: 'Google sign-in was cancelled' };
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return { success: false, error: 'Google sign-in is already in progress' };
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, error: 'Google Play Services not available or outdated' };
      } else {
        console.error('❌ Google sign-in error:', error);
        return { 
          success: false, 
          error: error.message || 'Google sign-in failed' 
        };
      }
    } finally {
      if (Platform.OS !== 'web') {
        setLoading(false);
      }
    }
  };

  /** Get idToken for linking (does not perform login - use with profileAPI.linkGoogle) */
  const getTokenForLinking = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return null; // Web linking uses redirect flow
    }
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      return userInfo.data?.idToken ?? null;
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return null;
      }
      throw error;
    }
  };

  /** Initiate Google OAuth for linking (web only - redirects; callback checks mode) */
  const signInForLinking = async (): Promise<GoogleSignInResult> => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return { success: false, error: 'Use getTokenForLinking on native' };
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('google_oauth_mode', 'link');
    }
    return signIn();
  };

  return { signIn, getTokenForLinking, signInForLinking, loading };
}
