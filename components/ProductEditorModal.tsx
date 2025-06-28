import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product } from '@/shared/product-schema';

interface Props {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (updates: Partial<Product>) => void;
}

export default function ProductEditorModal({ visible, product, onClose, onSave }: Props) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(String(product?.prices?.[0]?.unit_amount ?? ''));
  const [inStock, setInStock] = useState(product?.inStock ?? true);

  // Reset fields when product changes
  React.useEffect(() => {
    if (product) {
      setName(product.name);
      setPrice(String(product.prices?.[0]?.unit_amount ?? ''));
      setInStock(product.inStock ?? true);
    }
  }, [product]);

  const handleSave = () => {
    const updates: Partial<Product> = {
      name,
      inStock,
      prices: product?.prices?.length
        ? [
            {
              ...product.prices[0],
              unit_amount: Number(price),
            },
          ]
        : undefined,
    };
    onSave(updates);
  };

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ThemedText type="title" style={{ marginBottom: 12 }}>
            Edit Product
          </ThemedText>
          <ThemedText>Name</ThemedText>
          <TextInput style={styles.input} value={name} onChangeText={setName} />
          <ThemedText>Price (cents)</ThemedText>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
          <ThemedText>In Stock</ThemedText>
          <TouchableOpacity style={styles.toggle} onPress={() => setInStock(!inStock)}>
            <ThemedText>{inStock ? 'Yes' : 'No'}</ThemedText>
          </TouchableOpacity>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <ThemedText style={{ color: '#fff' }}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.save} onPress={handleSave}>
              <ThemedText style={{ color: '#fff' }}>Save</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    width: '90%',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 8,
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
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancel: {
    backgroundColor: '#6b7280',
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
}); 