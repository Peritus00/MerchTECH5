import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, Clipboard } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import ProductCard from '@/components/ProductCard';
import CategoryFilter from '@/components/CategoryFilter';
import { productsAPI } from '@/services/api';
import ShareButton from '@/components/ShareButton';

export default function MasterStoreScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const router = useRouter();

  const categories = ['Music', 'Painting', 'Sculpture', 'Literature', 'Architecture', 'Performing', 'Film'];

  // Generate shareable store URL
  const getMasterStoreUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/master`;
  };

  const copyStoreUrl = async () => {
    const url = getMasterStoreUrl();
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(url);
      } else {
        Clipboard.setString(url);
      }
      Alert.alert('Success', 'Master store URL copied to clipboard!');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy URL');
    }
  };

  useEffect(() => {
    fetchAllProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchAllProducts = async () => {
    try {
      const allProducts = await productsAPI.getAllProducts();
      // Only show in-stock products in the public store
      const inStockProducts = allProducts.filter((product: Product) => product.in_stock);
      setProducts(inStockProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      Alert.alert('Error', 'Unable to load store products.');
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  };

  const handleProductPress = (product: Product) => {
    router.push({
      pathname: '/store/product/[id]',
      params: { id: product.id, product: JSON.stringify(product) }
    });
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.productWrapper}>
      <ProductCard 
        product={item} 
        onPress={() => handleProductPress(item)}
        showShareButton={true}
      />
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loading master store...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={{ color: '#2563eb' }}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.storeTitle}>
          🏪 Master Store
        </ThemedText>
        <ThemedText style={styles.storeSubtitle}>
          All products from all creators
        </ThemedText>
        <ThemedText style={styles.productCount}>
          {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} available
        </ThemedText>
      </View>

      {/* Shareable Store Link Section */}
      <View style={styles.shareSection}>
        <View style={styles.shareHeader}>
          <ThemedText type="subtitle" style={styles.shareTitle}>
            🔗 Share Master Store
          </ThemedText>
          <ShareButton
            url={getMasterStoreUrl()}
            title="Master Store"
            description="Browse all available products from our creators"
            type="store"
            compact={true}
          />
        </View>
        <View style={styles.urlContainer}>
          <ThemedText style={styles.urlText} numberOfLines={1}>
            {getMasterStoreUrl()}
          </ThemedText>
          <TouchableOpacity style={styles.copyButton} onPress={copyStoreUrl}>
            <ThemedText style={styles.copyButtonText}>Copy Link</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.shareHint}>
          Share this link or create a QR code in the QR Creator to showcase all available products
        </ThemedText>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {filteredProducts.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={{ fontSize: 64 }}>
            {searchQuery || selectedCategory ? '🔍' : '🏪'}
          </ThemedText>
          <ThemedText style={{ marginTop: 12, fontSize: 18 }}>
            {searchQuery || selectedCategory ? 'No Results Found' : 'Store is Empty'}
          </ThemedText>
          <ThemedText style={{ opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
            {searchQuery || selectedCategory 
              ? 'Try adjusting your search or filters.'
              : 'No products have been added yet.'
            }
          </ThemedText>
          {(searchQuery || selectedCategory) && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
            >
              <ThemedText style={{ color: '#2563eb' }}>Clear Filters</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          numColumns={2}
          contentContainerStyle={styles.productGrid}
          columnWrapperStyle={styles.row}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  storeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  storeSubtitle: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 4,
  },
  productCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  shareSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  shareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shareTitle: {
    fontWeight: '600',
    flex: 1,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 8,
  },
  urlText: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  copyButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  shareHint: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 16,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#000000',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  clearButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  productGrid: {
    padding: 16,
  },
  row: {
    justifyContent: 'space-between',
  },
  productWrapper: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 16,
  },
}); 