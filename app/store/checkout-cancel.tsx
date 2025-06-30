import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';

export default function CheckoutCancelScreen() {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={{ marginBottom: 12 }}>Checkout Cancelled</ThemedText>
      <ThemedText style={{ marginBottom: 24, opacity: 0.8 }}>
        Your payment was not completed. You can return to your cart to modify items or try again.
      </ThemedText>

      <TouchableOpacity style={styles.button} onPress={() => router.replace('/store/cart')}>
        <ThemedText style={{ color: '#fff' }}>Back to Cart</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  button: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
}); 