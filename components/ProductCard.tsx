import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
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

  const formatPrice = (priceInCents: number) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={styles.imageContainer}>
        <Image source={{ uri: product.imageUrl }} style={styles.image} />
        <ThemedView style={styles.priceTag}>
          <ThemedText style={styles.priceText}>{formatPrice(product.price)}</ThemedText>
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
          {product.description}
        </ThemedText>

        {product.category && (
          <ThemedView style={styles.categoryContainer}>
            <ThemedText style={styles.categoryText}>{product.category}</ThemedText>
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
});

export default ProductCard;