import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import CategoryFilter from '@/components/CategoryFilter';
import ProductCard from '@/components/ProductCard';
import SearchBar from '@/components/SearchBar';
import { Product } from '@/shared/product-schema';

export default function ShopScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Apparel', 'Music', 'Merchandise', 'Electronics', 'Other'];

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, searchQuery, selectedCategory]);

  const fetchProducts = async () => {
    try {
      // TODO: replace with real API call: `/products/all`
      const mockProducts: Product[] = [];
      setProducts(mockProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'Failed to load products.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;
    if (searchQuery) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    // sort by popularity descending
    filtered = filtered.sort((a,b)=>Number(b.metadata?.popularity??0)-Number(a.metadata?.popularity??0));
    setFilteredProducts(filtered);
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Shop All Products</ThemedText>
        <ThemedText>Discover the most popular items from every seller.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.filtersContainer}>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search products..." />
        <CategoryFilter categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
      </ThemedView>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchProducts}/>}>
        <ThemedView style={styles.productsGrid}>
          {filteredProducts.map(product => (
            <ProductCard key={product.id} product={product} onPress={()=>{}} />
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  centered:{flex:1,justifyContent:'center',alignItems:'center'},
  header:{padding:16,alignItems:'center'},
  filtersContainer:{paddingHorizontal:16},
  productsGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',padding:16}
}); 