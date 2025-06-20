
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

export function CreateQRModal({ visible, onClose, onQRCreated }: CreateQRModalProps) {
  const [formData, setFormData] = useState<CreateQRCodeData>({
    name: '',
    url: '',
    description: '',
    options: {
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      logo: null,
    },
  });
  const [creating, setCreating] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      Alert.alert('Error', 'Please fill in name and URL fields');
      return;
    }

    setCreating(true);
    try {
      await qrCodeService.createQRCode(formData);
      Alert.alert('Success', 'QR Code created successfully!');
      onQRCreated();
      resetForm();
    } catch (error) {
      Alert.alert('Error', 'Failed to create QR code');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      description: '',
      options: {
        foregroundColor: '#000000',
        backgroundColor: '#FFFFFF',
        logo: null,
      },
    });
    setPreviewMode(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <ThemedText style={styles.cancelButton}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText type="defaultSemiBold">Create QR Code</ThemedText>
          <TouchableOpacity onPress={handleCreate} disabled={creating}>
            <ThemedText style={[styles.createButton, creating && styles.disabled]}>
              {creating ? 'Creating...' : 'Create'}
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

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Description</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Optional description"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle">Customization</ThemedText>
              <View style={styles.previewToggle}>
                <ThemedText style={styles.previewLabel}>Preview</ThemedText>
                <Switch
                  value={previewMode}
                  onValueChange={setPreviewMode}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Foreground Color</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.options?.foregroundColor}
                onChangeText={(text) => setFormData({
                  ...formData,
                  options: { ...formData.options, foregroundColor: text }
                })}
                placeholder="#000000"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Background Color</ThemedText>
              <TextInput
                style={styles.input}
                value={formData.options?.backgroundColor}
                onChangeText={(text) => setFormData({
                  ...formData,
                  options: { ...formData.options, backgroundColor: text }
                })}
                placeholder="#FFFFFF"
                placeholderTextColor="#999"
              />
            </View>
          </View>

          {previewMode && formData.url && (
            <View style={styles.previewSection}>
              <ThemedText type="subtitle">Preview</ThemedText>
              <View style={styles.previewContainer}>
                <QRCodeGenerator
                  value={formData.url}
                  size={200}
                  options={formData.options}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    color: '#007BFF',
  },
  createButton: {
    color: '#007BFF',
    fontWeight: '600',
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLabel: {
    marginRight: 8,
    fontSize: 14,
  },
  previewSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  previewContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
});
