import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SizeSelectorModalProps {
  visible: boolean;
  productName: string;
  sizes: string[];
  onSelectSize: (size: string) => void;
  onClose: () => void;
  title?: string;
}

export default function SizeSelectorModal({
  visible,
  productName,
  sizes,
  onSelectSize,
  onClose,
  title = 'Select Size',
}: SizeSelectorModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialIcons name="close" size={24} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <Text style={styles.productName} numberOfLines={2}>
                {productName}
              </Text>

              <ScrollView
                style={styles.sizesContainer}
                contentContainerStyle={styles.sizesContent}
                showsVerticalScrollIndicator={false}
              >
                {sizes.map((size) => (
                  <TouchableOpacity
                    key={size}
                    style={styles.sizeButton}
                    onPress={() => {
                      onSelectSize(size);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sizeButtonText}>{size}</Text>
                    <MaterialIcons name="chevron-right" size={20} color="#6b7280" />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f9fafb',
  },
  productName: {
    fontSize: 16,
    color: '#d1d5db',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    lineHeight: 22,
  },
  sizesContainer: {
    maxHeight: 300,
  },
  sizesContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  sizeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f9fafb',
  },
  cancelButton: {
    margin: 20,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
  },
});
