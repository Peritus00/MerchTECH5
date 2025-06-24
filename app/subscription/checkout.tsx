
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

export default function SubscriptionCheckoutScreen() {
  const { tier, newUser } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeHook, setStripeHook] = useState(null);
  const [CardFieldComponent, setCardFieldComponent] = useState(null);

  // Payment form state for web
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expMonth: '',
    expYear: '',
    cvv: '',
    cardholderName: ''
  });

  const isNewUser = newUser === 'true';
  const tierInfo = SUBSCRIPTION_TIERS[tier as string];

  // Dynamically load Stripe components only on mobile
  useEffect(() => {
    const loadStripe = async () => {
      if (Platform.OS !== 'web') {
        try {
          console.log('Loading Stripe React Native for mobile...');
          const StripeModule = await import('@stripe/stripe-react-native');
          const { useStripe, CardField } = StripeModule;
          
          setCardFieldComponent(() => CardField);
          setStripeReady(true);
          console.log('Stripe React Native loaded successfully');
        } catch (error) {
          console.warn('Failed to load Stripe React Native:', error);
          setStripeReady(false);
        }
      } else {
        console.log('Web platform - skipping Stripe React Native');
        setStripeReady(true);
      }
    };

    loadStripe();
  }, []);

  useEffect(() => {
    if (!tier || !tierInfo) {
      router.push('/subscription');
      return;
    }
    initializePayment();
  }, [tier]);

  const initializePayment = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api'}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriptionTier: tier,
          amount: tierInfo.price * 100,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error('Subscription creation error:', error);
      Alert.alert(
        'Error',
        'Failed to initialize payment. Please try again.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  };

  const handleMobilePayment = async () => {
    if (Platform.OS === 'web') {
      handleWebPayment();
      return;
    }

    try {
      setIsLoading(true);
      console.log('🔥 Starting mobile payment process for tier:', tier);

      // Dynamically import and use Stripe
      const StripeModule = await import('@stripe/stripe-react-native');
      const { useStripe } = StripeModule;
      
      // This won't work in this context - we need to handle this differently
      Alert.alert(
        'Mobile Payment',
        'Mobile payment processing will redirect to Stripe checkout',
        [
          {
            text: 'Continue',
            onPress: () => handleWebCheckout()
          },
          {
            text: 'Cancel',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      console.error('🔥 Mobile payment processing error:', error);
      Alert.alert('Payment Failed', 'Please try the web checkout option.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebPayment = async () => {
    try {
      setIsLoading(true);
      console.log('🔥 Starting web payment process for tier:', tier);
      await handleWebCheckout();
    } catch (error) {
      console.error('🔥 Web payment processing error:', error);
      Alert.alert('Payment Failed', error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebCheckout = async () => {
    try {
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
          successUrl: `${window.location.origin}/subscription/success?tier=${tier}&newUser=${isNewUser}`,
          cancelUrl: `${window.location.origin}/subscription/checkout?tier=${tier}&newUser=${isNewUser}`
        })
      });

      const result = await response.json();

      if (result.success && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        throw new Error(result.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout session error:', error);
      throw error;
    }
  };

  const updateSubscription = async (paymentIntent) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const updateResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api'}/user/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriptionTier: tier,
          stripeCustomerId: paymentIntent.customer,
          stripeSubscriptionId: paymentIntent.id
        })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update subscription');
      }

      router.push(`/subscription/success?tier=${tier}&newUser=${isNewUser}&customerId=${paymentIntent.customer}&subscriptionId=${paymentIntent.id}`);
    } catch (error) {
      console.error('🔥 Subscription update error:', error);
      Alert.alert('Error', 'Payment successful but failed to update subscription. Please contact support.');
    }
  };

  const renderPaymentForm = () => {
    if (Platform.OS === 'web') {
      // Web: Simple message about Stripe Checkout redirect
      return (
        <View style={styles.cardContainer}>
          <ThemedText style={styles.sectionTitle}>Payment Information</ThemedText>
          <View style={styles.webPaymentInfo}>
            <ThemedText style={styles.webPaymentText}>
              You will be redirected to Stripe's secure checkout page to complete your payment.
            </ThemedText>
            <ThemedText style={styles.webPaymentSubtext}>
              Your payment information is processed securely by Stripe.
            </ThemedText>
          </View>
        </View>
      );
    } else {
      // Mobile: Show loading or redirect message
      return (
        <View style={styles.cardContainer}>
          <ThemedText style={styles.sectionTitle}>Payment Information</ThemedText>
          <View style={styles.webPaymentInfo}>
            <ThemedText style={styles.webPaymentText}>
              You will be redirected to secure checkout to complete your payment.
            </ThemedText>
            <ThemedText style={styles.webPaymentSubtext}>
              Your payment information is processed securely by Stripe.
            </ThemedText>
          </View>
        </View>
      );
    }
  };

  const handlePayment = () => {
    if (Platform.OS === 'web') {
      handleWebPayment();
    } else {
      handleMobilePayment();
    }
  };

  if (!tierInfo) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Invalid subscription tier</ThemedText>
      </ThemedView>
    );
  }

  if (!stripeReady) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <ThemedText style={styles.loadingText}>Loading payment system...</ThemedText>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
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
  webPaymentInfo: {
    alignItems: 'center',
  },
  webPaymentText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  webPaymentSubtext: {
    fontSize: 14,
    textAlign: 'center',
    color: '#6b7280',
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
