import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { Platform } from 'react-native';
import { hasPendingShareResume, clearPendingShareResume } from '@/services/webShareTarget';

/**
 * Apple Sign-In callback handler
 * This route handles the redirect from Apple OAuth flow
 */
export default function AppleAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { socialLogin, socialLoginWithCode } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [processed, setProcessed] = useState(false);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Prevent multiple executions (React StrictMode or re-renders)
    if (processed) {
      return;
    }

    const processCallback = async () => {
      try {
        setProcessed(true);
        
        console.log('🍎 Apple callback processing started');
        console.log('🍎 URL params:', params);
        console.log('🍎 Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
        
        // Check for OAuth response parameters
        const idToken = params.id_token as string | undefined; // For iOS native flow
        const code = params.code as string | undefined; // For web OAuth code flow
        const error = params.error as string | undefined;
        const state = params.state as string | undefined;

        if (error) {
          console.error('❌ Apple OAuth error:', error);
          setStatus('error');
          setErrorMessage(error === 'user_cancelled_authorize' 
            ? 'Apple sign-in was cancelled' 
            : `Apple sign-in failed: ${error}`);
          return;
        }

        // Web OAuth code flow (primary for web)
        if (code && Platform.OS === 'web') {
          console.log('✅ Processing Apple OAuth callback with authorization code');
          
          // Verify state matches stored nonce (CSRF protection)
          let nonce: string | undefined;
          if (typeof window !== 'undefined' && window.sessionStorage) {
            nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
            sessionStorage.removeItem('apple_oauth_nonce');
          }
          
          // Verify state matches nonce if both are present
          if (state && nonce && state !== nonce) {
            console.error('❌ State mismatch - possible CSRF attack');
            setStatus('error');
            setErrorMessage('Security validation failed. Please try again.');
            return;
          }
          
          // Exchange code for tokens via backend
          await socialLoginWithCode('apple', code, undefined, nonce);
          setStatus('success');
          
          const redirectTo = Platform.OS === 'web' && hasPendingShareResume()
            ? (() => { clearPendingShareResume(); return '/handle-share'; })()
            : '/(tabs)';
          redirectTimerRef.current = setTimeout(() => {
            try {
              if (router && typeof router.replace === 'function') {
                router.replace(redirectTo);
              } else {
                console.warn('⚠️ Router not available, using window.location');
                window.location.href = '/';
              }
            } catch (error) {
              console.error('❌ Error during redirect:', error);
              window.location.href = '/';
            }
          }, 1000);
          return;
        }

        // iOS native flow (id_token directly)
        if (idToken) {
          console.log('✅ Processing Apple OAuth callback with ID token (iOS native)');
          
          // Verify nonce from sessionStorage
          let nonce: string | undefined;
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
            nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
            sessionStorage.removeItem('apple_oauth_nonce');
          }
          
          await socialLogin('apple', idToken, nonce);
          setStatus('success');
          
          // Redirect to main app after short delay
          redirectTimerRef.current = setTimeout(() => {
            try {
              if (router && typeof router.replace === 'function') {
                router.replace('/(tabs)');
              } else {
                console.warn('⚠️ Router not available, using window.location');
                window.location.href = '/';
              }
            } catch (error) {
              console.error('❌ Error during redirect:', error);
              window.location.href = '/';
            }
          }, 1000);
          return;
        }

        // Try to extract from hash fragment (fallback)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashToken = hashParams.get('id_token');
          const hashCode = hashParams.get('code');
          
          if (hashCode) {
            console.log('✅ Found authorization code in hash fragment');
            
            let nonce: string | undefined;
            if (window.sessionStorage) {
              nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
              sessionStorage.removeItem('apple_oauth_nonce');
            }
            
            await socialLoginWithCode('apple', hashCode, undefined, nonce);
            setStatus('success');
            redirectTimerRef.current = setTimeout(() => {
              try {
                if (router && typeof router.replace === 'function') {
                  router.replace('/(tabs)');
                } else {
                  window.location.href = '/';
                }
              } catch (error) {
                console.error('❌ Error during redirect:', error);
                window.location.href = '/';
              }
            }, 1000);
            return;
          }
          
          if (hashToken) {
            console.log('✅ Found ID token in hash fragment');
            
            let nonce: string | undefined;
            if (window.sessionStorage) {
              nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
              sessionStorage.removeItem('apple_oauth_nonce');
            }
            
            await socialLogin('apple', hashToken, nonce);
            setStatus('success');
            redirectTimerRef.current = setTimeout(() => {
              try {
                if (router && typeof router.replace === 'function') {
                  router.replace('/(tabs)');
                } else {
                  window.location.href = '/';
                }
              } catch (error) {
                console.error('❌ Error during redirect:', error);
                window.location.href = '/';
              }
            }, 1000);
            return;
          }
        }

        console.error('❌ No authorization code or ID token found in callback');
        console.error('❌ Available params:', Object.keys(params));
        setStatus('error');
        setErrorMessage('No authentication token received from Apple. Please try again.');
      } catch (error: any) {
        console.error('❌ Error processing Apple OAuth callback:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to complete Apple sign-in');
      }
    };

    processCallback();
    
    // Cleanup function to clear timeout if component unmounts
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [params, socialLogin, socialLoginWithCode, router, processed]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {status === 'processing' && (
          <>
            <ActivityIndicator size="large" color="#3b82f6" />
            <ThemedText style={styles.message}>Completing sign-in...</ThemedText>
          </>
        )}
        
        {status === 'success' && (
          <>
            <ThemedText style={styles.successMessage}>✓ Sign-in successful!</ThemedText>
            <ThemedText style={styles.message}>Redirecting...</ThemedText>
          </>
        )}
        
        {status === 'error' && (
          <>
            <ThemedText style={styles.errorMessage}>✗ Sign-in failed</ThemedText>
            <ThemedText style={styles.message}>{errorMessage}</ThemedText>
            <ThemedText 
              style={styles.link} 
              onPress={() => router.replace('/auth/login')}
            >
              Return to login
            </ThemedText>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  successMessage: {
    fontSize: 20,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ef4444',
    textAlign: 'center',
  },
  link: {
    fontSize: 16,
    color: '#3b82f6',
    marginTop: 24,
    textDecorationLine: 'underline',
  },
});

