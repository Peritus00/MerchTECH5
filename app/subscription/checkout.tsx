` tags.

```python
<replit_final_file>
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';

// Define API_BASE_URL here or import it from a config file
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api';

export default function SubscriptionCheckoutScreen() {
  const { tier, newUser } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState(tier as string); // Initialize with the tier from params
  const [loading, setLoading] = useState(false);

  const isNewUser = newUser === 'true';
  const tierInfo = SUBSCRIPTION_TIERS[tier as string];

  useEffect(() => {
    if (!tier || !tierInfo) {
      router.push('/subscription');
      return;
    }
  }, [tier]);

  useEffect(() => {
    console.log('Platform detected:', Platform.OS);
  }, []);

  const handlePayment = async () => {
    try {
      setIsLoading(true);
      console.log('🔥 Starting secure checkout for tier:', tier);

      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api'}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriptionTier: tier,
          amount: tierInfo.price * 100,
          successUrl: Platform.OS === 'web' 
            ? `${window.location.origin}/subscription/success?tier=${tier}&newUser=${isNewUser}`
            : `https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/subscription/success?tier=${tier}&newUser=${isNewUser}`,
          cancelUrl: Platform.OS === 'web'
            ? `${window.location.origin}/subscription/checkout?tier=${tier}&newUser=${isNewUser}`
            : `https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/subscription/checkout?tier=${tier}&newUser=${isNewUser}`
        })
      });

      const result = await response.json();

      if (result.success && result.url) {
        if (Platform.OS === 'web') {
          // Web: Direct redirect
          window.location.href = result.url;
        } else {
          // Mobile: Use Expo WebBrowser for in-app browser
          const { WebBrowser } = require('expo-web-browser');
          await WebBrowser.openBrowserAsync(result.url);
        }
      } else {
        throw new Error(result.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('🔥 Payment processing error:', error);
      Alert.alert('Payment Failed', error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPaymentForm = () => {
    return (
      <View style={styles.cardContainer}>
        <ThemedText style={styles.sectionTitle}>Secure Payment</ThemedText>
        <View style={styles.paymentInfo}>
          <ThemedText style={styles.paymentText}>
            You will be redirected to Stripe's secure checkout page to complete your payment safely and securely.
          </ThemedText>
          <ThemedText style={styles.paymentSubtext}>
            • SSL encrypted payment processing{'\n'}
            • Support for all major credit and debit cards{'\n'}
            • No payment information stored on our servers
          </ThemedText>
        </View>
      </View>
    );
  };

  const updateUserSubscription = async (tier, customerId, paymentIntentId) => {
      try {
          const token = await AsyncStorage.getItem('authToken');
          const updateResponse = await fetch(`${API_BASE_URL}/api/user/update-subscription`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                  subscriptionTier: tier,
                  stripeCustomerId: customerId,
                  stripePaymentIntentId: paymentIntentId,
              }),
          });

          if (!updateResponse.ok) {
              throw new Error('Failed to update subscription');
          }

          console.log('Subscription updated successfully!');
          Alert.alert('Subscription Successful', 'Your subscription has been successfully updated.');
          router.push('/home');

      } catch (error) {
          console.error('Subscription update error:', error);
          Alert.alert('Subscription Update Failed', error.message || 'Please try again.');
      }
  };


  const handleWebCheckout = async () => {
    if (!selectedTier) return;

    setLoading(true);
    try {
      console.log('Starting web checkout process...');
        const token = await AsyncStorage.getItem('authToken');

      // Create payment intent on the backend
      const response = await fetch(`${API_BASE_URL}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscriptionTier: selectedTier,
          amount: tierInfo.price * 100, // Convert to cents
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const { clientSecret, customerId } = await response.json();

      // For demo purposes, simulate successful payment
      console.log('Payment intent created, simulating successful payment...');

      // Update user subscription
      await updateUserSubscription(selectedTier, customerId, 'demo_payment_' + Date.now());

      console.log('Web checkout completed successfully');
    } catch (error) {
      console.error('Web checkout error:', error);
      Alert.alert('Checkout Failed', error.message || 'Please try again');
    } finally {
      setLoading(false);
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

      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
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
            {renderPaymentForm()}
            <View style={styles.securityBadge}>
              <ThemedText style={styles.securityText}>🔒 Secure payment powered by Stripe</ThemedText>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
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
  cardContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  paymentInfo: {
    alignItems: 'center',
  },
  paymentText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  paymentSubtext: {
    fontSize: 14,
    textAlign: 'left',
    color: '#6b7280',
    lineHeight: 20,
  },
  securityBadge: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  securityText: {
    fontSize: 12,
    opacity: 0.8,
    color: '#6b7280',
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
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 18,
    color: '#6b7280',
  },
});