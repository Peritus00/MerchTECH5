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
  const { session_id, type } = useLocalSearchParams<{ session_id?: string; type?: string }>();
  const { cart, clearCart, getTotalPrice } = useCart();
  const { user } = useAuth();
  const [purchaseTracked, setPurchaseTracked] = React.useState(false);

  const isActivationCodePurchase = type === 'activation_code';

  React.useEffect(() => {
    // Track purchase before clearing cart (skip for activation code - no cart)
    const trackPurchase = async () => {
      if (isActivationCodePurchase) {
        return;
      }
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
      if (!isActivationCodePurchase) {
        clearCart();
      }
    });
  }, [session_id, cart, purchaseTracked, isActivationCodePurchase]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {isActivationCodePurchase ? 'Payment successful!' : 'Thank you for your purchase!'}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {isActivationCodePurchase
          ? 'Your activation code has been sent via text. Check your phone and enter the code to access your content.'
          : 'Your payment was successful.'}
      </ThemedText>
      <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)/store')}>
        <ThemedText style={styles.homeText}>
          {isActivationCodePurchase ? 'Back to Store' : 'Continue Shopping'}
        </ThemedText>
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