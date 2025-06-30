import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
  Platform,
  Clipboard,
} from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import ProductCard from '@/components/ProductCard';
import { productsAPI } from '@/services/api';
import ProductEditorModal from '@/components/ProductEditorModal';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import ShareButton from '@/components/ShareButton';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';
import SubscriptionLimitsCard from '@/components/SubscriptionLimitsCard';

// --- Helpers -------------------------------------------------------------
const normalizeProduct = (p: any): Product => ({
  ...p,
  inStock: p.inStock ?? p.in_stock ?? true,
});

export default function MyStoreManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { canCreate, refresh: refreshLimits } = useSubscriptionLimits();

  // Generate shareable store URL
  const getStoreUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/user/${user?.id || 'unknown'}`;
  };

  const getStoreTitle = () => {
    return `${user?.firstName || user?.username || 'My'}'s Store`;
  };

  const copyStoreUrl = async () => {
    const url = getStoreUrl();
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(url);
      } else {
        Clipboard.setString(url);
      }
      Alert.alert('Success', 'Store URL copied to clipboard!');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy URL');
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const items = await productsAPI.getMyProducts();
      setProducts(items.map(normalizeProduct));
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSave = async (updates: Partial<Product>) => {
    console.log('🟡 StoreManager: handleSave called with updates:', updates);
    console.log('🟡 Current editing product:', editing);
    
    if (!editing) return;
    
    try {
      let updatedProduct: Product;
      if (editing.id === 'new') {
        console.log('🟡 Creating new product...');
        // Creating a new product
        updatedProduct = await productsAPI.createProduct(updates);
        console.log('✅ Product created:', updatedProduct);
        setProducts((prev) => [normalizeProduct(updatedProduct), ...prev]);
        // Refresh subscription limits after creating a product
        refreshLimits();
        Alert.alert('Success', 'Product created successfully.');
      } else {
        console.log('🟡 Updating existing product with ID:', editing.id);
        // Updating an existing product
        updatedProduct = await productsAPI.updateProduct(editing.id, updates);
        console.log('✅ Product updated:', updatedProduct);
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? normalizeProduct(updatedProduct) : p)));
        Alert.alert('Success', 'Product updated successfully.');
      }
      setEditing(null);
    } catch (e) {
      console.error('🔴 Save failed:', e);
      console.error('🔴 Error details:', e.response?.data || e.message);
      Alert.alert('Error', 'Failed to save product.');
    }
  };

  const handleDelete = (productId: string) => {
    console.log('handleDelete called with id', productId);
    const idStr = productId;

    const performDelete = async () => {
      try {
        await productsAPI.deleteProduct(idStr);
        setProducts((prev) => prev.filter((p) => String(p.id) !== idStr));
        console.log('Product locally removed; state updated');
        setEditing(null);
        if (Platform.OS !== 'web') {
          Alert.alert('Success', 'Product deleted.');
        }
      } catch (e) {
        console.error('Delete failed:', e);
        if (Platform.OS !== 'web') {
          Alert.alert('Error', 'Failed to delete product.');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this product? This cannot be undone.')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete Product',
        'Are you sure you want to delete this product? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const handleAddNew = () => {
    // Check subscription limits before allowing product creation
    const canCreateProduct = canCreate('products');
    
    if (!canCreateProduct.allowed) {
      Alert.alert(
        'Product Limit Reached',
        canCreateProduct.message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }

    setEditing({
      id: 'new',
      name: '',
      description: '',
      prices: [{ id: '', unit_amount: 0, currency: 'usd', type: 'one_time' }],
      inStock: true,
      metadata: {
        hasSizes: false,
        availableSizes: [],
      },
      // Add other default fields for a new product here
    });
  };

  const renderItem = ({ item }: { item: Product }) => (
    <View style={{ marginBottom: 24 }}>
      <ProductCard product={item} onPress={() => setEditing(item)} />
      <TouchableOpacity style={styles.editButton} onPress={() => setEditing(item)}>
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
        <TouchableOpacity onPress={() => router.replace('/(tabs)/settings')} style={styles.backButton}>
          <ThemedText style={{ color: '#2563eb' }}>← Back to Settings</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Subscription Limits */}
      <SubscriptionLimitsCard compact={true} />

      {/* Shareable Store Link Section */}
      <View style={styles.shareSection}>
        <View style={styles.shareHeader}>
          <ThemedText type="subtitle" style={styles.shareTitle}>
            🔗 Share Your Store
          </ThemedText>
          <ShareButton
            url={getStoreUrl()}
            title={getStoreTitle()}
            description="Browse my amazing products"
            type="store"
            compact={true}
          />
        </View>
        <View style={styles.urlContainer}>
          <ThemedText style={styles.urlText} numberOfLines={1}>
            {getStoreUrl()}
          </ThemedText>
          <TouchableOpacity style={styles.copyButton} onPress={copyStoreUrl}>
            <ThemedText style={styles.copyButtonText}>Copy Link</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.shareHint}>
          Share this link or create a QR code in the QR Creator to let customers browse your products
        </ThemedText>
      </View>
      {products.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={{ fontSize: 64 }}>📦</ThemedText>
          <ThemedText style={{ marginTop: 12 }}>No products yet</ThemedText>
          <ThemedText style={{ opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
            Tap the + button below to add your first product.
          </ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchProducts} />}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={handleAddNew}>
        <ThemedText style={{ fontSize: 28, color: '#fff' }}>＋</ThemedText>
      </TouchableOpacity>
      <ProductEditorModal
        visible={!!editing}
        product={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={handleDelete}
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
  editButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
}); 