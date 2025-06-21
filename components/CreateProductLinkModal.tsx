
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ProductLink } from '@/shared/media-schema';

interface CreateProductLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (linkData: {
    title: string;
    url: string;
    description?: string;
    imageUrl?: string;
  }) => void;
  initialData?: ProductLink | null;
  playlistName: string;
}

const CreateProductLinkModal: React.FC<CreateProductLinkModalProps> = ({
  visible,
  onClose,
  onSave,
  initialData,
  playlistName,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setUrl(initialData.url);
      setDescription(initialData.description || '');
      setImageUrl(initialData.imageUrl || '');
    } else {
      resetForm();
    }
  }, [initialData, visible]);

  const resetForm = () => {
    setTitle('');
    setUrl('');
    setDescription('');
    setImageUrl('');
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!title.trim()) {
      newErrors.title = 'Product title is required';
    }

    if (!url.trim()) {
      newErrors.url = 'Product URL is required';
    } else {
      try {
        new URL(url);
      } catch {
        newErrors.url = 'Please enter a valid URL';
      }
    }

    if (imageUrl.trim()) {
      try {
        new URL(imageUrl);
      } catch {
        newErrors.imageUrl = 'Please enter a valid image URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    onSave({
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    });

    if (!initialData) {
      resetForm();
    }
  };

  const handleClose = () => {
    if (!initialData) {
      resetForm();
    }
    onClose();
  };

  const isEditing = !!initialData;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit Product Link' : 'Add Product Link'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveButton}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Playlist Info */}
          <View style={styles.playlistInfo}>
            <MaterialIcons name="queue-music" size={16} color="#3b82f6" />
            <Text style={styles.playlistName} numberOfLines={1}>
              {playlistName}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Product Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Product Title *</Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Limited Edition T-Shirt"
                placeholderTextColor="#9ca3af"
                maxLength={100}
              />
              {errors.title && (
                <Text style={styles.errorText}>{errors.title}</Text>
              )}
            </View>

            {/* Product URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Product URL *</Text>
              <TextInput
                style={[styles.input, errors.url && styles.inputError]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://example.com/product"
                placeholderTextColor="#9ca3af"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.url && (
                <Text style={styles.errorText}>{errors.url}</Text>
              )}
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description of the product"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>

            {/* Image URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Image URL</Text>
              <TextInput
                style={[styles.input, errors.imageUrl && styles.inputError]}
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor="#9ca3af"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.imageUrl && (
                <Text style={styles.errorText}>{errors.imageUrl}</Text>
              )}
            </View>

            {/* Tips */}
            <View style={styles.tipBox}>
              <MaterialIcons name="lightbulb" size={16} color="#f59e0b" />
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Tips for better results:</Text>
                <Text style={styles.tipText}>
                  • Use descriptive titles that clearly identify the product
                </Text>
                <Text style={styles.tipText}>
                  • Ensure URLs are working and lead directly to the product
                </Text>
                <Text style={styles.tipText}>
                  • Add images to make links more appealing and clickable
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  playlistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  playlistName: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginTop: 4,
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 16,
    marginBottom: 2,
  },
});

export default CreateProductLinkModal;
