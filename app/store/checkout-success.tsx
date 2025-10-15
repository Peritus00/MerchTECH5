import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { analyticsService } from '@/services/analyticsService';
import { useAuth } from '@/contexts/AuthContext';

export default function CheckoutSuccess() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams();
  const { cart, clearCart, getTotalPrice } = useCart();
  const { user } = useAuth();
  const [purchaseTracked, setPurchaseTracked] = React.useState(false);

  React.useEffect(() => {
    // Track purchase before clearing cart
    const trackPurchase = async () => {
      if (purchaseTracked || !session_id || cart.length === 0) {
        return;
      }

      try {
        const stripeSessionId = Array.isArray(session_id) ? session_id[0] : session_id;
        const totalAmount = getTotalPrice();
        
        // Format cart items for tracking
        const items = cart.map(item => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        }));

        console.log('📊 ANALYTICS: Tracking purchase from checkout-success');
        await analyticsService.trackPurchase(
          stripeSessionId,
          items,
          totalAmount,
          user?.id
        );
        
        setPurchaseTracked(true);
        console.log('📊 ANALYTICS: Purchase tracked successfully');
      } catch (error) {
        console.error('Error tracking purchase:', error);
      }
    };

    trackPurchase().then(() => {
      // Clear cart after tracking
      clearCart();
    });
  }, [session_id, cart, purchaseTracked]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Thank you for your purchase!</ThemedText>
      <ThemedText style={styles.subtitle}>Your payment was successful.</ThemedText>
      <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)/store')}>
        <ThemedText style={styles.homeText}>Continue Shopping</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,justifyContent:'center',alignItems:'center',padding:24},
  title:{marginBottom:12,textAlign:'center'},
  subtitle:{textAlign:'center',opacity:0.8,marginBottom:32},
  homeBtn:{backgroundColor:'#2563eb',paddingHorizontal:24,paddingVertical:12,borderRadius:8},
  homeText:{color:'#fff',fontSize:16,fontWeight:'600'},
}); 