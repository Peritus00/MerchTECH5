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
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          prompt: (callback?: (notification: any) => void) => void;
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
      const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
      
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

        return new Promise((resolve) => {
          try {
            // Initialize Google Identity Services
            window.google!.accounts.id.initialize({
              client_id: googleClientId,
              callback: async (response: { credential: string }) => {
                console.log('✅ Google sign-in callback received');
                try {
                  // The credential is the ID token
                  const idToken = response.credential;
                  
                  if (!idToken) {
                    console.error('❌ No ID token in Google response');
                    resolve({ success: false, error: 'No ID token received from Google' });
                    return;
                  }

                  console.log('🔄 Sending ID token to backend...');
                  await socialLogin('google', idToken);
                  console.log('✅ Google sign-in successful');
                  resolve({ success: true });
                } catch (error: any) {
                  console.error('❌ Error during social login:', error);
                  resolve({ 
                    success: false, 
                    error: error.message || 'Failed to complete sign-in' 
                  });
                } finally {
                  setLoading(false);
                }
              },
            });

            // Trigger the sign-in prompt
            console.log('🔄 Prompting Google sign-in...');
            window.google!.accounts.id.prompt((notification: any) => {
              if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.warn('⚠️ Google sign-in prompt not displayed:', notification);
                resolve({ 
                  success: false, 
                  error: 'Google sign-in prompt was blocked or unavailable. Please check your browser settings.' 
                });
                setLoading(false);
              } else if (notification.isDismissedMoment()) {
                console.log('ℹ️ Google sign-in dismissed by user');
                resolve({ 
                  success: false, 
                  error: 'Google sign-in was cancelled' 
                });
                setLoading(false);
              }
              // If notification.isDisplayed() or notification.isDisplayedMoment(), 
              // the callback will handle the result
            });
          } catch (error: any) {
            console.error('❌ Google Identity Services error:', error);
            resolve({ 
              success: false, 
              error: error.message || 'Google sign-in failed' 
            });
            setLoading(false);
          }
        });
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

