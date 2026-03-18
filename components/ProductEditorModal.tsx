import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View, Switch, useColorScheme, Image, Alert, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';
import { Colors } from '@/constants/Colors';
import * as ImagePicker from 'expo-image-picker';
import { api, mediaAPI } from '@/services/api';

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
  const [acknowledgeServiceCharge, setAcknowledgeServiceCharge] = useState(false);

  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Gray', 'Pink', 'Purple', 'Orange', 'Brown', 'Navy'];
  const CATEGORIES = ['Painting', 'Sculpture', 'Literature', 'Architecture', 'Theater', 'Film', 'Music'];

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
      // Reset service charge acknowledgment for new products
      setAcknowledgeServiceCharge(product.id !== 'new');
    } else {
      // Reset all fields when product is null (modal closed)
      setName('');
      setDescription('');
      setImages([]);
      setPrice('');
      setInStock(true);
      setHasSizes(false);
      setAvailableSizes([]);
      setHasColors(false);
      setAvailableColors([]);
      setCategory('');
      setAcknowledgeServiceCharge(false);
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
    if (images.length >= 5) {
      Alert.alert('Maximum Images', 'You can only add up to 5 images per product.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      try {
        const asset = result.assets[0];
        let filePayload;

        // file.mimeType is the actual MIME type (e.g. 'image/jpeg').
        // file.type is only the media category ('image' | 'video') and must NOT be used as a MIME type.
        const mimeType = asset.mimeType || 'image/jpeg';
        const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const timestamp = Date.now();
        const filename = asset.fileName || `product_${timestamp}.${extension}`;

        if (typeof window !== 'undefined') {
          // On web, expo-image-picker v16+ exposes asset.file — use it directly
          // to preserve the correct MIME type without an extra fetch/re-encode.
          if (asset.file instanceof File) {
            filePayload = new File([asset.file], filename, { type: mimeType });
          } else {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const resolvedMime = blob.type?.startsWith('image/') ? blob.type : mimeType;
            filePayload = new File([blob], filename, { type: resolvedMime });
          }
        } else {
          // React Native environment
          filePayload = {
            uri: asset.uri,
            name: filename,
            type: mimeType,
          };
        }

        console.log('📤 PRODUCT: Uploading image to S3 via presigned flow...', {
          name: filePayload.name || (filePayload as any).uri?.split('/').pop(),
          type: filePayload.type,
          isFile: filePayload instanceof File,
          originalFile: {
            uri: asset.uri.substring(0, 50) + '...',
            mimeType: asset.mimeType,
            type: asset.type,
            width: asset.width,
            height: asset.height
          }
        });

        const uploadedMedia = await mediaAPI.uploadFile(filePayload);
        const imageUrl = uploadedMedia?.url;
        if (!imageUrl) {
          throw new Error('Upload succeeded but no URL returned');
        }
        console.log('📤 PRODUCT: S3 upload successful:', imageUrl);

        setImages([...images, imageUrl]);
      } catch (error) {
        console.error('📤 PRODUCT: Upload failed:', error);
        alert('Upload failed');
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    const newImages = [...images];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    setImages(newImages);
  };

  const handleMoveImageUp = (index: number) => {
    if (index > 0) {
      handleMoveImage(index, index - 1);
    }
  };

  const handleMoveImageDown = (index: number) => {
    if (index < images.length - 1) {
      handleMoveImage(index, index + 1);
    }
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

    // Check service charge acknowledgment for new products
    if (product?.id === 'new' && !acknowledgeServiceCharge) {
      console.log('🔴 Validation failed: Service charge not acknowledged');
      Alert.alert(
        'Service Charge Acknowledgment Required',
        'You must acknowledge that MerchTech collects a 9% service charge on all purchases before creating a product.'
      );
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

  const handleClose = () => {
    // Reset all state when closing
    setName('');
    setDescription('');
    setImages([]);
    setPrice('');
    setInStock(true);
    setHasSizes(false);
    setAvailableSizes([]);
    setHasColors(false);
    setAvailableColors([]);
    setCategory('');
    setAcknowledgeServiceCharge(false);
    onClose();
  };

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContainer}>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={true}
            bounces={true}
            keyboardShouldPersistTaps="handled"
          >
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
            <ThemedText style={{ marginTop: 16, marginBottom: 8 }}>
              Product Images ({images.length}/5)
            </ThemedText>
            <View style={styles.imageContainer}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  {index === 0 && (
                    <View style={styles.primaryImageBadge}>
                      <ThemedText style={styles.primaryImageText}>Primary</ThemedText>
                    </View>
                  )}
                  <View style={styles.imageControls}>
                    <TouchableOpacity 
                      onPress={() => handleMoveImageUp(index)} 
                      style={[styles.imageControlButton, index === 0 && styles.disabledButton]}
                      disabled={index === 0}
                    >
                      <ThemedText style={[styles.imageControlText, index === 0 && styles.disabledText]}>↑</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleMoveImageDown(index)} 
                      style={[styles.imageControlButton, index === images.length - 1 && styles.disabledButton]}
                      disabled={index === images.length - 1}
                    >
                      <ThemedText style={[styles.imageControlText, index === images.length - 1 && styles.disabledText]}>↓</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleRemoveImage(index)} 
                      style={[styles.imageControlButton, styles.removeButton]}
                    >
                      <ThemedText style={[styles.imageControlText, styles.removeText]}>×</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity 
              onPress={handlePickImage} 
              style={[styles.uploadButton, images.length >= 5 && styles.disabledUploadButton]}
              disabled={images.length >= 5}
            >
              <ThemedText style={[{ color: '#11181C' }, images.length >= 5 && styles.disabledUploadText]}>
                {images.length >= 5 ? 'Maximum Images Reached' : `Add Image (${images.length}/5)`}
              </ThemedText>
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

            {/* Service Charge Acknowledgment - Only show for new products */}
            {product?.id === 'new' && (
              <View style={styles.serviceChargeContainer}>
                <TouchableOpacity
                  style={styles.serviceChargeCheckbox}
                  onPress={() => setAcknowledgeServiceCharge(!acknowledgeServiceCharge)}
                >
                  <View style={[styles.checkbox, acknowledgeServiceCharge && styles.checkboxChecked]}>
                    {acknowledgeServiceCharge && (
                      <ThemedText style={styles.checkmark}>✓</ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.serviceChargeText}>
                    I acknowledge that MerchTech collects a 9% service charge on all purchases made through this platform.
                  </ThemedText>
                </TouchableOpacity>
              </View>
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
                <TouchableOpacity style={styles.cancel} onPress={handleClose}>
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
    paddingVertical: 50,
  },
  modalContainer: {
    padding: 20,
    borderRadius: 8,
    width: '90%',
    maxHeight: '80%',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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
    borderRadius: 8,
    overflow: 'hidden',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  primaryImageBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  primaryImageText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  imageControls: {
    position: 'absolute',
    top: 2,
    right: 2,
    flexDirection: 'column',
    gap: 1,
  },
  imageControlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageControlText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  disabledText: {
    color: '#999',
  },
  removeButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
  },
  removeText: {
    color: '#fff',
  },
  uploadButton: {
    backgroundColor: '#e5e7eb',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  disabledUploadButton: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  disabledUploadText: {
    color: '#9ca3af',
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
  serviceChargeContainer: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  serviceChargeCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#d97706',
    borderRadius: 4,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#d97706',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  serviceChargeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#92400e',
    fontWeight: '500',
  },
}); 