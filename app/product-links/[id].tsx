import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Product } from '@/shared/product-schema';
import { api } from '@/services/api';
import ProductCard from '@/components/ProductCard';

export default function ProductLinkManagerScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const navigation = useNavigation();
  
  const [playlistName, setPlaylistName] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const contentType = (type === 'slideshow' ? 'slideshow' : 'playlist') as 'playlist' | 'slideshow';

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      console.log('🔴 PRODUCT_LINKS: Fetching data for playlist:', id);
      
      const { playlistAPI, slideshowAPI } = await import('@/services/api');
      
      if (contentType === 'playlist') {
        try {
          const playlist = await playlistAPI.getById(id);
          setPlaylistName(playlist.name);
          console.log('🔴 PRODUCT_LINKS: Loaded playlist:', playlist.name);
        } catch (error) {
          console.log('🔴 PRODUCT_LINKS: Could not load playlist, using default name');
          setPlaylistName('Playlist');
        }
      } else {
        try {
          const slideshow = await slideshowAPI.getById(id);
          setPlaylistName(slideshow.name);
          console.log('🔴 PRODUCT_LINKS: Loaded slideshow:', slideshow.name);
        } catch (error) {
          console.log('🔴 PRODUCT_LINKS: Could not load slideshow, using default name');
          setPlaylistName('Slideshow');
        }
      }
      
      // Fetch user's products
      const response = await api.get('/products?mine=true');
      const userProducts = response.data.products || [];
      setProducts(userProducts);
      console.log('🔴 PRODUCT_LINKS: Loaded user products:', userProducts.length);
      
      // Fetch existing links
      try {
        const linksRes = await api.get(contentType==='playlist'?`/playlists/${id}/product-links`:`/slideshows/${id}/product-links`);
        const initialIds = (linksRes.data || linksRes.data.links || linksRes.data).map((l:any)=>l.productId || l.product_id);
        setLinkedProductIds(initialIds);
        console.log('🔴 PRODUCT_LINKS: Existing links:', initialIds.length);
      } catch(linkErr){
        console.log('🔴 PRODUCT_LINKS: No existing links found');
      }
      
    } catch (error: any) {
      console.error('🔴 PRODUCT_LINKS: Error fetching data:', error);
      Alert.alert('Error', `Failed to load data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleProductLink = async (productId: number) => {
    try {
      const isCurrentlyLinked = linkedProductIds.includes(productId);
      
      if (isCurrentlyLinked) {
        // Remove link
        setLinkedProductIds(prev => prev.filter(id => id !== productId));
        console.log('🔴 PRODUCT_LINKS: Unlinked product:', productId);
        
        await api.delete(contentType==='playlist'
          ? `/playlists/${id}/product-links/${productId}`
          : `/slideshows/${id}/product-links/${productId}`);
        
      } else {
        // Add link
        setLinkedProductIds(prev => [...prev, productId]);
        console.log('🔴 PRODUCT_LINKS: Linked product:', productId);
        
        await api.post(contentType==='playlist'?`/playlists/${id}/product-links`:`/slideshows/${id}/product-links`, {productId});
      }
      
    } catch (error) {
      console.error('🔴 PRODUCT_LINKS: Error toggling product link:', error);
      Alert.alert('Error', 'Failed to update product link');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading products...</ThemedText>
      </ThemedView>
    );
  }

  const linkedProducts = products.filter(product => linkedProductIds.includes(product.id));
  const availableProducts = products.filter(product => !linkedProductIds.includes(product.id));

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Links</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerSubtitle}>{linkedProducts.length} linked</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {playlistName}
          </Text>
          <Text style={styles.playlistSubtitle}>
            {linkedProducts.length} product link{linkedProducts.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Linked Products */}
        {linkedProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Active Links ({linkedProducts.length})
            </Text>
            {linkedProducts.map((product) => (
              <View key={product.id} style={styles.productContainer}>
                <ProductCard
                  product={product}
                  onPress={() => {}}
                  showActions={false}
                />
                <TouchableOpacity
                  style={styles.unlinkButton}
                  onPress={() => handleToggleProductLink(product.id)}
                >
                  <MaterialIcons name="link-off" size={20} color="#ef4444" />
                  <Text style={styles.unlinkButtonText}>Remove Link</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Available Products */}
        {availableProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Available Products ({availableProducts.length})
            </Text>
            {availableProducts.map((product) => (
              <View key={product.id} style={styles.productContainer}>
                <ProductCard
                  product={product}
                  onPress={() => {}}
                  showActions={false}
                />
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => handleToggleProductLink(product.id)}
                >
                  <MaterialIcons name="add-link" size={20} color="#22c55e" />
                  <Text style={styles.linkButtonText}>Add Link</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {products.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="shopping-bag" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>No products found</Text>
            <Text style={styles.emptySubtext}>
              Create products in your store first, then link them to this playlist for promotion during playback
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('store' as never)}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.createButtonText}>Go to Store</Text>
            </TouchableOpacity>
          </View>
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
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  playlistInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playlistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  playlistSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  productContainer: {
    marginBottom: 16,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  unlinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
  },
  unlinkButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
