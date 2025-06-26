
<old_str>
import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialIcons } from '@expo/vector-icons';

export default function VerifyEmailScreen() {
  const router = useRouter();

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  // Always show success screen - email verification happens on server side
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
</old_str>
<new_str>
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialIcons } from '@expo/vector-icons';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already_verified'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Check URL parameters to determine status
    if (params.verified === 'true') {
      setStatus('success');
    } else if (params.already_verified === 'true') {
      setStatus('already_verified');
    } else if (params.error) {
      setStatus('error');
      switch (params.error) {
        case 'invalid_token':
          setErrorMessage('The verification link is invalid or has expired. Please request a new verification email.');
          break;
        case 'user_not_found':
          setErrorMessage('User account not found. Please contact support if this error persists.');
          break;
        case 'update_failed':
          setErrorMessage('Failed to update your account. Please try again or contact support.');
          break;
        case 'server_error':
          setErrorMessage('A server error occurred. Please try again later or contact support.');
          break;
        default:
          setErrorMessage('An unknown error occurred during verification. Please try again.');
      }
    } else {
      // Default to success if no specific parameters
      setStatus('success');
    }
  }, [params]);

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  const handleRetryLogin = () => {
    router.replace('/auth/login');
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      'Please email help@mertech.net for assistance with your account verification.',
      [{ text: 'OK' }]
    );
  };

  const renderSuccessView = () => (
    <View style={styles.centerContainer}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="check-circle" size={100} color="#22c55e" />
        <View style={styles.successBadge}>
          <MaterialIcons name="verified" size={24} color="#fff" />
        </View>
      </View>
      
      <ThemedText type="title" style={styles.successTitle}>
        🎉 Email Verified!
      </ThemedText>
      
      <ThemedText style={styles.successSubtitle}>
        Welcome to MerchTech QR Platform
      </ThemedText>
      
      <View style={styles.featuresContainer}>
        <ThemedText style={styles.featuresTitle}>
          Your account is now fully activated with access to:
        </ThemedText>
        
        <View style={styles.featuresList}>
          <View style={styles.featureItem}>
            <MaterialIcons name="qr-code" size={20} color="#22c55e" />
            <ThemedText style={styles.featureText}>QR Code Generation & Management</ThemedText>
          </View>
          
          <View style={styles.featureItem}>
            <MaterialIcons name="analytics" size={20} color="#22c55e" />
            <ThemedText style={styles.featureText}>Analytics Dashboard</ThemedText>
          </View>
          
          <View style={styles.featureItem}>
            <MaterialIcons name="cloud-upload" size={20} color="#22c55e" />
            <ThemedText style={styles.featureText}>Media Upload & Management</ThemedText>
          </View>
          
          <View style={styles.featureItem}>
            <MaterialIcons name="store" size={20} color="#22c55e" />
            <ThemedText style={styles.featureText}>Store Integration</ThemedText>
          </View>
          
          <View style={styles.featureItem}>
            <MaterialIcons name="star" size={20} color="#22c55e" />
            <ThemedText style={styles.featureText}>Premium Features</ThemedText>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={handleContinue}
      >
        <MaterialIcons name="dashboard" size={20} color="#fff" style={styles.buttonIcon} />
        <ThemedText style={styles.continueButtonText}>
          Start Using MerchTech QR
        </ThemedText>
      </TouchableOpacity>
      
      <ThemedText style={styles.welcomeNote}>
        Thank you for choosing MerchTech QR Platform!
      </ThemedText>
    </View>
  );

  const renderAlreadyVerifiedView = () => (
    <View style={styles.centerContainer}>
      <MaterialIcons name="verified-user" size={80} color="#3b82f6" />
      <ThemedText type="title" style={styles.infoTitle}>
        Already Verified
      </ThemedText>
      <ThemedText style={styles.infoText}>
        Your email is already verified! You can continue using all MerchTech features.
      </ThemedText>

      <TouchableOpacity
        style={[styles.continueButton, { backgroundColor: '#3b82f6' }]}
        onPress={handleContinue}
      >
        <ThemedText style={styles.continueButtonText}>
          Go to Dashboard
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderErrorView = () => (
    <View style={styles.centerContainer}>
      <MaterialIcons name="error" size={80} color="#ef4444" />
      <ThemedText type="title" style={styles.errorTitle}>
        Verification Failed
      </ThemedText>
      <ThemedText style={styles.errorText}>
        {errorMessage}
      </ThemedText>

      <View style={styles.errorActions}>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetryLogin}
        >
          <ThemedText style={styles.retryButtonText}>
            Back to Login
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.supportButton}
          onPress={handleContactSupport}
        >
          <ThemedText style={styles.supportButtonText}>
            Contact Support
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLoadingView = () => (
    <View style={styles.centerContainer}>
      <MaterialIcons name="hourglass-empty" size={80} color="#6b7280" />
      <ThemedText style={styles.loadingText}>
        Processing verification...
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {status === 'loading' && renderLoadingView()}
        {status === 'success' && renderSuccessView()}
        {status === 'already_verified' && renderAlreadyVerifiedView()}
        {status === 'error' && renderErrorView()}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: '100%',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  successBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#22c55e',
    borderRadius: 20,
    padding: 4,
    borderWidth: 3,
    borderColor: '#fff',
  },
  successTitle: {
    textAlign: 'center',
    marginBottom: 8,
    color: '#22c55e',
  },
  successSubtitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 32,
    opacity: 0.8,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 32,
  },
  featuresTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
    opacity: 0.9,
  },
  featuresList: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 250,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonIcon: {
    marginRight: 8,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  welcomeNote: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  infoTitle: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
    color: '#3b82f6',
  },
  infoText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    opacity: 0.8,
    maxWidth: 300,
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
    maxWidth: 350,
  },
  errorActions: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  supportButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6b7280',
  },
  supportButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
</new_str>
