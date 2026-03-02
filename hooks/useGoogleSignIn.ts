import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '@/contexts/AuthContext';
import { env } from '@/config/environment';
import { profileAPI } from '@/services/api';

// Declare Google Identity Services types for web
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton: (element: HTMLElement, config: {
            type?: string;
            theme?: string;
            size?: string;
            text?: string;
            shape?: string;
            logo_alignment?: string;
            width?: string;
            locale?: string;
          }) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

interface GoogleSignInResult {
  success: boolean;
  error?: string;
}

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();
  const [gisReady, setGisReady] = useState(false);

  // Initialize Google Sign-In
  useEffect(() => {
    if (Platform.OS !== 'web') {
      GoogleSignin.configure({
        webClientId: env.googleClientId, // Web Client ID for backend verification
        iosClientId: '587879962618-blge4b7msal6lokld99n82hl9f9tpifs.apps.googleusercontent.com', // iOS Client ID
        scopes: ['profile', 'email', 'openid'],
        offlineAccess: true,
      });
    } else if (typeof window !== 'undefined') {
      // Web implementation
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        if (window.google?.accounts?.id) {
          setGisReady(true);
          return;
        }
        existingScript.addEventListener('load', () => {
          if (window.google?.accounts?.id) {
            setGisReady(true);
          }
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('✅ Google Identity Services script loaded');
        setTimeout(() => {
          if (window.google?.accounts?.id) {
            setGisReady(true);
            console.log('✅ Google Identity Services ready');
          }
        }, 100);
      };
      script.onerror = () => {
        console.error('❌ Failed to load Google Identity Services script');
      };
      document.head.appendChild(script);
    }
  }, []);

  const signIn = async (): Promise<GoogleSignInResult> => {
    setLoading(true);
    try {
      const googleClientId = env.googleClientId;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Wait for GIS to be ready if not already
        if (!gisReady) {
          let attempts = 0;
          while (!window.google?.accounts?.id && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          if (!window.google?.accounts?.id) {
            return { success: false, error: 'Google sign-in failed to load. Please refresh and try again.' };
          }
        }

        // Use GIS JavaScript callback flow - no redirect, no hash fragment issues.
        // The credential (id_token) is delivered directly to the callback function.
        return new Promise<GoogleSignInResult>((resolve) => {
          const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

          window.google!.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response: { credential: string }) => {
              try {
                const isLinkMode = typeof sessionStorage !== 'undefined' &&
                  sessionStorage.getItem('google_oauth_mode') === 'link';
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.removeItem('google_oauth_mode');
                }
                if (isLinkMode) {
                  await profileAPI.linkGoogle(response.credential);
                  resolve({ success: true });
                } else {
                  await socialLogin('google', response.credential);
                  resolve({ success: true });
                }
              } catch (err: any) {
                resolve({ success: false, error: err.message || 'Google sign-in failed' });
              } finally {
                setLoading(false);
              }
            },
            nonce,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          window.google!.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              // One Tap blocked by browser or user not signed into Google.
              // Fall back to GIS redirect using response_type=code (query param,
              // not hash fragment) so the callback page can read it reliably.
              console.log('⚠️ GIS prompt not shown, falling back to redirect flow');
              const sessionNonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('google_oauth_nonce', sessionNonce);
              }
              const redirectUri = `${env.oauthCallbackHost}/auth/google`;
              const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${encodeURIComponent(googleClientId)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&response_type=id_token` +
                `&scope=${encodeURIComponent('openid profile email')}` +
                `&nonce=${encodeURIComponent(sessionNonce)}` +
                `&prompt=select_account`;
              window.location.href = authUrl;
              // Page navigates away; Promise is never resolved (intentional)
            }
            if (notification.isDismissedMoment()) {
              setLoading(false);
              resolve({ success: false, error: 'Google sign-in was dismissed' });
            }
          });
        });
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
      // Only clear loading for native; web clears it inside the GIS callbacks
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
