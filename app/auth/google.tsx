import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { Platform } from 'react-native';

/**
 * Google OAuth callback handler
 * This route handles the redirect from Google OAuth flow
 * Used as a fallback if expo-auth-session redirect flow is used
 */
export default function GoogleAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { socialLogin } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      try {
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

        if (!idToken) {
          // Try to extract from hash fragment (some OAuth flows use hash)
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const hashToken = hashParams.get('id_token');
            if (hashToken) {
              console.log('✅ Found ID token in hash fragment');
              await socialLogin('google', hashToken);
              setStatus('success');
              setTimeout(() => {
                router.replace('/(tabs)');
              }, 1000);
              return;
            }
          }

          console.error('❌ No ID token found in callback');
          setStatus('error');
          setErrorMessage('No authentication token received from Google');
          return;
        }

        console.log('✅ Processing Google OAuth callback with ID token');
        await socialLogin('google', idToken);
        setStatus('success');
        
        // Redirect to main app after short delay
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 1000);
      } catch (error: any) {
        console.error('❌ Error processing Google OAuth callback:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to complete Google sign-in');
      }
    };

    processCallback();
  }, [params, socialLogin, router]);

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

