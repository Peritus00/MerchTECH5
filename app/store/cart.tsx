import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCart } from '@/contexts/CartContext';
import { checkoutAPI } from '@/services/api';
import * as WebBrowser from 'expo-web-browser';

export default function CartScreen() {
  const router = useRouter();
  const { cart, updateQuantity, removeFromCart, clearCart, getTotalPrice } = useCart();

  const formatPrice = (priceInCents: number) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  const getUnitPrice = (p: any): number => {
    if (p.prices && p.prices.length) return p.prices[0].unit_amount;
    if (p.metadata && (p.metadata.price || p.metadata.unit_amount)) {
      return Number(p.metadata.price || p.metadata.unit_amount);
    }
    if (p.price) return p.price;
    return 0;
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart before checkout.');
      return;
    }

    try {
      const items = cart.map((c) => ({ productId: c.product.id, quantity: c.quantity }));
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = `${base}/store/checkout-cancel`;

      const { url } = await checkoutAPI.createSession(items, successUrl, cancelUrl);

      // Always use WebBrowser to keep app running in background
      await WebBrowser.openBrowserAsync(url);
      console.log('🔗 PAYMENT: Opened Stripe checkout in external browser (Cart)');
    } catch (err: any) {
      console.error('Checkout error', err);
      Alert.alert('Error', err.message || 'Failed to start checkout');
    }
  };

  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearCart },
      ]
    );
  };

  if (cart.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/(tabs)/store')}
          >
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">Shopping Cart</ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.emptyContainer}>
          <ThemedText style={styles.emptyIcon}>🛍</ThemedText>
          <ThemedText style={styles.emptyText}>Your cart is empty</ThemedText>
          <ThemedText style={styles.emptySubtext}>Add some products to get started</ThemedText>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => router.push('/(tabs)/store')}
          >
            <ThemedText style={styles.continueButtonText}>Continue Shopping</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/store')}
        >
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Shopping Cart ({cart.length})</ThemedText>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearCart}>
          <ThemedText style={styles.clearButtonText}>✕</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {cart.map((item, index) => (
          <ThemedView key={`${item.product.id}-${item.size || 'default'}`} style={styles.cartItem}>
            <Image
              source={{ uri: item.product.imageUrl || (item.product.images && item.product.images[0]) || 'https://placehold.co/100x100' }}
              style={styles.itemImage}
            />
            
            <ThemedView style={styles.itemDetails}>
              <ThemedText style={styles.itemName} numberOfLines={2}>
                {item.product.name}
              </ThemedText>
              
              {item.size && (
                <ThemedText style={styles.itemSize}>Size: {item.size}</ThemedText>
              )}
              
              <ThemedText style={styles.itemPrice}>
                {formatPrice(getUnitPrice(item.product))}
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.itemControls}>
              <ThemedView style={styles.quantityControls}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.product.id, item.quantity - 1, item.size)}
                >
                  <ThemedText style={styles.quantityButtonText}>-</ThemedText>
                </TouchableOpacity>
                
                <ThemedText style={styles.quantityText}>{item.quantity}</ThemedText>
                
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateQuantity(item.product.id, item.quantity + 1, item.size)}
                >
                  <ThemedText style={styles.quantityButtonText}>+</ThemedText>
                </TouchableOpacity>
              </ThemedView>

              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFromCart(item.product.id, item.size)}
              >
                <ThemedText style={styles.removeButtonText}>✕</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        ))}
      </ScrollView>

      {/* Total and Checkout */}
      <ThemedView style={styles.footer}>
        <ThemedView style={styles.totalContainer}>
          <ThemedText style={styles.totalLabel}>Total:</ThemedText>
          <ThemedText style={styles.totalAmount}>{formatPrice(getTotalPrice())}</ThemedText>
        </ThemedView>
        
        <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
          <ThemedText style={styles.checkoutButtonText}>Proceed to Checkout →</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  clearButton: {
    padding: 8,
  },
  clearButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSize: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  itemControls: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 8,
  },
  quantityButton: {
    padding: 8,
    minWidth: 32,
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 12,
  },
  removeButton: {
    padding: 4,
  },
  removeButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 32,
  },
  continueButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  checkoutButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
