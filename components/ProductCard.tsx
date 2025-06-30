import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
  Platform,
  Alert,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { Product } from '@/shared/product-schema';
import { useCart } from '@/contexts/CartContext';
import { checkoutAPI } from '@/services/api';
import * as WebBrowser from 'expo-web-browser';
import ShareButton from './ShareButton';

const { width } = Dimensions.get('window');
const cardWidth = (width - 60) / 2; // Account for padding and gap

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  showShareButton?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onPress, showShareButton = false }) => {
  const { addToCart } = useCart();

  const getProductUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/product/${product.id}`;
  };

  const handleAddToCart = (e: any) => {
    e.stopPropagation();
    addToCart(product);
  };

  const handleBuyNow = async (e: any) => {
    e.stopPropagation();
    try {
      console.log('BuyNow pressed for', product.id);
      const items = [{ productId: product.id, quantity: 1 }];
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = base;
      const { url } = await checkoutAPI.createSession(items, successUrl, cancelUrl);

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err: any) {
      console.error('BuyNow error', err);
      Alert.alert('Error', err.message || 'Failed to start checkout');
    }
  };

  // Get the first image or use a default
  const imageUrl = product.images && product.images.length > 0
    ? product.images[0]
    : 'https://placehold.co/400x400?text=No+Image';

  // Get the lowest price for display
  const lowestPrice = product.prices && product.prices.length > 0
    ? Math.min(...product.prices.map(p => p.unit_amount))
    : 0;

  // Rating: expect average rating stored in metadata.ratingAvg (0-5)
  const avgRating = product.metadata && product.metadata.ratingAvg ? parseFloat(product.metadata.ratingAvg as any) : 0;

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Text key={i} style={[styles.star, i <= rating ? styles.starFilled : styles.starEmpty]}>★</Text>
      );
    }
    return <View style={styles.ratingRow}>{stars}</View>;
  };

  const hasMultiplePrices = product.prices && product.prices.length > 1;

  const formatPrice = (priceInCents: number) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={styles.imageContainer}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
        <ThemedView style={styles.priceTag}>
          <ThemedText style={styles.priceText}>{formatPrice(lowestPrice)}</ThemedText>
        </ThemedView>
        {showShareButton && (
          <View style={styles.shareButtonContainer}>
            <ShareButton
              url={getProductUrl()}
              title={product.name}
              description={product.description}
              type="product"
              compact={true}
            />
          </View>
        )}
        {!product.in_stock && (
          <ThemedView style={styles.outOfStockOverlay}>
            <ThemedText style={styles.outOfStockText}>Out of Stock</ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedText style={styles.productName} numberOfLines={2}>
          {product.name}
        </ThemedText>

        <ThemedText style={styles.description} numberOfLines={2}>
          {product.description || 'No description available'}
        </ThemedText>

        {product.metadata?.category && (
          <ThemedView style={styles.categoryContainer}>
            <ThemedText style={styles.categoryText}>{product.metadata.category}</ThemedText>
          </ThemedView>
        )}

        {/* Rating display */}
        {renderStars(Math.round(avgRating))}

        <ThemedView style={styles.footer}>
          <ThemedView style={styles.stockStatus}>
            <ThemedView
              style={[
                styles.stockIndicator,
                { backgroundColor: product.in_stock ? '#22c55e' : '#ef4444' },
              ]}
            />
            <ThemedText style={styles.stockText}>
              {product.in_stock ? 'In Stock' : 'Out of Stock'}
            </ThemedText>
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.addButton,
              !product.in_stock && styles.addButtonDisabled,
            ]}
            onPress={handleAddToCart}
            disabled={!product.in_stock}
          >
            <ThemedText style={styles.addButtonText}>+</ThemedText>
          </TouchableOpacity>

          {product.in_stock && (
            <TouchableOpacity style={styles.buyNowButton} onPress={handleBuyNow}>
              <ThemedText style={styles.buyNowText}>Buy Now</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
        {product.prices && product.prices.length > 0 && (
          <Text style={styles.priceCount}>
            {product.prices.length} price option{product.prices.length > 1 ? 's' : ''}
          </Text>
        )}
      </ThemedView>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  priceTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  shareButtonContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    padding: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
    lineHeight: 18,
  },
  categoryContainer: {
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  stockText: {
    fontSize: 12,
    opacity: 0.7,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  addButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  category: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceCount: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  buyNowButton: {
    marginLeft: 8,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  buyNowText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  star: {
    fontSize: 16,
  },
  starFilled: {
    color: '#facc15',
  },
  starEmpty: {
    color: '#555',
  },
  ratingRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
});

export default ProductCard;