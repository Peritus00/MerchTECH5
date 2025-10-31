import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { paymentAPI } from '@/services/api';
import * as WebBrowser from 'expo-web-browser';
import { env } from '@/config/environment';
import ShareButton from '@/components/ShareButton'; // Assuming you have this
import { Product } from '@/shared/product-schema';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { MaterialIcons } from '@expo/vector-icons';
import { MobileCompatibleImage } from './MobileCompatibleImage';

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  showShareButton?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onPress, showShareButton = false }) => {
  const { addToCart } = useCart();
  const router = useRouter();
  const [base, setBase] = useState('');

  useEffect(() => {
    // This code runs only on the client, after the initial render.
    // This safely avoids the hydration mismatch.
    if (Platform.OS === 'web') {
      setBase(window.location.origin);
    } else {
      setBase(env.frontendUrl.replace(/\/$/, ''));
    }
  }, []);

  // Helper function to get price from product
  const getProductPrice = (product: Product): number => {
    // First try the deprecated price field
    if (product.price !== undefined && product.price !== null) {
      // Price is stored in cents, convert to dollars
      return product.price / 100;
    }
    
    // Then try the new prices array
    if (product.prices && product.prices.length > 0) {
      // Get the first price and convert from cents to dollars
      return product.prices[0].unit_amount / 100;
    }
    
    // Default to 0 if no price found
    return 0;
  };

  const getProductUrl = () => {
    if (Platform.OS === 'web') {
      // Ensure base is set before constructing the URL
      return base ? `${base}/store/product/${product.id}` : '';
    }
    // For native, use the relative path
    return `/store/product/${product.id}`;
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    const productUrl = getProductUrl();
    if (productUrl) {
      if (Platform.OS === 'web') {
        window.location.href = productUrl;
      } else {
        router.push(productUrl as `http${string}`);
      }
    }
  };

  const shareProduct = async () => {
    const productUrl = getProductUrl();
    if (!productUrl) return;

    try {
      await Share.share({
        title: product.name,
        message: `${product.name} - Check it out on MerchTech! ${productUrl}`,
        url: productUrl,
      });
    } catch (error) {
      Alert.alert('Error', 'Could not share product.');
    }
  };

  const buyNow = async () => {
    if (!product) return;

    const absBase = base || (Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.origin : '') : env.frontendUrl.replace(/\/$/, ''));
    if (!absBase) {
      Alert.alert('Error', 'Could not determine checkout URL. Please refresh and try again.');
      return;
    }

    try {
      const items = [{ productId: product.id, quantity: 1 }];
      const successUrl = `${absBase}/store/checkout-success`;
      const cancelUrl = `${absBase}/store/product/${product.id}`;
      
      console.log('🔗 PRODUCT_CARD: Creating session with items:', items);
      // Pre-open a blank window on web to avoid Safari popup blocking
      let preOpened: Window | null = null;
      if (Platform.OS === 'web') {
        preOpened = window.open('', '_blank');
      }

      const response = await paymentAPI.createSession(items, successUrl, cancelUrl);
      console.log('🔗 PRODUCT_CARD: API response:', response);

      const checkoutUrl = response.url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL received from server');
      }

      console.log('🔗 PRODUCT_CARD: Opening URL:', checkoutUrl);

      if (Platform.OS === 'web') {
        // Prefer same-tab redirect on iOS Safari to avoid popup blocking
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        if (isIOS && isSafari) {
          window.location.assign(checkoutUrl);
        } else {
          if (preOpened) {
            preOpened.location.href = checkoutUrl;
          } else {
            const newWindow = window.open(checkoutUrl, '_blank');
            if (!newWindow) {
              console.warn('🔗 PRODUCT_CARD: Popup blocked, redirecting in same window');
              window.location.href = checkoutUrl;
            }
          }
        }
      } else {
        // For mobile, use WebBrowser
        await WebBrowser.openBrowserAsync(checkoutUrl);
        console.log('🔗 PRODUCT_CARD: Opened Stripe checkout in WebBrowser');
      }
    } catch (error: any) {
      console.error('🔴 PRODUCT_CARD BUY_NOW ERROR:', error);
      console.error('🔴 PRODUCT_CARD BUY_NOW ERROR Details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.card}>
      <TouchableOpacity onPress={handlePress}>
        <MobileCompatibleImage 
          uri={product.images?.[0] || ''}
          style={styles.image}
          fallbackUri="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='Arial, Helvetica, sans-serif' font-size='18'>No Image</text></svg>"
          errorText="Product image unavailable"
        />
        <View style={styles.infoContainer}>
          <ThemedText style={styles.name} numberOfLines={2}>
            {product.name}
          </ThemedText>
          <ThemedText style={styles.price}>${getProductPrice(product).toFixed(2)}</ThemedText>
        </View>
      </TouchableOpacity>
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => addToCart(product, '1')}>
           <MaterialIcons name="add-shopping-cart" size={20} color="#3b82f6" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.buyNowButton]} onPress={buyNow}>
           <MaterialIcons name="flash-on" size={20} color="#ffffff" />
        </TouchableOpacity>
        {showShareButton && (
          <TouchableOpacity style={styles.actionButton} onPress={shareProduct}>
            <MaterialIcons name="share" size={20} color="#3b82f6" />
          </TouchableOpacity>
        )}
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    margin: 8,
    width: 160,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: '#f3f4f6', // Light gray background while loading
  },
  infoContainer: {
    padding: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 34, // for 2 lines
    color: '#000000', // Solid black color
    opacity: 1, // Ensure fully opaque, not transparent
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  actionButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  buyNowButton: {
    backgroundColor: '#3b82f6',
  },
});

export default ProductCard;