import { useState, useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { frontendUrl } from '@/config/environment';

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

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();
  const [gisReady, setGisReady] = useState(false);

  // Load Google Identity Services script for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Check if script is already loaded
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        // Script already exists, check if GIS is ready
        if (window.google?.accounts?.id) {
          setGisReady(true);
          return;
        }
        // Wait for script to load
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
        // Wait a bit for GIS to be fully initialized
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

      return () => {
        // Don't remove script on unmount as it might be used by other components
      };
    } else {
      // For mobile platforms, GIS is not needed
      setGisReady(true);
    }
  }, []);

  const signIn = async (): Promise<GoogleSignInResult> => {
    setLoading(true);
    try {
      // Use environment variable or fallback to hardcoded production ID
      const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com';
      
      if (!googleClientId) {
        console.error('❌ Google OAuth not configured');
        return { success: false, error: 'Google OAuth not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID' };
      }

      // For web, use Google Identity Services SDK directly (more reliable)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        console.log('🌐 Using Google Identity Services for web sign-in');
        
        // Wait for GIS to be ready if not already
        if (!gisReady) {
          console.log('⏳ Waiting for Google Identity Services to be ready...');
          let attempts = 0;
          while (!window.google?.accounts?.id && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          if (!window.google?.accounts?.id) {
            return { success: false, error: 'Google sign-in service failed to load. Please refresh the page and try again.' };
          }
        }

        // Use direct OAuth redirect flow instead of FedCM/prompt API
        // This is more reliable and doesn't require server-side FedCM configuration
        console.log('🔄 Initiating Google OAuth redirect flow...');
        
        // Generate a random nonce for security
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Store nonce in sessionStorage to verify on callback
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem('google_oauth_nonce', nonce);
        }
        
        // Determine the correct redirect URI
        // Use window.location.origin to match the current domain
        // Normalize merchtrader.org domains to www.merchtrader.org for consistency
        let currentOrigin = window.location.origin;
        if (currentOrigin.includes('merchtrader.org')) {
          // Normalize to www.merchtrader.org for all merchtrader.org subdomains
          currentOrigin = 'https://www.merchtrader.org';
        }
        const redirectUri = `${currentOrigin}/auth/google`;
        console.log('🔄 Current origin:', window.location.origin);
        console.log('🔄 Using redirect URI:', redirectUri);
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(googleClientId)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=id_token` +
          `&scope=${encodeURIComponent('openid profile email')}` +
          `&nonce=${encodeURIComponent(nonce)}` +
          `&prompt=select_account`;
        
        console.log('🔄 Redirecting to Google OAuth...');
        
        // Redirect to Google
        window.location.href = authUrl;
        
        // Return immediately - the callback handler will process the result
        return { success: false, error: 'Redirecting to Google...' };
      } else {
        // For mobile platforms (iOS/Android), use expo-auth-session
        console.log('📱 Using expo-auth-session for mobile sign-in');
        
        const discovery = {
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
        };

        const redirectUri = AuthSession.makeRedirectUri({
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
      }
    } catch (error: any) {
      console.error('❌ Google sign-in error:', error);
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

