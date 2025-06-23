
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
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
  const [paymentMethod, setPaymentMethod] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
  });
  const [errors, setErrors] = useState({});
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev:5000/api'}/stripe/create-payment-intent`, {
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

  const validatePaymentForm = () => {
    const newErrors = {};
    
    if (!paymentMethod.cardNumber || paymentMethod.cardNumber.length < 16) {
      newErrors.cardNumber = 'Valid card number required';
    }
    
    if (!paymentMethod.expiryDate || !/^\d{2}\/\d{2}$/.test(paymentMethod.expiryDate)) {
      newErrors.expiryDate = 'Valid expiry date required (MM/YY)';
    }
    
    if (!paymentMethod.cvv || paymentMethod.cvv.length < 3) {
      newErrors.cvv = 'Valid CVV required';
    }
    
    if (!paymentMethod.cardholderName.trim()) {
      newErrors.cardholderName = 'Cardholder name required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatCardNumber = (text) => {
    // Remove all non-digits
    const cleaned = text.replace(/\D/g, '');
    
    // Limit to 16 digits
    const limited = cleaned.substring(0, 16);
    
    // Add spaces every 4 digits
    const formatted = limited.replace(/(\d{4})(?=\d)/g, '$1 ');
    
    return formatted;
  };

  const formatExpiryDate = (text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.substring(0, 2) + '/' + cleaned.substring(2, 4);
    }
    return cleaned;
  };

  const handlePayment = async () => {
    if (!validatePaymentForm()) {
      Alert.alert('Invalid Payment Details', 'Please check your payment information and try again.');
      return;
    }

    try {
      setIsLoading(true);
      console.log('Starting payment process for tier:', tier);
      
      const token = await AsyncStorage.getItem('authToken');
      
      if (!clientSecret) {
        throw new Error('Payment not initialized. Please try again.');
      }

      console.log('Processing payment with client secret...');
      
      // Validate payment method data
      if (!paymentMethod.cardNumber || !paymentMethod.expiryDate || !paymentMethod.cvv) {
        throw new Error('Please fill in all payment information');
      }

      // Parse expiry date
      const [expMonth, expYear] = paymentMethod.expiryDate.split('/');
      if (!expMonth || !expYear || expMonth.length !== 2 || expYear.length !== 2) {
        throw new Error('Please enter expiry date in MM/YY format');
      }

      console.log('Processing payment with backend...');

      // Send payment details directly to backend for processing
      const paymentResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev:5000/api'}/stripe/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientSecret,
          subscriptionTier: tier,
          paymentDetails: {
            cardNumber: paymentMethod.cardNumber.replace(/\s/g, ''),
            expMonth: expMonth,
            expYear: `20${expYear}`,
            cvv: paymentMethod.cvv,
            cardholderName: paymentMethod.cardholderName || 'Customer',
          }
        })
      });

      console.log('Payment response status:', paymentResponse.status);

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        console.error('Payment failed:', errorData);
        throw new Error(errorData.error || 'Payment failed');
      }

      const paymentResult = await paymentResponse.json();
      console.log('Payment result:', paymentResult);
      
      if (paymentResult.success) {
        console.log('Payment successful, updating user subscription...');
        
        // Update user subscription tier
        const updateResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://793b69da-5f5f-4ecb-a084-0d25bd48a221-00-mli9xfubddzk.picard.replit.dev:5000/api'}/user/subscription`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            subscriptionTier: tier,
            stripeCustomerId: paymentResult.customerId,
            stripeSubscriptionId: paymentResult.subscriptionId
          })
        });

        if (!updateResponse.ok) {
          const updateError = await updateResponse.json();
          console.error('Failed to update subscription:', updateError);
          throw new Error('Failed to update subscription');
        }
        
        console.log('Subscription updated successfully, navigating to success page...');
        
        // Navigate to success screen
        router.push(`/subscription/success?tier=${tier}&newUser=${isNewUser}&customerId=${paymentResult.customerId}&subscriptionId=${paymentResult.subscriptionId}`);
      } else if (paymentResult.requires_action) {
        // Handle additional authentication if needed
        Alert.alert(
          'Payment Requires Authentication', 
          'Your payment requires additional authentication. Please complete the authentication and try again.',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(paymentResult.error || 'Payment failed');
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
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Cardholder Name</ThemedText>
            <TextInput
              style={[styles.input, errors.cardholderName && styles.inputError]}
              value={paymentMethod.cardholderName}
              onChangeText={(text) => setPaymentMethod(prev => ({ ...prev, cardholderName: text }))}
              placeholder="John Doe"
              placeholderTextColor="#9ca3af"
            />
            {errors.cardholderName && <ThemedText style={styles.errorText}>{errors.cardholderName}</ThemedText>}
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Card Number</ThemedText>
            <TextInput
              style={[styles.input, errors.cardNumber && styles.inputError]}
              value={paymentMethod.cardNumber}
              onChangeText={(text) => setPaymentMethod(prev => ({ ...prev, cardNumber: formatCardNumber(text) }))}
              placeholder="1234 5678 9012 3456"
              placeholderTextColor="#9ca3af"
              keyboardType="default"
              maxLength={19}
            />
            {errors.cardNumber && <ThemedText style={styles.errorText}>{errors.cardNumber}</ThemedText>}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <ThemedText style={styles.inputLabel}>Expiry Date</ThemedText>
              <TextInput
                style={[styles.input, errors.expiryDate && styles.inputError]}
                value={paymentMethod.expiryDate}
                onChangeText={(text) => setPaymentMethod(prev => ({ ...prev, expiryDate: formatExpiryDate(text) }))}
                placeholder="MM/YY"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                maxLength={5}
              />
              {errors.expiryDate && <ThemedText style={styles.errorText}>{errors.expiryDate}</ThemedText>}
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <ThemedText style={styles.inputLabel}>CVV</ThemedText>
              <TextInput
                style={[styles.input, errors.cvv && styles.inputError]}
                value={paymentMethod.cvv}
                onChangeText={(text) => setPaymentMethod(prev => ({ ...prev, cvv: text.replace(/[^0-9]/g, '') }))}
                placeholder="123"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
              {errors.cvv && <ThemedText style={styles.errorText}>{errors.cvv}</ThemedText>}
            </View>
          </View>

          <View style={styles.securityBadge}>
            <ThemedText style={styles.securityText}>🔒 Secure payment powered by Stripe</ThemedText>
          </View>
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
  paymentForm: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#ef4444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1f2937',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
