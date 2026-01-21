import React, { useEffect, useState, useRef } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { env } from '@/config/environment';
import {
  performOptimisticUpdate,
  createOptimisticUpdater,
  updateOptimisticUpdater,
  deleteOptimisticUpdater,
} from '@/utils/optimisticUpdates';

// --- Helpers -------------------------------------------------------------
const normalizeProduct = (p: any): Product => {
  if (!p) {
    throw new Error('Product data is null or undefined');
  }
  return {
    ...p,
    inStock: p.inStock ?? p.in_stock ?? true,
  };
};

export default function MyStoreManager() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const { user } = useAuth();
  const { canCreate, refresh: refreshLimits, usage, limits, tier, isLoading: limitsLoading } = useSubscriptionLimits();
  
  // Add ref to track products state for debugging
  const productsRef = useRef<Product[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Generate shareable store URL
  const getStoreUrl = () => {
    return `${env.apiBaseUrl.replace('/api', '')}/store/user/${user?.id}`;
  };

  const getStoreTitle = () => {
    return `${user?.username || 'My'} Store - MerchTech`;
  };

  const copyStoreUrl = async () => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(getStoreUrl());
      } else {
        await Clipboard.setStringAsync(getStoreUrl());
      }
      Alert.alert('Success', 'Store link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Debug: Track products state changes
  useEffect(() => {
    console.log('🔍 PRODUCTS STATE CHANGED: New count:', products.length);
    console.log('🔍 PRODUCTS STATE CHANGED: Products:', products.map(p => ({ id: p.id, name: p.name })));
  }, [products]);

  const fetchProducts = async () => {
    try {
      const items = await productsAPI.getMyProducts();
      setProducts(items.map(normalizeProduct));
    } catch (error) {
      console.error('Failed to fetch products:', error);
      Alert.alert('Error', 'Unable to load products.');
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
      if (editing.id === 'new') {
        console.log('🟡 Creating new product with optimistic update...');
        
        // Create temporary product for optimistic update
        const tempProduct: Product = normalizeProduct({
          ...editing,
          ...updates,
          id: `temp-${Date.now()}`,
        } as Product);
        
        // Optimistic update: immediately add to UI, then create on server
        const updatedState = await performOptimisticUpdate({
          currentState: products,
          mutationType: 'create',
          optimisticUpdate: createOptimisticUpdater(tempProduct),
          serverMutation: async () => {
            const created = await productsAPI.createProduct(updates);
            return normalizeProduct(created);
          },
          extractItem: (response) => response as Product,
          getItemId: (p) => p.id,
          refreshState: fetchProducts,
          onError: (e) => {
            console.error('🔴 Save failed:', e);
            Alert.alert('Error', 'Failed to create product. Please try again.');
          },
          onSuccess: (created) => {
            // Replace temp product with real one
            setProducts(prev => prev.map(p => 
              p.id === tempProduct.id ? created : p
            ));
            refreshLimits();
            Alert.alert('Success', 'Product created successfully.');
            setEditing(null);
          },
        });
        
        setProducts(updatedState);
        refreshLimits();
        Alert.alert('Success', 'Product created successfully.');
        setEditing(null);
      } else {
        console.log('🟡 Updating existing product with optimistic update:', editing.id);
        
        // Create optimistic updated product
        const optimisticProduct = normalizeProduct({
          ...editing,
          ...updates,
        } as Product);
        
        // Optimistic update: immediately update UI, then update on server
        const updatedState = await performOptimisticUpdate({
          currentState: products,
          mutationType: 'update',
          optimisticUpdate: updateOptimisticUpdater(optimisticProduct, (p) => p.id),
          serverMutation: async () => {
            const updated = await productsAPI.updateProduct(editing.id, updates);
            return normalizeProduct(updated);
          },
          extractItem: (response) => response as Product,
          getItemId: (p) => p.id,
          refreshState: fetchProducts,
          onError: (e) => {
            console.error('🔴 Save failed:', e);
            Alert.alert('Error', 'Failed to update product. Changes have been reverted.');
          },
          onSuccess: (updated) => {
            setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
            Alert.alert('Success', 'Product updated successfully.');
            setEditing(null);
          },
        });
        
        setProducts(updatedState);
        Alert.alert('Success', 'Product updated successfully.');
        setEditing(null);
      }
    } catch (e) {
      console.error('🔴 Save failed:', e);
      console.error('🔴 Error details:', e.response?.data || e.message);
      Alert.alert('Error', 'Failed to save product.');
    }
  };

  const handleDelete = (productId: string) => {
    console.log('🗑️ DELETE DEBUG: handleDelete called with id', productId);
    console.log('🗑️ DELETE DEBUG: Current products count:', products.length);
    console.log('🗑️ DELETE DEBUG: Current products ref count:', productsRef.current.length);
    console.log('🗑️ DELETE DEBUG: Current products:', products.map(p => ({ id: p.id, name: p.name })));
    
    const idStr = productId;

    const performDelete = async () => {
      try {
        console.log('🗑️ DELETE DEBUG: Starting optimistic delete for product:', idStr);
        
        // Optimistic update: immediately remove from UI, then delete on server
        const updatedState = await performOptimisticUpdate({
          currentState: products,
          mutationType: 'delete',
          optimisticUpdate: deleteOptimisticUpdater(idStr, (p) => String(p.id)),
          serverMutation: async () => {
            await productsAPI.deleteProduct(idStr);
            return { success: true };
          },
          getItemId: (p) => String(p.id),
          refreshState: fetchProducts,
          onError: (e) => {
            console.error('🗑️ DELETE DEBUG: Delete failed:', e);
            if (Platform.OS !== 'web') {
              Alert.alert('Error', 'Failed to delete product. The product has been restored.');
            }
          },
          onSuccess: () => {
            setEditing(null);
            refreshLimits();
            setRenderTrigger(prev => prev + 1);
            if (Platform.OS !== 'web') {
              Alert.alert('Success', 'Product deleted.');
            } else {
              console.log('🗑️ DELETE DEBUG: Product deleted successfully (web)');
            }
          },
        });
        
        setProducts(updatedState);
        setEditing(null);
        refreshLimits();
        setRenderTrigger(prev => prev + 1);
        
        if (Platform.OS !== 'web') {
          Alert.alert('Success', 'Product deleted.');
        } else {
          console.log('🗑️ DELETE DEBUG: Product deleted successfully (web)');
        }
      } catch (e) {
        console.error('🗑️ DELETE DEBUG: Delete failed:', e);
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
    console.log('🔍 DEBUG: + button clicked');
    console.log('🔍 DEBUG: limitsLoading:', limitsLoading);
    console.log('🔍 DEBUG: usage:', usage);
    console.log('🔍 DEBUG: limits:', limits);
    console.log('🔍 DEBUG: tier:', tier);

    // Wait for subscription data to load before checking limits
    if (limitsLoading) {
      console.log('🔍 DEBUG: Still loading, returning early');
      return;
    }

    // Check subscription limits before allowing product creation
    const canCreateProduct = canCreate('products');
    console.log('🔍 DEBUG: canCreateProduct result:', canCreateProduct);
    
    if (!canCreateProduct.allowed) {
      const currentCount = usage.products;
      const maxCount = limits.maxProducts;
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      
      console.log('🔍 DEBUG: Showing alert with:', { currentCount, maxCount, tierName });
      
      const alertMessage = `You have reached your limit of ${maxCount} products on the ${tierName} plan.\n\nCurrent usage: ${currentCount}/${maxCount} products\n\nWould you like to upgrade to create more products?`;
      
      if (Platform.OS === 'web') {
        // Use native browser confirm for web
        const shouldUpgrade = window.confirm(`📦 Product Limit Reached\n\n${alertMessage}`);
        if (shouldUpgrade) {
          router.push('/subscription');
        }
      } else {
        // Use React Native Alert for mobile
        Alert.alert(
          '📦 Product Limit Reached',
          alertMessage,
          [
            { 
              text: 'Cancel', 
              style: 'cancel' 
            },
            { 
              text: 'Upgrade Plan', 
              style: 'default',
              onPress: () => router.push('/subscription')
            }
          ]
        );
      }
      return;
    }

    console.log('🔍 DEBUG: Limits check passed, opening modal');
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
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          onPress={() => router.replace('/(tabs)/settings')} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
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
          keyExtractor={(item) => `${item.id}-${renderTrigger}`}
          renderItem={renderItem}
          extraData={`${products.length}-${renderTrigger}`}
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