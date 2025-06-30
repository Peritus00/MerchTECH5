import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View, Switch, useColorScheme, Image, Alert, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import { Colors } from '@/constants/Colors';
import * as ImagePicker from 'expo-image-picker';
import { uploadService } from '@/services/uploadService';

interface Props {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (updates: Partial<Product>) => void;
  onDelete: (productId: string) => void;
}

export default function ProductEditorModal({ visible, product, onClose, onSave, onDelete }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [price, setPrice] = useState(
    product?.prices?.[0]?.unit_amount ? String(product.prices[0].unit_amount / 100) : ''
  );
  const [inStock, setInStock] = useState(product?.inStock ?? true);
  const [hasSizes, setHasSizes] = useState(product?.metadata?.hasSizes ?? false);
  const [availableSizes, setAvailableSizes] = useState<string[]>(
    product?.metadata?.availableSizes ?? []
  );
  const [hasColors, setHasColors] = useState(product?.metadata?.hasColors ?? false);
  const [availableColors, setAvailableColors] = useState<string[]>(
    product?.metadata?.availableColors ?? []
  );
  const [category, setCategory] = useState<string>(product?.category ?? '');

  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Gray', 'Pink', 'Purple', 'Orange', 'Brown', 'Navy'];
  const CATEGORIES = ['Music', 'Painting', 'Sculpture', 'Literature', 'Architecture', 'Performing', 'Film'];

  // Reset fields when product changes
  React.useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? '');
      setImages(product.images ?? []);
      setPrice(
        product.prices?.[0]?.unit_amount ? String(product.prices[0].unit_amount / 100) : ''
      );
      setInStock(product.in_stock ?? true);
      setHasSizes(product.metadata?.hasSizes ?? false);
      setAvailableSizes(product.metadata?.availableSizes ?? []);
      setHasColors(product.metadata?.hasColors ?? false);
      setAvailableColors(product.metadata?.availableColors ?? []);
      setCategory(product.category ?? '');
    }
  }, [product]);

  const toggleSize = (size: string) => {
    setAvailableSizes((prevSizes) =>
      prevSizes.includes(size) ? prevSizes.filter((s) => s !== size) : [...prevSizes, size]
    );
  };

  const toggleColor = (color: string) => {
    setAvailableColors((prevColors) =>
      prevColors.includes(color) ? prevColors.filter((c) => c !== color) : [...prevColors, color]
    );
  };

  const handlePickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      try {
        const { imageUrl } = await uploadService.uploadImage(result.assets[0].uri);
        setImages([...images, imageUrl]);
      } catch (error) {
        console.error('Upload failed:', error);
        alert('Upload failed');
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    console.log('🔵 ProductEditorModal: handleSave called');
    console.log('🔵 Current state:', { name, description, price, category, inStock, images });
    
    if (!category) {
      console.log('🔴 Validation failed: Missing category');
      Alert.alert('Missing Category', 'Please select a category for this product.');
      return;
    }
    if (!price || isNaN(Number(price))) {
      console.log('🔴 Validation failed: Invalid price:', `"${price}"`, 'length:', price.length, 'isNaN:', isNaN(Number(price)));
      Alert.alert('Invalid Price', 'Please enter a valid numeric price.');
      return;
    }
    
    console.log('✅ Validation passed, building updates object...');
    const updates: Partial<Product> & { metadata: any } = {
      name,
      description,
      images,
      inStock,
      category,
      prices: [
        {
          ...(product?.prices?.[0]?.id && { id: product.prices[0].id }),
          currency: 'usd',
          type: 'one_time',
          unit_amount: Math.round(Number(price) * 100),
        },
      ],
      price: Math.round(Number(price) * 100), // legacy field
      metadata: {
        ...product?.metadata,
        hasSizes,
        availableSizes: hasSizes ? availableSizes : [],
        hasColors,
        availableColors: hasColors ? availableColors : [],
        price: Math.round(Number(price) * 100),
      },
    };
    console.log('🔵 Updates object:', JSON.stringify(updates, null, 2));
    console.log('🔵 Calling onSave with updates...');
    onSave(updates);
    console.log('🔵 onSave call completed');
  };

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <ThemedText type="title" style={{ marginBottom: 12 }}>
              Edit Product
            </ThemedText>
            <ThemedText>Name</ThemedText>
            <TextInput
              style={[styles.input, { color: Colors[colorScheme].text, borderColor: Colors[colorScheme].border }]}
              value={name}
              onChangeText={setName}
              placeholderTextColor={Colors[colorScheme].text}
            />
            <ThemedText>Description</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: Colors[colorScheme].text,
                  borderColor: Colors[colorScheme].border,
                  height: 80,
                  textAlignVertical: 'top',
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholderTextColor={Colors[colorScheme].text}
              multiline
            />
            <View style={styles.imageContainer}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <TouchableOpacity onPress={() => handleRemoveImage(index)} style={styles.removeImageButton}>
                    <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>X</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={handlePickImage} style={styles.uploadButton}>
              <ThemedText style={{ color: '#11181C' }}>upload image here</ThemedText>
            </TouchableOpacity>
            <ThemedText>Price (USD)</ThemedText>
            <TextInput
              style={[styles.input, { color: Colors[colorScheme].text, borderColor: Colors[colorScheme].border }]}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholderTextColor={Colors[colorScheme].text}
            />
            <ThemedText style={{ marginBottom: 8 }}>Category</ThemedText>
            <View style={styles.categoriesContainer}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, category === cat && styles.categoryChipSelected]}
                  onPress={() => {
                    console.log('🔵 Category chip pressed:', cat);
                    console.log('🔵 Current category before:', category);
                    setCategory(cat);
                    console.log('🔵 setCategory called with:', cat);
                  }}
                >
                  <ThemedText style={{ color: category === cat ? '#fff' : '#11181C' }}>{cat}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.toggleContainer}>
              <ThemedText>In Stock</ThemedText>
              <Switch value={inStock} onValueChange={setInStock} />
            </View>
            <View style={styles.toggleContainer}>
              <ThemedText>Has Sizes</ThemedText>
              <Switch value={hasSizes} onValueChange={setHasSizes} />
            </View>
            {hasSizes && (
              <>
                <ThemedText style={{ marginBottom: 8 }}>Available Sizes</ThemedText>
                <View style={styles.sizesContainer}>
                  {SIZES.map((size) => (
                    <TouchableOpacity
                      key={size}
                      style={styles.sizeCheckbox}
                      onPress={() => toggleSize(size)}
                    >
                      <ThemedText style={styles.checkboxText}>
                        {`[${availableSizes.includes(size) ? 'X' : ' '}] `}
                      </ThemedText>
                      <ThemedText>{size}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.toggleContainer}>
              <ThemedText>Has Colors</ThemedText>
              <Switch value={hasColors} onValueChange={setHasColors} />
            </View>
            {hasColors && (
              <>
                <ThemedText style={{ marginBottom: 8 }}>Available Colors</ThemedText>
                <View style={styles.colorsContainer}>
                  {COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={styles.colorCheckbox}
                      onPress={() => toggleColor(color)}
                    >
                      <ThemedText style={styles.checkboxText}>
                        {`[${availableColors.includes(color) ? 'X' : ' '}] `}
                      </ThemedText>
                      <ThemedText>{color}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.actions}>
              {product?.id !== 'new' && (
                <TouchableOpacity
                  style={styles.delete}
                  onPress={() => onDelete(product!.id)}
                >
                  <ThemedText style={{ color: '#fff' }}>Delete</ThemedText>
                </TouchableOpacity>
              )}

              <View style={styles.rightActions}>
                <TouchableOpacity style={styles.cancel} onPress={onClose}>
                  <ThemedText style={{ color: '#fff' }}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.save} 
                  onPress={() => {
                    console.log('🔵 Save button physically pressed');
                    handleSave();
                  }}
                >
                  <ThemedText style={{ color: '#fff' }}>Save</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    padding: 20,
    borderRadius: 8,
    width: '90%',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggle: {
    padding: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  rightActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancel: {
    backgroundColor: '#6b7280',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  delete: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  save: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  sizesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  sizeCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '33%',
    marginBottom: 8,
  },
  colorsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  colorCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '33%',
    marginBottom: 8,
  },
  checkboxText: {
    fontWeight: 'bold',
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 4,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  uploadButton: {
    backgroundColor: '#e5e7eb',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  categoryChip: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth:1,
    borderColor:'#9ca3af',
  },
  categoryChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
}); 