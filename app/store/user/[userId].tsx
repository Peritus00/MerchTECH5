import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import ProductCard from '@/components/ProductCard';
import { productsAPI, usersAPI } from '@/services/api';
import ShareButton from '@/components/ShareButton';

export default function UserStoreScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{ username?: string; email?: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (userId) {
      fetchUserProducts();
      fetchUserInfo();
    }
  }, [userId]);

  const fetchUserProducts = async () => {
    try {
      const allProducts = await productsAPI.getAllProducts();
      // Filter products by user ID and only show in-stock items
      const userProducts = allProducts.filter(
        (product: Product) => String(product.user_id) === userId && product.in_stock
      );
      setProducts(userProducts);
    } catch (error) {
      console.error('Failed to fetch user products:', error);
      Alert.alert('Error', 'Unable to load store products.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const userInfo = await usersAPI.getUserInfo(userId);
      setUserInfo(userInfo);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      // Fallback to generic name
      setUserInfo({ username: `User ${userId}`, email: '' });
    }
  };

  const handleProductPress = (product: Product) => {
    router.push({
      pathname: '/store/product/[id]',
      params: { id: product.id, product: JSON.stringify(product) }
    });
  };

  const getStoreUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/user/${userId}`;
  };

  const getStoreTitle = () => {
    return `${userInfo?.username || `User ${userId}`}'s Store`;
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
        <ThemedText>Loading store...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={{ color: '#2563eb' }}>← Back</ThemedText>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <View style={styles.titleContainer}>
            <ThemedText type="title" style={styles.storeTitle}>
              {userInfo?.username || `User ${userId}`}'s Store
            </ThemedText>
            <ThemedText style={styles.storeSubtitle}>
              {products.length} {products.length === 1 ? 'item' : 'items'} available
            </ThemedText>
          </View>
          <ShareButton
            url={getStoreUrl()}
            title={getStoreTitle()}
            description={`Browse ${userInfo?.username || `User ${userId}`}'s amazing products`}
            type="store"
            compact={true}
          />
        </View>
      </View>

      {products.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={{ fontSize: 64 }}>🏪</ThemedText>
          <ThemedText style={{ marginTop: 12, fontSize: 18 }}>Store is Empty</ThemedText>
          <ThemedText style={{ opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
            This user hasn't added any products yet.
          </ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          data={products}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  storeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  storeSubtitle: {
    opacity: 0.7,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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