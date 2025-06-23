import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { authService } from '@/services/authService';
import { MaterialIcons } from '@expo/vector-icons';

export default function VerifyEmailScreen() {
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { email, token } = useLocalSearchParams();

  // Auto-verify when component mounts if token is provided
  useEffect(() => {
    if (token && typeof token === 'string') {
      console.log('🔥 AUTO-VERIFICATION: Token found in URL, starting automatic verification');
      handleAutoVerification(token);
    } else {
      console.log('🔥 AUTO-VERIFICATION: No token provided - showing success message');
      // If no token provided, assume they came from clicking email link and show success
      setVerified(true);
    }
  }, [token]);

  const handleAutoVerification = async (verificationToken: string) => {
    setLoading(true);
    try {
      console.log('🔥 AUTO-VERIFICATION: Calling backend with token:', verificationToken.substring(0, 20) + '...');

      const result = await authService.verifyEmailToken(verificationToken);
      console.log('🔥 AUTO-VERIFICATION: Backend response:', result);

      if (result.success) {
        console.log('🔥 AUTO-VERIFICATION: SUCCESS! Email verified automatically');
        setVerified(true);
        setError(null);
      } else {
        console.log('🔥 AUTO-VERIFICATION: FAILED:', result.message);
        setError(result.message || 'Verification failed. Please try again.');
      }
    } catch (error) {
      console.error('🔥 AUTO-VERIFICATION: ERROR:', error);
      setError('Verification failed. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  const handleTryAgain = () => {
    router.replace('/auth/login');
  };

  // Show loading while verifying
  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007BFF" />
          <ThemedText style={styles.loadingText}>Verifying your email...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Show error screen
  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centerContainer}>
          <MaterialIcons name="error-outline" size={80} color="#ef4444" />
          <ThemedText type="title" style={styles.errorTitle}>
            Verification Failed
          </ThemedText>
          <ThemedText style={styles.errorText}>
            {error}
          </ThemedText>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleTryAgain}
          >
            <ThemedText style={styles.retryButtonText}>
              Try Again
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // Show success screen (default when no token or after successful verification)
  return (
    <ThemedView style={styles.container}>
      <View style={styles.centerContainer}>
        <MaterialIcons name="check-circle" size={80} color="#22c55e" />
        <ThemedText type="title" style={styles.successTitle}>
          Email Verified!
        </ThemedText>
        <ThemedText style={styles.successText}>
          Your email has been successfully verified. You can now access all features of MerchTech.
        </ThemedText>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
        >
          <ThemedText style={styles.continueButtonText}>
            Continue to Dashboard
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  successTitle: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  successText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    opacity: 0.8,
  },
  continueButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 200,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorTitle: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
    color: '#ef4444',
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    opacity: 0.8,
    color: '#ef4444',
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 200,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});