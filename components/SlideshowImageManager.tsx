
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface SlideshowImage {
  id: number;
  slideshowId: number;
  imageUrl: string;
  caption?: string;
  displayOrder: number;
}

interface Slideshow {
  id: number;
  name: string;
  description?: string;
  uniqueId: string;
  autoplayInterval: number;
  transition: string;
  audioUrl?: string;
  requiresActivationCode: boolean;
  createdAt: string;
  images: SlideshowImage[];
}

interface SlideshowImageManagerProps {
  visible: boolean;
  slideshow: Slideshow | null;
  onClose: () => void;
  onImagesUpdated: (updatedSlideshow: Slideshow) => void;
}

const SlideshowImageManager: React.FC<SlideshowImageManagerProps> = ({
  visible,
  slideshow,
  onClose,
  onImagesUpdated,
}) => {
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (slideshow) {
      setImages(slideshow.images.sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }, [slideshow]);

  const handleAddImages = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permission required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && slideshow) {
        for (let i = 0; i < result.assets.length; i++) {
          setUploadingIndex(i);
          await uploadImage(result.assets[i].uri, images.length + i);
        }
        setUploadingIndex(null);
      }
    } catch (error) {
      console.error('Error selecting images:', error);
      Alert.alert('Error', 'Failed to select images');
      setUploadingIndex(null);
    }
  };

  const uploadImage = async (imageUri: string, displayOrder: number) => {
    if (!slideshow) return;

    try {
      // Mock upload - in real app, upload to your server
      const newImage: SlideshowImage = {
        id: Date.now() + Math.random(),
        slideshowId: slideshow.id,
        imageUrl: imageUri,
        caption: '',
        displayOrder,
      };

      setImages(prev => [...prev, newImage].sort((a, b) => a.displayOrder - b.displayOrder));
      
      // Update the slideshow with new images
      const updatedSlideshow = {
        ...slideshow,
        images: [...images, newImage],
      };
      onImagesUpdated(updatedSlideshow);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedImages = images.filter(img => img.id !== imageId);
            setImages(updatedImages);
            
            if (slideshow) {
              const updatedSlideshow = {
                ...slideshow,
                images: updatedImages,
              };
              onImagesUpdated(updatedSlideshow);
            }
          },
        },
      ]
    );
  };

  const handleUpdateCaption = (imageId: number, caption: string) => {
    const updatedImages = images.map(img => 
      img.id === imageId ? { ...img, caption } : img
    );
    setImages(updatedImages);
    
    if (slideshow) {
      const updatedSlideshow = {
        ...slideshow,
        images: updatedImages,
      };
      onImagesUpdated(updatedSlideshow);
    }
  };

  if (!slideshow) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Images</Text>
          <TouchableOpacity onPress={handleAddImages}>
            <MaterialIcons name="add-photo-alternate" size={24} color="#3b82f6" />
          </TouchableOpacity>
        </View>

        {/* Slideshow Info */}
        <View style={styles.slideshowInfo}>
          <Text style={styles.slideshowName}>{slideshow.name}</Text>
          <Text style={styles.imageCount}>{images.length} images</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Add Images Button */}
          <TouchableOpacity style={styles.addButton} onPress={handleAddImages}>
            <MaterialIcons name="add-photo-alternate" size={24} color="#3b82f6" />
            <Text style={styles.addButtonText}>Add Images</Text>
          </TouchableOpacity>

          {/* Images Grid */}
          {images.length > 0 ? (
            <View style={styles.imagesGrid}>
              {images.map((image, index) => (
                <View key={image.id} style={styles.imageCard}>
                  <Image source={{ uri: image.imageUrl }} style={styles.imagePreview} />
                  
                  <View style={styles.imageActions}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderText}>{index + 1}</Text>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.deleteImageButton}
                      onPress={() => handleDeleteImage(image.id)}
                    >
                      <MaterialIcons name="delete" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.captionInput}
                    value={image.caption || ''}
                    onChangeText={(text) => handleUpdateCaption(image.id, text)}
                    placeholder="Add caption..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="photo-library" size={64} color="#9ca3af" />
              <Text style={styles.emptyText}>No images yet</Text>
              <Text style={styles.emptySubtext}>
                Add images to create your slideshow presentation
              </Text>
            </View>
          )}

          {/* Upload Progress */}
          {uploadingIndex !== null && (
            <View style={styles.uploadProgress}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.uploadText}>
                Uploading image {uploadingIndex + 1}...
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
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
  slideshowInfo: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  slideshowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  imageCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    paddingVertical: 20,
    marginBottom: 16,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  imagesGrid: {
    gap: 12,
  },
  imageCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  imageActions: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  orderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteImageButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  captionInput: {
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    minHeight: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  uploadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    color: '#3b82f6',
  },
});

export default SlideshowImageManager;
