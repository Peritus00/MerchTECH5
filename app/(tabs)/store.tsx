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
import { productsAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import ShareButton from '@/components/ShareButton';


const { width } = Dimensions.get('window');

export default function StoreScreen() {
  const router = useRouter();
  const { getTotalItems } = useCart();
  const { user } = useAuth();
  const isAdmin = user && user.isAdmin;
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [error, setError] = useState<string | null>(null);

  // Updated categories to align with the new taxonomy
  const categories = ['All', 'MUSIC', 'Sculpture', 'Painting', 'Literature', 'Architecture', 'Performing', 'Film'];

  useEffect(() => {
    fetchProducts();
  }, []);

  // Re-fetch products when user context changes (fixes race condition)
  useEffect(() => {
    if (user !== null) {
      console.log('🏪 Store: User context loaded, re-fetching products for:', user.username);
      fetchProducts();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    try {
      console.log('🏪 Store: Fetching products for user:', user?.username, 'isAdmin:', isAdmin, 'user.id:', user?.id);
      const items = await productsAPI.getAllProducts();
      console.log('🏪 Store: Fetched', items.length, 'total products');
      
      const normalize = (p: any): Product => ({
        ...p,
        in_stock: p.in_stock ?? p.inStock ?? true,
      });

      let list: Product[] = items.map(normalize);
      console.log('🏪 Store: After normalization:', list.length, 'products');

      // Hide out-of-stock or suspended products from customers
      list = list.filter((p) => p.in_stock && !p.isSuspended);
      console.log('🏪 Store: After stock filter:', list.length, 'products');

      // If you only want to show your own items when logged-in seller
      if (!isAdmin && user) {
        console.log('🏪 Store: Filtering for user products. User ID:', user.id);
        const beforeFilter = list.length;
        list = list.filter((p) => {
          const matches = String(p.user_id) === String(user.id);
          console.log('🏪 Store: Product', p.name, 'user_id:', p.user_id, 'matches user', user.id, ':', matches);
          return matches;
        });
        console.log('🏪 Store: After user filter:', list.length, 'products (was', beforeFilter, ')');
      } else {
        console.log('🏪 Store: Showing all products (admin or no user)');
      }

      setProducts(list);
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

    // Sort by popularity (descending). Use metadata.popularity if available, else 0.
    filtered = filtered.sort((a, b) => {
      const popA = Number(a.metadata?.popularity ?? 0);
      const popB = Number(b.metadata?.popularity ?? 0);
      return popB - popA;
    });

    setFilteredProducts(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const handleProductPress = (product: Product) => {
    router.push({
      pathname: `/store/product/${product.id}`,
      params: { product: JSON.stringify(product) },
    });
  };

  const handleCartPress = () => {
    router.push('/store/cart');
  };

  const getStoreUrl = () => {
    const baseUrl = 'https://merchtech.net';
    if (isAdmin) {
      // Admin can share master store
      return `${baseUrl}/store/master`;
    } else if (user) {
      // Regular user shares their own store
      return `${baseUrl}/store/user/${user.id}`;
    }
    // Fallback to master store
    return `${baseUrl}/store/master`;
  };

  const getStoreTitle = () => {
    if (isAdmin) {
      return 'MerchTech Master Store';
    } else if (user) {
      return `${user.firstName || user.username || 'My'}'s Store`;
    }
    return 'MerchTech Store';
  };

  const getStoreDescription = () => {
    if (isAdmin) {
      return 'Browse amazing products from all our creators';
    } else if (user) {
      return 'Check out my amazing products';
    }
    return 'Browse our amazing products and services';
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
          <ThemedText type="title" style={styles.headerTitle}>
            {user ? `${user.firstName || user.username || 'My'} Store` : 'Store'}
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {user ? `Support ${user.firstName || user.username || 'this creator'} by buying a product today :)` : 'Browse our products and services'}
          </ThemedText>
        </ThemedView>

        {/* Central Share Button */}
        <View style={styles.headerCenter}>
          <ShareButton
            url={getStoreUrl()}
            title={getStoreTitle()}
            description={getStoreDescription()}
            type="store"
            compact={false}
          />
        </View>

        <ThemedView style={styles.headerRight}>
          <TouchableOpacity style={styles.publicShopButton} onPress={() => router.push('/shop')}>
            <ThemedText style={styles.publicShopButtonText}>MERCHTECH OFFICIAL STORE ↗️</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
            <ThemedText style={styles.cartIcon}>🛍</ThemedText>
            {getTotalItems() > 0 && (
              <ThemedView style={styles.cartBadge}>
                <ThemedText style={styles.cartBadgeText}>{getTotalItems()}</ThemedText>
              </ThemedView>
            )}
          </TouchableOpacity>
        </ThemedView>
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
                showShareButton={true}
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
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
  publicShopButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  publicShopButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  cartButton: {
    position: 'relative',
    padding: 8,
  },
  cartIcon: {
    fontSize: 24,
    color: '#ffffff',
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
  publicShopButton: {
    padding: 8,
  },
});