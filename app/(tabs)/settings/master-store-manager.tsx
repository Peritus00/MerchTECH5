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
import { productsAPI } from '@/services/api';
import ProductEditorModal from '@/components/ProductEditorModal';

export default function MasterStoreManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const items = await productsAPI.getAllProducts();
      setProducts(items);
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
      const updated = await productsAPI.updateProduct(product.id, { isSuspended: newStatus });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)));
      Alert.alert(
        'Success',
        `Product ${newStatus ? 'suspended' : 're-enabled'} successfully.`,
      );
    } catch (error) {
      console.error('Failed to update product status:', error);
      Alert.alert('Error', 'Unable to update product status.');
    }
  };

  const handleSave = async (updates: Partial<Product>) => {
    if (!editing) return;
    try {
      const updated = await productsAPI.updateProduct(editing.id, updates);
      setProducts((prev) => prev.map((p) => (p.id === editing.id ? updated : p)));
      setEditing(null);
      Alert.alert('Saved', 'Product updated');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update');
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
      <TouchableOpacity style={styles.editButton} onPress={() => setEditing(item)}>
        <ThemedText style={{ color: '#fff' }}>Edit</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const listContent = (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />}
    />
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
      {listContent}
      <ProductEditorModal
        visible={!!editing}
        product={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
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
  editButton: {
    marginTop: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 4,
  },
}); 