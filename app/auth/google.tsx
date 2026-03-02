import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { profileAPI } from '@/services/api';
import { Platform } from 'react-native';

/**
 * Google OAuth callback handler
 * Handles both login and account linking flows (link mode set via sessionStorage)
 */
export default function GoogleAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { socialLogin, refreshUser } = useAuth();
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
        
        // Check for ID token in URL params (from expo-auth-session redirect)
        const idToken = params.id_token as string | undefined;
        const error = params.error as string | undefined;

        if (error) {
          console.error('❌ Google OAuth error:', error);
          setStatus('error');
          setErrorMessage(error === 'access_denied' 
            ? 'Google sign-in was cancelled' 
            : `Google sign-in failed: ${error}`);
          return;
        }

        let tokenToUse = idToken;
        if (!tokenToUse && Platform.OS === 'web' && typeof window !== 'undefined') {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          tokenToUse = hashParams.get('id_token') || undefined;
        }

        if (!tokenToUse) {
          console.error('❌ No ID token found in callback');
          setStatus('error');
          setErrorMessage('No authentication token received from Google');
          return;
        }

        if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('google_oauth_nonce');
          const isLinkMode = sessionStorage.getItem('google_oauth_mode') === 'link';
          sessionStorage.removeItem('google_oauth_mode');

          if (isLinkMode) {
            await profileAPI.linkGoogle(tokenToUse);
            await refreshUser();
            setStatus('success');
            setTimeout(() => router.replace('/(tabs)/settings/profile'), 1000);
            return;
          }
        }

        await socialLogin('google', tokenToUse);
        setStatus('success');
        setTimeout(() => router.replace('/(tabs)'), 1000);
      } catch (error: any) {
        console.error('❌ Error processing Google OAuth callback:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to complete Google sign-in');
      }
    };

    processCallback();
  }, [params, socialLogin, refreshUser, router, processed]);

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

