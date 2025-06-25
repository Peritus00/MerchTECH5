import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCart } from '@/contexts/CartContext';
import { Product } from '@/shared/product-schema';
import ProductCard from '@/components/ProductCard';
import SearchBar from '@/components/SearchBar';
import CategoryFilter from '@/components/CategoryFilter';
import { stripeAPI } from '@/services/api';

const { width } = Dimensions.get('window');

export default function StoreScreen() {
  const router = useRouter();
  const { getTotalItems } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [error, setError] = useState<string | null>(null);

  const categories = ['All', 'Apparel', 'Music', 'Merchandise', 'Electronics', 'Other'];

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    try {
      // Mock data for development
      const mockProducts: Product[] = [
        {
          id: '1',
          name: 'Test Product',
          description: 'A test product for store functionality',
          images: ['https://picsum.photos/400/400?random=1'],
          category: 'Electronics',
          inStock: true,
          slug: 'test-product',
          hasSizes: false,
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'dijetfuel' },
          prices: [
            {
              id: 'price_1',
              unit_amount: 2999,
              currency: 'usd',
              type: 'one_time'
            }
          ]
        },
        {
          id: '2',
          name: 'Premium Headphones',
          description: 'High-quality wireless headphones with noise cancellation',
          images: ['https://picsum.photos/400/400?random=2'],
          category: 'Electronics',
          inStock: true,
          slug: 'premium-headphones',
          hasSizes: false,
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'dijetfuel' },
          prices: [
            {
              id: 'price_2',
              unit_amount: 19999,
              currency: 'usd',
              type: 'one_time'
            }
          ]
        },
        {
          id: '3',
          name: 'Brand T-Shirt',
          description: 'Comfortable cotton t-shirt with logo',
          images: ['https://picsum.photos/400/400?random=3'],
          category: 'Apparel',
          inStock: true,
          slug: 'brand-t-shirt',
          hasSizes: true,
          availableSizes: ['S', 'M', 'L', 'XL'],
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'dijetfuel' },
          prices: [
            {
              id: 'price_3',
              unit_amount: 2499,
              currency: 'usd',
              type: 'one_time'
            }
          ]
        }
      ];
      setProducts(mockProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const handleProductPress = (product: Product) => {
    router.push(`/store/product/${product.id}`);
  };

  const handleCartPress = () => {
    router.push('/store/cart');
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading products...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <ThemedView style={styles.headerLeft}>
          <ThemedText type="title" style={styles.headerTitle}>Store</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Browse our products and services</ThemedText>
        </ThemedView>

        <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
          <ThemedText style={styles.cartIcon}>🛒</ThemedText>
          {getTotalItems() > 0 && (
            <ThemedView style={styles.cartBadge}>
              <ThemedText style={styles.cartBadgeText}>{getTotalItems()}</ThemedText>
            </ThemedView>
          )}
        </TouchableOpacity>
      </ThemedView>

      {/* Search and Filters */}
      <ThemedView style={styles.filtersContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search products, categories, or vendors..."
        />
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </ThemedView>

      {/* Products Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredProducts.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <ThemedText style={styles.emptyIcon}>📦</ThemedText>
            <ThemedText style={styles.emptyText}>No products found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {searchQuery || selectedCategory !== 'All'
                ? 'Try adjusting your search or filters'
                : 'Check back later for new products'}
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.productsGrid}>
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onPress={() => handleProductPress(product)}
              />
            ))}
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
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
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  cartButton: {
    position: 'relative',
    padding: 8,
  },
  cartIcon: {
    fontSize: 24,
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
});