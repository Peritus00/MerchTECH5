import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { Product } from '@/shared/product-schema';
import { useCart } from '@/contexts/CartContext';

const { width } = Dimensions.get('window');
const cardWidth = (width - 60) / 2; // Account for padding and gap

interface ProductCardProps {
  product: Product;
  onPress: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onPress }) => {
  const { addToCart } = useCart();

  const handleAddToCart = (e: any) => {
    e.stopPropagation();
    addToCart(product);
  };

  // Get the first image or use a default
  const imageUrl = product.images && product.images.length > 0
    ? product.images[0]
    : 'https://via.placeholder.com/400x400?text=No+Image';

  // Get the lowest price for display
  const lowestPrice = product.prices.length > 0
    ? Math.min(...product.prices.map(p => p.unit_amount))
    : 0;

  const hasMultiplePrices = product.prices.length > 1;

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
        {!product.inStock && (
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

        <ThemedView style={styles.footer}>
          <ThemedView style={styles.stockStatus}>
            <ThemedView
              style={[
                styles.stockIndicator,
                { backgroundColor: product.inStock ? '#22c55e' : '#ef4444' },
              ]}
            />
            <ThemedText style={styles.stockText}>
              {product.inStock ? 'In Stock' : 'Out of Stock'}
            </ThemedText>
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.addButton,
              !product.inStock && styles.addButtonDisabled,
            ]}
            onPress={handleAddToCart}
            disabled={!product.inStock}
          >
            <ThemedText style={styles.addButtonText}>
              {product.inStock ? '🛒' : '❌'}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
        {product.prices.length > 0 && (
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
});

export default ProductCard;