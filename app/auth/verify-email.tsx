
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { authService } from '@/services/authService';
import { MaterialIcons } from '@expo/vector-icons';

export default function VerifyEmailScreen() {
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const router = useRouter();
  const { email, token } = useLocalSearchParams();

  // Auto-verify if token is provided in URL
  useEffect(() => {
    if (token && typeof token === 'string') {
      setInitialLoading(true);
      handleAutoVerification(token);
    }
  }, [token]);

  const handleAutoVerification = async (verificationToken: string) => {
    try {
      const result = await authService.verifyEmailToken(verificationToken);
      
      if (result.success) {
        setVerified(true);
      } else {
        Alert.alert('Verification Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Verification failed. Please try entering the code manually.');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.verifyEmailToken(verificationCode);
      
      if (result.success) {
        setVerified(true);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      Alert.alert('Error', 'Email address not found');
      return;
    }

    setResendLoading(true);
    try {
      await authService.resendEmailVerification(email as string);
      Alert.alert('Success', 'Verification code sent successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to resend verification code');
    } finally {
      setResendLoading(false);
    }
  };

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  // Show loading while auto-verifying
  if (initialLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007BFF" />
          <ThemedText style={styles.loadingText}>Verifying your email...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Show success screen
  if (verified) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.successContainer}>
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

  // Show verification form
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.content}>
        <View style={styles.header}>
          <MaterialIcons name="email" size={48} color="#007BFF" />
          <ThemedText type="title">Verify Your Email</ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
            {email 
              ? `We've sent a verification code to ${email}`
              : 'Enter your verification code below'
            }
          </ThemedText>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Verification Code</ThemedText>
            <TextInput
              style={styles.input}
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="Enter 6-digit code or paste token"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.disabled]}
            onPress={handleVerifyEmail}
            disabled={loading}
          >
            <ThemedText style={styles.verifyButtonText}>
              {loading ? 'Verifying...' : 'Verify Email'}
            </ThemedText>
          </TouchableOpacity>

          {email && (
            <TouchableOpacity
              style={[styles.resendButton, resendLoading && styles.disabled]}
              onPress={handleResendCode}
              disabled={resendLoading}
            >
              <ThemedText style={styles.resendButtonText}>
                {resendLoading ? 'Sending...' : 'Resend Code'}
              </ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/auth/login')}
          >
            <ThemedText style={styles.linkText}>
              Back to Login
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  verifyButton: {
    backgroundColor: '#007BFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    backgroundColor: '#6c757d',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  resendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#007BFF',
    fontSize: 14,
  },
});
