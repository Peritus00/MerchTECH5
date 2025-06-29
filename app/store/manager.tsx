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
import { useRouter } from 'expo-router';

export default function MyStoreManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const router = useRouter();

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
      let updatedProduct: Product;
      if (editing.id === 'new') { // Creating a new product
        updatedProduct = await productsAPI.createProduct(updates);
        setProducts((prev) => [updatedProduct, ...prev]);
        Alert.alert('Success', 'Product created successfully.');
      } else { // Updating an existing product
        updatedProduct = await productsAPI.updateProduct(editing.id, updates);
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? updatedProduct : p)));
        Alert.alert('Success', 'Product updated successfully.');
      }
      setEditing(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save product.');
    }
  };

  const handleAddNew = () => {
    setEditing({
      id: 'new',
      name: '',
      description: '',
      prices: [{ id: '', unit_amount: 0, currency: 'usd', type: 'one_time' }],
      // Add other default fields for a new product here
    });
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={{color: '#2563eb'}}>← Back to Settings</ThemedText>
        </TouchableOpacity>
      </View>
      {products.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={{ fontSize: 64 }}>📦</ThemedText>
          <ThemedText style={{ marginTop: 12 }}>No products yet</ThemedText>
          <ThemedText style={{ opacity: 0.7, textAlign:'center', marginTop:4 }}>Tap the + button below to add your first product.</ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />
          }
          contentContainerStyle={{ padding: 16 }}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={handleAddNew}>
        <ThemedText style={{ fontSize: 28, color:'#fff' }}>＋</ThemedText>
      </TouchableOpacity>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  editButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  emptyState:{flex:1,justifyContent:'center',alignItems:'center',padding:32},
  fab:{
    position:'absolute',
    right:24,
    bottom:24,
    width:56,
    height:56,
    borderRadius:28,
    backgroundColor:'#2563eb',
    justifyContent:'center',
    alignItems:'center',
    elevation:4,
  },
}); 