import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import ProductCard from '@/components/ProductCard';

export default function MasterStoreManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // TODO: Replace with real API call once backend endpoint is available
      // const { data } = await api.get('/admin/products');
      // setProducts(data.products);

      // Mock data for development
      const mockProducts: Product[] = [
        {
          id: '1',
          name: 'Premium Hoodie',
          description: 'High-quality hoodie for all seasons',
          images: ['https://picsum.photos/400?random=11'],
          category: 'Apparel',
          inStock: true,
          slug: 'premium-hoodie',
          hasSizes: true,
          availableSizes: ['S', 'M', 'L', 'XL'],
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'alice' },
          prices: [
            {
              id: 'price_11',
              unit_amount: 4999,
              currency: 'usd',
              type: 'one_time',
            },
          ],
        },
        {
          id: '2',
          name: 'Collector Poster',
          description: 'Limited edition poster',
          images: ['https://picsum.photos/400?random=12'],
          category: 'Merchandise',
          inStock: true,
          slug: 'collector-poster',
          hasSizes: false,
          isSuspended: true,
          createdAt: new Date().toISOString(),
          creator: { username: 'bob' },
          prices: [
            {
              id: 'price_12',
              unit_amount: 1499,
              currency: 'usd',
              type: 'one_time',
            },
          ],
        },
      ];

      setProducts(mockProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      Alert.alert('Error', 'Unable to load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleSuspension = async (product: Product) => {
    const newStatus = !product.isSuspended;
    try {
      // TODO: Replace with real API call once backend endpoint is available
      // await api.patch(`/admin/products/${product.id}/suspend`, { isSuspended: newStatus });

      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, isSuspended: newStatus } : p,
        ),
      );
      Alert.alert(
        'Success',
        `Product ${newStatus ? 'suspended' : 're-enabled'} successfully.`,
      );
    } catch (error) {
      console.error('Failed to update product status:', error);
      Alert.alert('Error', 'Unable to update product status.');
    }
  };

  const renderItem = ({ item }: { item: Product }) => (
    <View style={styles.cardWrapper}>
      <ProductCard product={item} onPress={() => {}} />
      <TouchableOpacity
        style={[
          styles.suspendButton,
          { backgroundColor: item.isSuspended ? '#22c55e' : '#ef4444' },
        ]}
        onPress={() => toggleSuspension(item)}
      >
        <ThemedText style={styles.suspendText}>
          {item.isSuspended ? 'Enable' : 'Suspend'}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />
        }
      />
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
  cardWrapper: {
    marginBottom: 24,
  },
  suspendButton: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  suspendText: {
    fontWeight: '600',
    color: '#ffffff',
  },
}); 