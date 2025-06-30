import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import CategoryFilter from '@/components/CategoryFilter';
import ProductCard from '@/components/ProductCard';
import SearchBar from '@/components/SearchBar';
import ShareButton from '@/components/ShareButton';
import { Product } from '@/shared/product-schema';
import { useRouter } from 'expo-router';
import { productsAPI } from '@/services/api';
import { useCart } from '@/contexts/CartContext';

export default function ShopScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const router = useRouter();
  const { getTotalItems } = useCart();

  const categories = ['All', 'PaintingMusic', 'Sculpture', 'Painting', 'Literature', 'Architecture', 'Performing', 'Film'];

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    try {
      console.log('🛍 Shop: Fetching all products...');
      const items = await productsAPI.getAllProducts();
      console.log('🛍 Shop: Fetched', items.length, 'products');
      
      const normalize = (p: any): Product => ({
        ...p,
        in_stock: p.in_stock ?? p.inStock ?? true,
      });

      let list: Product[] = items.map(normalize);

      // Show all products from all users (this is the master store)
      // Only hide out-of-stock or suspended products
      list = list.filter((p) => p.in_stock && !p.isSuspended);

      console.log('🛍 Shop: After filtering,', list.length, 'products available');
      setProducts(list);
    } catch (error) {
      console.error('🛍 Shop: Error fetching products:', error);
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
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    
    // Sort by popularity descending
    filtered = filtered.sort((a,b) => {
      const popA = Number(a.metadata?.popularity ?? 0);
      const popB = Number(b.metadata?.popularity ?? 0);
      return popB - popA;
    });
    
    console.log('🛍 Shop: After filtering/sorting,', filtered.length, 'products shown');
    setFilteredProducts(filtered);
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

  const getMasterStoreUrl = () => {
    return 'https://merchtech.net/store/master';
  };

  const getMasterStoreTitle = () => {
    return 'MerchTech Official Store';
  };

  const getMasterStoreDescription = () => {
    return 'Browse amazing products from all our creators';
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading products...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedView style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>
          
          <ThemedView style={styles.headerTopRight}>
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
        
        <ThemedText type="title" style={styles.title}>MERCHTECH OFFICIAL STORE</ThemedText>
        <ThemedText style={styles.subtitle}>Discover the most popular items from every creator.</ThemedText>
        
        {/* Share Button */}
        <View style={styles.shareContainer}>
          <ShareButton
            url={getMasterStoreUrl()}
            title={getMasterStoreTitle()}
            description={getMasterStoreDescription()}
            type="store"
            compact={false}
          />
        </View>
      </ThemedView>

      <ThemedView style={styles.filtersContainer}>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search products..." />
        <CategoryFilter categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
      </ThemedView>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchProducts}/>}>
        {filteredProducts.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <ThemedText style={styles.emptyIcon}>🏪</ThemedText>
            <ThemedText style={styles.emptyText}>No products found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {searchQuery || selectedCategory !== 'All'
                ? 'Try adjusting your search or filters'
                : 'Products will appear here when sellers add them'}
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.productsGrid}>
            {filteredProducts.map(product => (
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
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  header: { 
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
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
  title: {
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
  },
  shareContainer: {
    alignItems: 'center',
  },
  filtersContainer: { paddingHorizontal: 16, paddingVertical: 16 },
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
    padding: 16 
  }
}); 