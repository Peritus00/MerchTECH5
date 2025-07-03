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
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { fileUploadAPI, slideshowAPI } from '@/services/api';

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
  const [audioUploading, setAudioUploading] = useState(false);

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
          const asset = result.assets[i] as any;
          let filePayload;
          if (asset.file) {
            // Web returns actual File instance
            filePayload = asset.file;
          } else {
            filePayload = { uri: asset.uri, name: asset.uri.split('/').pop() || `image_${Date.now()}.jpg`, type: 'image/jpeg' };
          }
          await uploadImage(filePayload, images.length + i);
        }
        setUploadingIndex(null);
      }
    } catch (error) {
      console.error('Error selecting images:', error);
      Alert.alert('Error', 'Failed to select images');
      setUploadingIndex(null);
    }
  };

  const uploadImage = async (filePayload: any, displayOrder: number) => {
    if (!slideshow) return;

    try {
      const fileUrl = await fileUploadAPI.upload(filePayload);
      console.log('📤 uploadImage: fileUrl', fileUrl);
      console.log('📤 uploadImage: calling addImage for slideshow', slideshow.id);

      const updatedSlideshow = await slideshowAPI.addImage(slideshow.id, {
        imageUrl: fileUrl,
        displayOrder,
      });

      // Refresh local state from server response
      setImages(updatedSlideshow.images.sort((a, b) => a.displayOrder - b.displayOrder));
      onImagesUpdated(updatedSlideshow);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    console.log('🗑️ handleDeleteImage called for', imageId);
    const confirmDelete = async () => {
      if (!slideshow) return;
      console.log('🗑️ Confirmed delete for', imageId, 'slideshow', slideshow.id);
      try {
        const updated = await slideshowAPI.deleteImage(slideshow.id, imageId);
        console.log('🗑️ deleteImage API success, fresh images length', updated.images.length);
        setImages(updated.images);
        onImagesUpdated(updated);
      } catch (err) {
        console.error('🗑️ Failed to delete image', err);
        Alert.alert('Error', 'Failed to delete image');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this image?')) {
        await confirmDelete();
      } else {
        console.log('🗑️ Delete cancelled (web)');
      }
    } else {
      Alert.alert(
        'Delete Image',
        'Are you sure you want to delete this image?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => console.log('🗑️ Delete cancelled') },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
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

  const handleAddAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: 'audio/*',
        multiple: false,
      });

      if (result.canceled || !slideshow) return;

      const file = result.assets[0];
      setAudioUploading(true);

      const filename = file.name || `audio_${Date.now()}.mp3`;
      const audioUrlServer = await fileUploadAPI.upload({ uri: file.uri, name: filename, type: file.mimeType || 'audio/mpeg' });

      const updatedSlideshow = await slideshowAPI.updateAudio(slideshow.id, audioUrlServer);

      onImagesUpdated(updatedSlideshow);
      Alert.alert('Success', 'Audio added to slideshow');
    } catch (error) {
      console.error('Error selecting audio:', error);
      Alert.alert('Error', 'Failed to select audio');
    } finally {
      setAudioUploading(false);
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
          {slideshow.audioUrl ? (
            <View style={styles.audioInfo}>
              <MaterialIcons name="music-note" size={20} color="#1f2937" />
              <Text style={styles.audioLabel}>Audio attached</Text>
              <TouchableOpacity onPress={() => handleAddAudio()} style={styles.changeAudioButton}>
                <Text style={styles.changeAudioText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addAudioButton} onPress={handleAddAudio} disabled={audioUploading}>
              <MaterialIcons name="music-note" size={24} color="#3b82f6" />
              <Text style={styles.addAudioText}>{audioUploading ? 'Uploading...' : 'Add Background Music'}</Text>
            </TouchableOpacity>
          )}
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
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        console.log('🗑️ Delete button pressed for image', image.id);
                        handleDeleteImage(image.id);
                      }}
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
  addAudioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  addAudioText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  audioInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  audioLabel: {
    fontSize: 14,
    color: '#1f2937',
  },
  changeAudioButton: {
    marginLeft: 8,
  },
  changeAudioText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
});

export default SlideshowImageManager;
