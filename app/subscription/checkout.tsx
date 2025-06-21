
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';

export default function SubscriptionCheckoutScreen() {
  const { tier } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');

  const tierInfo = SUBSCRIPTION_TIERS[tier as string];

  useEffect(() => {
    if (!tier || !tierInfo) {
      router.push('/subscription');
      return;
    }
    // Initialize payment
    initializePayment();
  }, [tier]);

  const initializePayment = async () => {
    try {
      // In production, make API call to create subscription payment intent
      // For now, simulate the setup
      setClientSecret('pi_mock_client_secret');
    } catch (error) {
      console.error('Subscription creation error:', error);
      Alert.alert(
        'Error',
        'Failed to initialize payment. Please try again.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  };

  const handlePayment = async () => {
    try {
      setIsLoading(true);
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Navigate to success screen
      router.push(`/subscription/success?tier=${tier}`);
    } catch (error) {
      Alert.alert('Payment Failed', 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!tierInfo) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Invalid subscription tier</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.backButton}>← Back</ThemedText>
        </TouchableOpacity>
      </View>

      <ThemedView style={styles.planHeader}>
        <View style={styles.iconContainer}>
          <ThemedText style={styles.iconText}>⭐</ThemedText>
        </View>
        <ThemedText type="title" style={styles.planName}>{tierInfo.name} Plan</ThemedText>
        <ThemedText style={styles.price}>${tierInfo.price}/month</ThemedText>
      </ThemedView>

      <ThemedView style={styles.featuresContainer}>
        <ThemedText type="subtitle" style={styles.featuresTitle}>What's included:</ThemedText>
        {tierInfo.features.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText style={styles.featureText}>{feature}</ThemedText>
          </View>
        ))}
      </ThemedView>

      <ThemedView style={styles.paymentContainer}>
        <ThemedText type="subtitle" style={styles.paymentTitle}>Payment Method</ThemedText>
        <View style={styles.cardPlaceholder}>
          <ThemedText style={styles.cardText}>Credit Card Information</ThemedText>
          <ThemedText style={styles.cardSubtext}>Secure payment powered by Stripe</ThemedText>
        </View>
      </ThemedView>

      <TouchableOpacity
        style={[styles.payButton, isLoading && styles.payButtonDisabled]}
        onPress={handlePayment}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <ThemedText style={styles.payButtonText}>
            Subscribe for ${tierInfo.price}/month
          </ThemedText>
        )}
      </TouchableOpacity>

      <ThemedText style={styles.disclaimer}>
        You can cancel anytime. No hidden fees or long-term commitments.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    color: '#007BFF',
  },
  planHeader: {
    alignItems: 'center',
    marginBottom: 32,
    padding: 24,
    borderRadius: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#fef3c7',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  planName: {
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
  featuresContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  featuresTitle: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    opacity: 0.7,
    marginRight: 8,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  paymentContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  paymentTitle: {
    marginBottom: 16,
  },
  cardPlaceholder: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  cardText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 4,
  },
  cardSubtext: {
    fontSize: 14,
    opacity: 0.5,
  },
  payButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 18,
  },
});
