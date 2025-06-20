
import React, { useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { QRCodeGenerator } from './QRCodeGenerator';
import { qrCodeService } from '../services/qrCodeService';
import { CreateQRCodeData } from '../types';

interface CreateQRModalProps {
  visible: boolean;
  onClose: () => void;
  onQRCreated: () => void;
}

export const CreateQRModal: React.FC<CreateQRModalProps> = ({
  visible,
  onClose,
  onQRCreated,
}) => {
  const [formData, setFormData] = useState<CreateQRCodeData>({
    name: '',
    url: '',
    options: {
      size: 200,
      foregroundColor: '#000000',
      backgroundColor: '#ffffff',
    },
  });
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await qrCodeService.createQRCode(formData);
      Alert.alert('Success', 'QR Code created successfully!');
      onQRCreated();
      handleClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to create QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      url: '',
      options: {
        size: 200,
        foregroundColor: '#000000',
        backgroundColor: '#ffffff',
      },
    });
    setPreviewMode(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <ThemedText style={styles.cancelButton}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">Create QR Code</ThemedText>
          <TouchableOpacity onPress={handleCreate} disabled={loading}>
            <ThemedText style={[styles.createButton, loading && styles.disabled]}>
              {loading ? 'Creating...' : 'Create'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <ThemedText type="subtitle">Basic Information</ThemedText>
            
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Name *</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter QR code name"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>URL *</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.url}
                onChangeText={(text) => setFormData({ ...formData, url: text })}
                placeholder="https://example.com"
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle">Customization</ThemedText>
              <View style={styles.switchContainer}>
                <ThemedText>Preview</ThemedText>
                <Switch
                  value={previewMode}
                  onValueChange={setPreviewMode}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Size</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.options?.size?.toString() || '200'}
                onChangeText={(text) => {
                  const size = parseInt(text) || 200;
                  setFormData({
                    ...formData,
                    options: { ...formData.options, size },
                  });
                }}
                placeholder="200"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Foreground Color</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.options?.foregroundColor || '#000000'}
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    options: { ...formData.options, foregroundColor: text },
                  })
                }
                placeholder="#000000"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Background Color</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.options?.backgroundColor || '#ffffff'}
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    options: { ...formData.options, backgroundColor: text },
                  })
                }
                placeholder="#ffffff"
              />
            </View>
          </View>

          {previewMode && formData.url && (
            <View style={styles.section}>
              <ThemedText type="subtitle">Preview</ThemedText>
              <View style={styles.previewContainer}>
                <QRCodeGenerator
                  value={formData.url}
                  size={formData.options?.size || 200}
                  options={formData.options}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    color: '#007BFF',
    fontSize: 16,
  },
  createButton: {
    color: '#007BFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  previewContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
});
