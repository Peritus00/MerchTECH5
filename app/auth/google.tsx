import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { profileAPI } from '@/services/api';
import { env } from '@/config/environment';
import { Platform } from 'react-native';
import { hasPendingShareResume, clearPendingShareResume } from '@/services/webShareTarget';

const GOOGLE_OAUTH_STATE_KEY = 'google_oauth_state';

/**
 * Google OAuth callback handler (web authorization code flow)
 * Handles ?code=...&state=... or ?error=... from Google redirect.
 */
export default function GoogleAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { socialLoginWithCode, refreshUser } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    const processCallback = async () => {
      try {
        processed.current = true;

        const code = params.code as string | undefined;
        const state = params.state as string | undefined;
        const error = params.error as string | undefined;

        if (error) {
          console.error('❌ Google OAuth error:', error);
          setStatus('error');
          setErrorMessage(error === 'access_denied'
            ? 'Google sign-in was cancelled'
            : `Google sign-in failed: ${error}`);
          return;
        }

        if (!code) {
          console.error('❌ No authorization code in callback');
          setStatus('error');
          setErrorMessage('No authentication code received from Google');
          return;
        }

        if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
          const storedState = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
          sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
          if (!state || state !== storedState) {
            console.error('❌ Google OAuth state mismatch');
            setStatus('error');
            setErrorMessage('Invalid authentication state. Please try again.');
            return;
          }
        }

        const redirectUri = `${env.oauthCallbackHost.replace(/\/+$/, '')}/auth/google`;
        const isLinkMode = Platform.OS === 'web' && typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem('google_oauth_mode') === 'link';
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('google_oauth_mode');
        }

        if (isLinkMode) {
          await profileAPI.linkGoogleWeb(code, redirectUri);
          await refreshUser();
          setStatus('success');
          setTimeout(() => router.replace('/(tabs)/settings/profile'), 1000);
          return;
        }

        await socialLoginWithCode('google', code, redirectUri);
        setStatus('success');
        const redirectTo = Platform.OS === 'web' && hasPendingShareResume()
          ? (() => { clearPendingShareResume(); return '/handle-share'; })()
          : '/(tabs)';
        setTimeout(() => router.replace(redirectTo), 1000);
      } catch (error: any) {
        console.error('❌ Error processing Google OAuth callback:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to complete Google sign-in');
      }
    };

    processCallback();
  }, [params, socialLoginWithCode, refreshUser, router]);

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

