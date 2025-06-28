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

export default function MyStoreManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const items = await productsAPI.getMyProducts();
      setProducts(items);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSave = async (updates: Partial<Product>) => {
    if (!editing) return;
    try {
      const updated = await productsAPI.updateProduct(editing.id, updates);
      setProducts((prev) => prev.map((p) => (p.id === editing.id ? updated : p)));
      setEditing(null);
      Alert.alert('Saved', 'Product updated successfully');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update product');
    }
  };

  const renderItem = ({ item }: { item: Product }) => (
    <View style={{ marginBottom: 24 }}>
      <ProductCard product={item} onPress={() => {}} />
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => setEditing(item)}
      >
        <ThemedText style={{ color: '#fff' }}>Edit</ThemedText>
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
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />
        }
        contentContainerStyle={{ padding: 16 }}
      />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  editButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
}); 