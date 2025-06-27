import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

export default function SubscriptionCheckoutScreen() {
  const { tier } = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const tierInfo = SUBSCRIPTION_TIERS[tier as string];

  useEffect(() => {
    if (!tier || !tierInfo) {
      router.push('/subscription');
    }
  }, [tier, tierInfo, router]);

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      const requestBody = {
        subscriptionTier: tier,
        amount: tierInfo.price,
        successUrl: Platform.OS === 'web' 
          ? `${window.location.origin}/subscription/success?tier=${tier}`
          : `yourappscheme://subscription/success?tier=${tier}`,
        cancelUrl: Platform.OS === 'web'
          ? `${window.location.origin}/subscription/checkout?tier=${tier}`
          : `yourappscheme://subscription/checkout?tier=${tier}`,
      };

      const response = await fetch(`${API_BASE_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // **THE FIX**: Check for the 'url' property directly from the response.
      if (result.url) {
        if (Platform.OS === 'web') {
          window.location.href = result.url; // Redirect to Stripe for web
        } else {
          // For mobile, you would use Expo's WebBrowser
          const { WebBrowser } = require('expo-web-browser');
          await WebBrowser.openBrowserAsync(result.url);
        }
      } else {
        throw new Error(result.error || 'Failed to get checkout session URL');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      Alert.alert('Payment Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Return the JSX for your component here...
  // For brevity, the JSX is omitted, but it should be the same as your original file.
  // The important part is the corrected handlePayment function above.
  if (!tierInfo) {
    return <ThemedView style={styles.container}><ThemedText>Loading...</ThemedText></ThemedView>;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
         <ThemedView style={styles.planHeader}>
           <ThemedText type="title">{tierInfo.name} Plan</ThemedText>
           <ThemedText style={styles.price}>${tierInfo.price}/month</ThemedText>
         </ThemedView>
         <TouchableOpacity style={styles.payButton} onPress={handlePayment} disabled={isLoading}>
           {isLoading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.payButtonText}>Subscribe</ThemedText>}
         </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24 },
  planHeader: { alignItems: 'center', marginBottom: 32 },
  price: { fontSize: 28, fontWeight: 'bold' },
  payButton: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center' },
  payButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
