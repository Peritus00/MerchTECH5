import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { Platform } from 'react-native';

/**
 * Apple Sign-In callback handler
 * This route handles the redirect from Apple OAuth flow
 */
export default function AppleAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { socialLogin } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [processed, setProcessed] = useState(false);

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
        
        // Apple Sign-In with form_post response mode sends data via POST
        // But since we're using a client-side route, Apple will redirect with the data
        // Check for identity token in URL params (form_post redirects with data in URL)
        const idToken = params.id_token as string | undefined;
        const code = params.code as string | undefined;
        const error = params.error as string | undefined;
        const state = params.state as string | undefined;
        const user = params.user as string | undefined; // JSON string with user info

        if (error) {
          console.error('❌ Apple OAuth error:', error);
          setStatus('error');
          setErrorMessage(error === 'user_cancelled_authorize' 
            ? 'Apple sign-in was cancelled' 
            : `Apple sign-in failed: ${error}`);
          return;
        }

        // Apple Sign-In with form_post: Check URL params first (form_post may redirect)
        // If we have an id_token, use it directly
        if (idToken) {
          console.log('✅ Processing Apple OAuth callback with ID token from params');
          
          // Verify nonce from sessionStorage
          let nonce: string | undefined;
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
            nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
            sessionStorage.removeItem('apple_oauth_nonce');
          }
          
          await socialLogin('apple', idToken, nonce);
          setStatus('success');
          
          // Redirect to main app after short delay
          setTimeout(() => {
            router.replace('/(tabs)');
          }, 1000);
          return;
        }

        // Try to extract from hash fragment (fallback for query mode)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashToken = hashParams.get('id_token');
          if (hashToken) {
            console.log('✅ Found ID token in hash fragment');
            
            // Verify nonce from sessionStorage
            let nonce: string | undefined;
            if (window.sessionStorage) {
              nonce = sessionStorage.getItem('apple_oauth_nonce') || undefined;
              sessionStorage.removeItem('apple_oauth_nonce');
            }
            
            await socialLogin('apple', hashToken, nonce);
            setStatus('success');
            setTimeout(() => {
              router.replace('/(tabs)');
            }, 1000);
            return;
          }
        }

        // For form_post, Apple may POST data - check if we need to handle POST
        // Since this is a client-side route, form_post will redirect back with data
        // If we still don't have a token, check the document body for a form
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
          // Check if there's a form in the body (form_post creates a form that auto-submits)
          const forms = document.querySelectorAll('form');
          if (forms.length > 0) {
            console.log('🍎 Found form in document (form_post response)');
            // The form will auto-submit, so we need to wait for it
            // But actually, form_post should redirect, so this shouldn't happen
          }
        }

        // If we have a code, Apple requires server-side exchange
        // For now, show helpful error message
        if (code) {
          console.error('❌ Received authorization code instead of ID token');
          console.error('❌ Code exchange requires server-side handling');
          setStatus('error');
          setErrorMessage('Apple Sign-In returned an authorization code. Please contact support or try again.');
          return;
        }

        console.error('❌ No ID token found in callback');
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
  }, [params, socialLogin, router, processed]);

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

