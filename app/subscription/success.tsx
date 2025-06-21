
import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';

export default function SubscriptionSuccessScreen() {
  const { tier, newUser } = useLocalSearchParams();
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const isNewUser = newUser === 'true';
  
  const selectedTier = SUBSCRIPTION_TIERS[tier as string];

  useEffect(() => {
    // Clear the new user flag once they complete subscription selection
    if (isNewUser && user?.isNewUser) {
      updateProfile({ isNewUser: false });
    }
  }, [isNewUser, user, updateProfile]);

  if (!selectedTier) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.successContainer}>
        <View style={styles.iconContainer}>
          <ThemedText style={styles.successIcon}>✅</ThemedText>
        </View>
        
        <ThemedText type="title" style={styles.title}>
          {isNewUser ? `Welcome to MerchTech ${selectedTier.name}!` : `Welcome to ${selectedTier.name}!`}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {isNewUser 
            ? 'Your account is set up and your subscription is active! You can now start creating QR codes and managing your media.'
            : 'Your subscription is now active and ready to use.'
          }
        </ThemedText>t>

        <ThemedView style={styles.planDetails}>
          <ThemedText type="subtitle" style={styles.planName}>{selectedTier.name} Plan</ThemedText>
          <ThemedText style={styles.planPrice}>${selectedTier.price}/month</ThemedText>
          
          <View style={styles.featuresContainer}>
            {selectedTier.features.slice(0, 3).map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <ThemedText style={styles.checkmark}>✓</ThemedText>
                <ThemedText style={styles.featureText}>{feature}</ThemedText>
              </View>
            ))}
          </View>
        </ThemedView>

        <ThemedText style={styles.description}>
          Your subscription is now active! You can start using all the features included in your plan.
        </ThemedText>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)/')}
          >
            <ThemedText style={styles.primaryButtonText}>Go to Dashboard</ThemedText>
            <ThemedText style={styles.arrow}>→</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/subscription')}
          >
            <ThemedText style={styles.secondaryButtonText}>Manage Subscription</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  successContainer: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 64,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
  },
  planDetails: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  planName: {
    textAlign: 'center',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22c55e',
    textAlign: 'center',
    marginBottom: 16,
  },
  featuresContainer: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  arrow: {
    color: '#fff',
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
