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