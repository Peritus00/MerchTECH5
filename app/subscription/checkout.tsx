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

// Platform-specific Stripe imports
let useStripe, CardField, StripeCardElement;

// Only import Stripe React Native on mobile platforms
if (Platform.OS !== 'web') {
  try {
    // Mobile: Use React Native Stripe
    const StripeRN = require('@stripe/stripe-react-native');
    useStripe = StripeRN.useStripe;
    CardField = StripeRN.CardField;
  } catch (error) {
    console.warn('Stripe React Native not available:', error);
  }
} else {
  // Web: Use web-based payment processing
  console.log('Web platform detected - using web payment form');
}

export default function SubscriptionCheckoutScreen() {
  const { tier, newUser } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [cardComplete, setCardComplete] = useState(false);

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

  // Mobile Stripe hook (only available on mobile)
  const mobileStripe = Platform.OS !== 'web' && useStripe ? useStripe() : null;

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
    if (!mobileStripe || !mobileStripe.confirmPayment) {
      Alert.alert('Error', 'Stripe not initialized for mobile');
      return;
    }

    try {
      setIsLoading(true);
      console.log('🔥 Starting mobile payment process for tier:', tier);

      const { error, paymentIntent } = await mobileStripe.confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: user?.username || 'Customer',
            email: user?.email,
          },
        },
      });

      if (error) {
        console.error('🔥 Mobile payment error:', error);
        Alert.alert('Payment Failed', error.message || 'Payment could not be processed.');
        return;
      }

      if (paymentIntent && paymentIntent.status === 'Succeeded') {
        await updateSubscription(paymentIntent);
      }
    } catch (error) {
      console.error('🔥 Mobile payment processing error:', error);
      Alert.alert('Payment Failed', error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebPayment = async () => {
    if (!isWebCardComplete()) {
      Alert.alert('Invalid Payment Details', 'Please enter complete payment information.');
      return;
    }

    try {
      setIsLoading(true);
      console.log('🔥 Starting web payment process for tier:', tier);

      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api'}/stripe/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientSecret,
          subscriptionTier: tier,
          paymentDetails: {
            cardNumber: cardDetails.number.replace(/\s/g, ''),
            expMonth: cardDetails.expMonth,
            expYear: cardDetails.expYear,
            cvv: cardDetails.cvv,
            cardholderName: cardDetails.cardholderName || user?.username || 'Customer'
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        router.push(`/subscription/success?tier=${tier}&newUser=${isNewUser}&customerId=${result.customerId}&subscriptionId=${result.subscriptionId}`);
      } else {
        throw new Error(result.error || 'Payment processing failed');
      }
    } catch (error) {
      console.error('🔥 Web payment processing error:', error);
      Alert.alert('Payment Failed', error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSubscription = async (paymentIntent: any) => {
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

  const isWebCardComplete = () => {
    return cardDetails.number.replace(/\s/g, '').length >= 13 &&
           cardDetails.expMonth.length === 2 &&
           cardDetails.expYear.length === 4 &&
           cardDetails.cvv.length >= 3;
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = cleaned.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return text;
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

  const renderPaymentForm = () => {
    if (Platform.OS === 'web') {
      // Web: Simple payment message with redirect to Stripe Checkout
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
      // Mobile: Use React Native Stripe CardField
      return CardField ? (
        <View style={styles.cardContainer}>
          <ThemedText style={styles.sectionTitle}>Payment Information</ThemedText>
          <CardField
            postalCodeEnabled={true}
            placeholders={{
              number: '4242 4242 4242 4242',
            }}
            cardStyle={{
              backgroundColor: '#FFFFFF',
              textColor: '#000000',
            }}
            style={styles.cardField}
            onCardChange={(cardDetails) => {
              setCardComplete(cardDetails.complete);
            }}
          />
        </View>
      ) : (
        <View style={styles.cardContainer}>
          <ThemedText style={styles.errorText}>Payment form not available on this platform</ThemedText>
        </View>
      );
    }
  };

  const isPaymentReady = Platform.OS === 'web' ? isWebCardComplete() : cardComplete;

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
            style={[styles.payButton, (isLoading || !isPaymentReady) && styles.payButtonDisabled]}
            onPress={handlePayment}
            disabled={isLoading || !isPaymentReady}
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

const webInputStyles = {
  width: '100%',
  padding: '12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '16px',
  backgroundColor: '#ffffff',
  outline: 'none'
};

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
  paymentForm: {
    gap: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginVertical: 20,
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
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    padding: 20,
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
});