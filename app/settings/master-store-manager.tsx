import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  FlatList,
  Switch,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/shared/product-schema';

const productCategories = [
  'Merchandise',
  'Apparel', 
  'Music',
  'Digital',
  'Electronics',
  'Other'
];

interface ProductForm {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  category: string;
  inStock: boolean;
  hasSizes: boolean;
  availableSizes: string[];
  externalUrl: string;
}

export default function MasterStoreManagerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [showFilters, setShowFilters] = useState(false);

  const [productForm, setProductForm] = useState<ProductForm>({
    name: '',
    description: '',
    price: '',
    imageUrl: '',
    category: 'Merchandise',
    inStock: true,
    hasSizes: false,
    availableSizes: [],
    externalUrl: ''
  });

  // Check if user is admin
  useEffect(() => {
    if (!user || user.email !== 'djjetfuel@gmail.com') {
      Alert.alert('Access Denied', 'This page is only accessible to administrators.');
      router.back();
    }
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // Mock data for development - in production this would fetch from API
      const mockProducts: Product[] = [
        {
          id: 1,
          name: 'Premium Headphones',
          description: 'High-quality wireless headphones with noise cancellation',
          price: 19999,
          imageUrl: 'https://picsum.photos/400/400?random=1',
          category: 'Electronics',
          inStock: true,
          slug: 'premium-headphones',
          hasSizes: false,
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'djjetfuel' }
        },
        {
          id: 2,
          name: 'Artist T-Shirt',
          description: 'Comfortable cotton t-shirt with artist logo',
          price: 2499,
          imageUrl: 'https://picsum.photos/400/400?random=2',
          category: 'Apparel',
          inStock: true,
          slug: 'artist-t-shirt',
          hasSizes: true,
          availableSizes: ['S', 'M', 'L', 'XL'],
          isSuspended: false,
          createdAt: new Date().toISOString(),
          creator: { username: 'djjetfuel' }
        },
        {
          id: 3,
          name: 'Digital Album',
          description: 'Latest album in high-quality digital format',
          price: 999,
          imageUrl: 'https://picsum.photos/400/400?random=3',
          category: 'Digital',
          inStock: true,
          slug: 'digital-album',
          hasSizes: false,
          isSuspended: true,
          createdAt: new Date().toISOString(),
          creator: { username: 'djjetfuel' }
        }
      ];
      setProducts(mockProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.creator?.username.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleDeleteProduct = (productId: number) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this product? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setProducts(prev => prev.filter(p => p.id !== productId));
            Alert.alert('Success', 'Product deleted successfully');
          }
        }
      ]
    );
  };

  const toggleProductSuspension = (product: Product) => {
    setProducts(prev => prev.map(p => 
      p.id === product.id ? { ...p, isSuspended: !p.isSuspended } : p
    ));
    Alert.alert('Success', `Product ${product.isSuspended ? 'unsuspended' : 'suspended'} successfully`);
  };

  const handleSaveProduct = () => {
    if (!productForm.name || !productForm.description || !productForm.price) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const price = parseFloat(productForm.price) * 100; // Convert to cents
    if (isNaN(price) || price <= 0) {
      Alert.alert('Error', 'Please enter a valid price');
      return;
    }

    const newProduct: Product = {
      id: editingProduct?.id || Date.now(),
      name: productForm.name,
      description: productForm.description,
      price: price,
      imageUrl: productForm.imageUrl || 'https://picsum.photos/400/400?random=' + Date.now(),
      category: productForm.category,
      inStock: productForm.inStock,
      slug: productForm.name.toLowerCase().replace(/\s+/g, '-'),
      hasSizes: productForm.hasSizes,
      availableSizes: productForm.hasSizes ? productForm.availableSizes : undefined,
      isSuspended: false,
      createdAt: editingProduct?.createdAt || new Date().toISOString(),
      creator: { username: 'djjetfuel' },
      externalUrl: productForm.externalUrl || undefined
    };

    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? newProduct : p));
      setEditingProduct(null);
    } else {
      setProducts(prev => [...prev, newProduct]);
      setIsAddingProduct(false);
    }

    // Reset form
    setProductForm({
      name: '',
      description: '',
      price: '',
      imageUrl: '',
      category: 'Merchandise',
      inStock: true,
      hasSizes: false,
      availableSizes: [],
      externalUrl: ''
    });

    Alert.alert('Success', `Product ${editingProduct ? 'updated' : 'created'} successfully`);
  };

  const openEditModal = (product: Product) => {
    setProductForm({
      name: product.name,
      description: product.description,
      price: (product.price / 100).toString(),
      imageUrl: product.imageUrl,
      category: product.category,
      inStock: product.inStock,
      hasSizes: product.hasSizes || false,
      availableSizes: product.availableSizes || [],
      externalUrl: product.externalUrl || ''
    });
    setEditingProduct(product);
  };

  const renderProductCard = ({ item: product }: { item: Product }) => (
    <ThemedView style={styles.productCard}>
      <Image source={{ uri: product.imageUrl }} style={styles.productImage} />

      <ThemedView style={styles.productInfo}>
        <ThemedText style={styles.productName}>{product.name}</ThemedText>
        <ThemedText style={styles.productDescription} numberOfLines={2}>
          {product.description}
        </ThemedText>
        <ThemedText style={styles.productPrice}>${(product.price / 100).toFixed(2)}</ThemedText>
        <ThemedText style={styles.productCreator}>
          Creator: {product.creator?.username || 'Unknown'}
        </ThemedText>

        <ThemedView style={styles.productStatus}>
          <ThemedView style={[styles.statusBadge, product.inStock ? styles.inStock : styles.outOfStock]}>
            <ThemedText style={styles.statusText}>
              {product.inStock ? 'In Stock' : 'Out of Stock'}
            </ThemedText>
          </ThemedView>

          {product.isSuspended && (
            <ThemedView style={[styles.statusBadge, styles.suspended]}>
              <ThemedText style={styles.statusText}>Suspended</ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.productActions}>
        <TouchableOpacity
          onPress={() => openEditModal(product)}
          style={styles.actionButton}
        >
          <ThemedText style={styles.actionButtonText}>✏️</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => toggleProductSuspension(product)}
          style={styles.actionButton}
        >
          <ThemedText style={styles.actionButtonText}>
            {product.isSuspended ? "▶️" : "⏸️"}
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDeleteProduct(product.id)}
          style={styles.actionButton}
        >
          <ThemedText style={styles.actionButtonText}>🗑️</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );

  const renderProductModal = () => (
    <Modal
      visible={isAddingProduct || !!editingProduct}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <ThemedView style={styles.modalHeader}>
          <ThemedText style={styles.modalTitle}>
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </ThemedText>
          <TouchableOpacity
            onPress={() => {
              setIsAddingProduct(false);
              setEditingProduct(null);
            }}
            style={styles.closeButton}
          >
            <ThemedText style={styles.closeButtonText}>✕</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ScrollView style={styles.modalContent}>
          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Product Name *</ThemedText>
            <TextInput
              style={styles.input}
              value={productForm.name}
              onChangeText={(text) => setProductForm(prev => ({ ...prev, name: text }))}
              placeholder="Enter product name"
            />
          </ThemedView>

          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Description *</ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={productForm.description}
              onChangeText={(text) => setProductForm(prev => ({ ...prev, description: text }))}
              placeholder="Enter product description"
              multiline
              numberOfLines={3}
            />
          </ThemedView>

          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Price (USD) *</ThemedText>
            <TextInput
              style={styles.input}
              value={productForm.price}
              onChangeText={(text) => setProductForm(prev => ({ ...prev, price: text }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </ThemedView>

          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Image URL</ThemedText>
            <TextInput
              style={styles.input}
              value={productForm.imageUrl}
              onChangeText={(text) => setProductForm(prev => ({ ...prev, imageUrl: text }))}
              placeholder="https://example.com/image.jpg"
            />
          </ThemedView>

          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Category</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {productCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setProductForm(prev => ({ ...prev, category }))}
                  style={[
                    styles.categoryChip,
                    productForm.category === category && styles.activeCategoryChip
                  ]}
                >
                  <ThemedText style={[
                    styles.categoryChipText,
                    productForm.category === category && styles.activeCategoryChipText
                  ]}>
                    {category}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </ThemedView>

          <ThemedView style={styles.switchGroup}>
            <ThemedText style={styles.label}>In Stock</ThemedText>
            <Switch
              value={productForm.inStock}
              onValueChange={(value) => setProductForm(prev => ({ ...prev, inStock: value }))}
            />
          </ThemedView>

          <ThemedView style={styles.switchGroup}>
            <ThemedText style={styles.label}>Has Sizes</ThemedText>
            <Switch
              value={productForm.hasSizes}
              onValueChange={(value) => setProductForm(prev => ({ ...prev, hasSizes: value }))}
            />
          </ThemedView>

          {productForm.hasSizes && (
            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.label}>Available Sizes</ThemedText>
              <ThemedText style={styles.helperText}>Enter sizes separated by commas (e.g., S, M, L, XL)</ThemedText>
              <TextInput
                style={styles.input}
                value={productForm.availableSizes.join(', ')}
                onChangeText={(text) => setProductForm(prev => ({ 
                  ...prev, 
                  availableSizes: text.split(',').map(s => s.trim()).filter(s => s.length > 0)
                }))}
                placeholder="S, M, L, XL"
              />
            </ThemedView>
          )}

          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>External URL (Optional)</ThemedText>
            <TextInput
              style={styles.input}
              value={productForm.externalUrl}
              onChangeText={(text) => setProductForm(prev => ({ ...prev, externalUrl: text }))}
              placeholder="https://external-store.com/product"
            />
          </ThemedView>
        </ScrollView>

        <ThemedView style={styles.modalFooter}>
          <TouchableOpacity
            onPress={handleSaveProduct}
            style={styles.saveButton}
          >
            <ThemedText style={styles.saveButtonText}>
              {editingProduct ? 'Update Product' : 'Create Product'}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading products...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Master Store Manager</ThemedText>
        <TouchableOpacity
          onPress={() => setIsAddingProduct(true)}
          style={styles.addButton}
        >
          <ThemedText style={styles.addButtonText}>+ Add Product</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Search and Filters */}
      <ThemedView style={styles.searchContainer}>
        <ThemedView style={styles.searchBox}>
          <ThemedText style={styles.searchIcon}>🔍</ThemedText>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products, creators..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </ThemedView>

        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={styles.filterButton}
        >
          <ThemedText style={styles.filterButtonText}>🔽</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Category Filter */}
      {showFilters && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryFilter}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategory("All")}
            style={[
              styles.categoryButton,
              selectedCategory === "All" && styles.activeCategoryButton
            ]}
          >
            <ThemedText style={[
              styles.categoryButtonText,
              selectedCategory === "All" && styles.activeCategoryButtonText
            ]}>
              All
            </ThemedText>
          </TouchableOpacity>

          {productCategories.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.activeCategoryButton
              ]}
            >
              <ThemedText style={[
                styles.categoryButtonText,
                selectedCategory === category && styles.activeCategoryButtonText
              ]}>
                {category}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stats */}
      <ThemedView style={styles.statsContainer}>
        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{products.length}</ThemedText>
          <ThemedText style={styles.statLabel}>Total Products</ThemedText>
        </ThemedView>

        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>
            {products.filter(p => p.inStock).length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>In Stock</ThemedText>
        </ThemedView>

        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>
            {products.filter(p => p.isSuspended).length}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Suspended</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Products List */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderProductCard}
        contentContainerStyle={styles.productsList}
        showsVerticalScrollIndicator={false}
      />

      {/* Product Modal */}
      {renderProductModal()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  filterButton: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonText: {
    fontSize: 16,
    color: '#1f2937',
  },
  categoryFilter: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeCategoryButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryButtonText: {
    fontSize: 14,
    opacity: 0.7,
  },
  activeCategoryButtonText: {
    color: '#ffffff',
    opacity: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    elevation: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  productsList: {
    padding: 16,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  productInfo: {
    marginBottom: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 4,
  },
  productCreator: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  productStatus: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inStock: {
    backgroundColor: '#dcfce7',
  },
  outOfStock: {
    backgroundColor: '#fee2e2',
  },
  suspended: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  productActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  actionButtonText: {
    fontSize: 20,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    opacity: 0.7,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeCategoryChip: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryChipText: {
    fontSize: 14,
    opacity: 0.7,
  },
  activeCategoryChipText: {
    color: '#ffffff',
    opacity: 1,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  helperText: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});