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

// --- Helpers -------------------------------------------------------------
const normalizeProduct = (p: any): Product => ({
  ...p,
  in_stock: p.in_stock ?? p.inStock ?? true,
});

export default function MasterStoreManager() {
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
      const items = await productsAPI.getAllProducts();
      setProducts(items.map(normalizeProduct));
    } catch (error) {
      console.error('Failed to fetch products:', error);
      Alert.alert('Error', 'Unable to load products.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const toggleStock = async (product: Product) => {
    const newStatus = !product.in_stock;
    try {
              const updated = await productsAPI.updateProduct(product.id, { in_stock: newStatus });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? normalizeProduct(updated) : p)));
      Alert.alert(
        'Success',
        `Product marked as ${newStatus ? 'in stock' : 'out of stock'} successfully.`,
      );
    } catch (error) {
      console.error('Failed to update product status:', error);
      Alert.alert('Error', 'Unable to update product status.');
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
    <View style={styles.cardWrapper}>
      <ProductCard product={item} onPress={() => {}} />
      <TouchableOpacity
        style={[
          styles.stockButton,
          { backgroundColor: item.in_stock ? '#ef4444' : '#22c55e' },
        ]}
        onPress={() => toggleStock(item)}
      >
        <ThemedText style={styles.stockText}>
          {item.in_stock ? 'Mark Out of Stock' : 'Mark In Stock'}
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={{color: '#2563eb'}}>← Back to Settings</ThemedText>
        </TouchableOpacity>
      </View>
      {products.length===0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={{fontSize:64}}>📦</ThemedText>
          <ThemedText style={{marginTop:12}}>No products yet</ThemedText>
          <ThemedText style={{opacity:0.7,textAlign:'center',marginTop:4}}>Tap the + button below to add a product.</ThemedText>
        </ThemedView>
      ) : listContent}
      <TouchableOpacity style={styles.fab} onPress={handleAddNew}>
        <ThemedText style={{fontSize:28,color:'#fff'}}>＋</ThemedText>
      </TouchableOpacity>
      <ProductEditorModal
        visible={!!editing}
        product={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={() => {}} // Fix: Provide a no-op function or implement handleDelete if needed
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    marginBottom: 24,
  },
  stockButton: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  stockText: {
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