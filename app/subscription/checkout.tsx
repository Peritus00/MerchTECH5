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
import { useStripe, CardField } from '@stripe/stripe-react-native';
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
  const { confirmPayment } = useStripe();
  const isNewUser = newUser === 'true';

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
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev/api'}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriptionTier: tier,
          amount: tierInfo.price * 100, // Convert to cents
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

  const handlePayment = async () => {
    if (!cardComplete) {
      Alert.alert('Invalid Payment Details', 'Please enter complete payment information.');
      return;
    }

    if (!clientSecret) {
      Alert.alert('Error', 'Payment not initialized. Please try again.');
      return;
    }

    try {
      setIsLoading(true);
      console.log('Starting secure payment process for tier:', tier);

      // Use Stripe's secure payment confirmation
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: user?.username || 'Customer',
            email: user?.email,
          },
        },
      });

      if (error) {
        console.error('Payment confirmation error:', error);
        Alert.alert('Payment Failed', error.message || 'Payment could not be processed.');
        return;
      }

      if (paymentIntent.status === 'Succeeded') {
        console.log('Payment successful, updating user subscription...');

        // Update user subscription tier
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
          const updateError = await updateResponse.json();
          console.error('Failed to update subscription:', updateError);
          throw new Error('Failed to update subscription');
        }

        console.log('Subscription updated successfully, navigating to success page...');

        // Navigate to success screen
        router.push(`/subscription/success?tier=${tier}&newUser=${isNewUser}&customerId=${paymentIntent.customer}&subscriptionId=${paymentIntent.id}`);
      } else {
        throw new Error(`Payment status: ${paymentIntent.status}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      Alert.alert(
        'Payment Failed', 
        error.message || 'An unexpected error occurred. Please try again.',
        [{ text: 'OK' }]
      );
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

        <View style={styles.paymentForm}>
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

          <View style={styles.securityBadge}>
            <ThemedText style={styles.securityText}>🔒 Secure payment powered by Stripe</ThemedText>
          </View>
        </View>
      </ThemedView>

      <TouchableOpacity
        style={[styles.payButton, isLoading && styles.payButtonDisabled]}
        onPress={handlePayment}
        disabled={isLoading || !cardComplete}
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
  paymentForm: {
    gap: 16,
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
});