import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { checkoutAPI } from '@/services/api';
import * as WebBrowser from 'expo-web-browser';
import ShareButton from '@/components/ShareButton'; // Assuming you have this
import { Product } from '@/shared/product-schema';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { MaterialIcons } from '@expo/vector-icons';

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
    }
  }, []);

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

    if (Platform.OS === 'web' && !base) {
      Alert.alert('Error', 'Could not determine checkout URL. Please refresh and try again.');
      return;
    }

    try {
      const items = [{ productId: product.id, quantity: 1 }];
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = `${base}/store/product/${product.id}`;
      const { url } = await checkoutAPI.createSession(items, successUrl, cancelUrl);
      if (url) {
        if (Platform.OS === 'web') {
          window.location.href = url;
        } else {
          await WebBrowser.openBrowserAsync(url);
        }
      }
    } catch (error) {
      console.error('Checkout session creation failed:', error);
      Alert.alert('Error', 'Could not initiate checkout.');
    }
  };

  return (
    <ThemedView style={styles.card}>
      <TouchableOpacity onPress={handlePress}>
        <Image source={{ uri: product.images?.[0] || 'https://placehold.co/300x300' }} style={styles.image} />
        <View style={styles.infoContainer}>
          <ThemedText style={styles.name} numberOfLines={2}>
            {product.name}
          </ThemedText>
          <ThemedText style={styles.price}>${product.price.toFixed(2)}</ThemedText>
        </View>
      </TouchableOpacity>
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => addToCart(product, 1)}>
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
  },
  infoContainer: {
    padding: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 34, // for 2 lines
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