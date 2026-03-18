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
import { mediaAPI, slideshowsAPI } from '@/services/api';
import AudioMediaPicker from './AudioMediaPicker';

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
  const [showAudioPicker, setShowAudioPicker] = useState(false);

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
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && slideshow) {
        for (let i = 0; i < result.assets.length; i++) {
          setUploadingIndex(i);
          const asset = result.assets[i] as any;
          let filePayload;
          if (asset.file instanceof File) {
            // Web: expo-image-picker provides a proper File with correct MIME type
            filePayload = asset.file;
          } else {
            const mimeType = asset.mimeType || 'image/jpeg';
            const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
            const name = asset.fileName || `image_${Date.now()}.${extension}`;
            filePayload = { uri: asset.uri, name, type: mimeType };
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
      console.log('📤 SLIDESHOW uploadImage: Starting upload for slideshow', slideshow.id);
      console.log('📤 SLIDESHOW uploadImage: filePayload', {
        name: filePayload.name,
        type: filePayload.type,
        hasUri: !!filePayload.uri,
        isFile: filePayload instanceof File
      });
      
      // Upload file directly to slideshow endpoint
      const response = await slideshowsAPI.addImage(slideshow.id, filePayload, '', displayOrder);
      console.log('📤 SLIDESHOW uploadImage: Image uploaded successfully', response);
      console.log('📤 SLIDESHOW uploadImage: Server response keys:', Object.keys(response));
      
      // Backend returns { image: { id, slideshowId, imageUrl, ... } }
      const newImageFromServer = response.image || response;
      console.log('📤 SLIDESHOW uploadImage: Extracted image object:', newImageFromServer);
      console.log('📤 SLIDESHOW uploadImage: imageId:', newImageFromServer.id);
      console.log('📤 SLIDESHOW uploadImage: imageUrl:', newImageFromServer.imageUrl);

      // Map server response to frontend format
      const newImage = {
        id: newImageFromServer.id,
        slideshowId: newImageFromServer.slideshowId || slideshow.id,
        imageUrl: newImageFromServer.imageUrl || newImageFromServer.url,
        caption: newImageFromServer.caption || '',
        displayOrder: newImageFromServer.displayOrder || newImageFromServer.position || images.length + 1
      };
      
      console.log('📤 SLIDESHOW uploadImage: Mapped image object:', newImage);

      // Update local state with new image
      const updatedImages = [...images, newImage].sort((a, b) => a.displayOrder - b.displayOrder);
      setImages(updatedImages);
      
      // Update parent component with updated slideshow
      const updatedSlideshow = {
        ...slideshow,
        images: updatedImages
      };
      onImagesUpdated(updatedSlideshow);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  const handleDeleteImage = async (imageId: number | string | undefined) => {
    console.log('🗑️ handleDeleteImage called for', imageId, 'type:', typeof imageId);
    
    // Validate imageId
    if (imageId === undefined || imageId === null || imageId === 'undefined') {
      console.error('🗑️ Invalid imageId provided:', imageId);
      Alert.alert('Error', 'Invalid image ID');
      return;
    }
    
    // Convert to number if it's a string
    const numericId = typeof imageId === 'string' ? parseInt(imageId, 10) : imageId;
    if (isNaN(numericId)) {
      console.error('🗑️ imageId is not a valid number:', imageId);
      Alert.alert('Error', 'Invalid image ID');
      return;
    }
    
    if (!slideshow) {
      console.error('🗑️ No slideshow available for deletion');
      Alert.alert('Error', 'No slideshow available');
      return;
    }
    
    const slideshowId = slideshow.id;
    
    const confirmDelete = async () => {
      console.log('🗑️ Confirmed delete for imageId', numericId, 'slideshow', slideshowId);
      try {
        const response = await slideshowsAPI.deleteImage(slideshowId, numericId);
        // API returns { slideshow: { images: [...] } }
        const updatedSlideshow = response.slideshow || response;
        console.log('🗑️ deleteImage API success, fresh images length', updatedSlideshow.images?.length || 0);
        if (updatedSlideshow.images) {
          setImages(updatedSlideshow.images);
          onImagesUpdated(updatedSlideshow);
        }
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

  const handleAddAudio = () => {
    console.log('🎵 SLIDESHOW handleAddAudio: Opening audio media picker - NEW VERSION');
    console.log('🎵 SLIDESHOW handleAddAudio: showAudioPicker state:', showAudioPicker);
    setShowAudioPicker(true);
    console.log('🎵 SLIDESHOW handleAddAudio: setShowAudioPicker(true) called');
  };

  const handleAudioSelected = async (audioFile: any) => {
    try {
      console.log('🎵 SLIDESHOW handleAudioSelected: Audio file selected from media', audioFile);
      setAudioUploading(true);

      // Use the existing audio file's URL directly
      const audioUrl = audioFile.url || audioFile.s3_key;
      console.log('🎵 SLIDESHOW handleAudioSelected: Using audio URL:', audioUrl);

      const updatedSlideshow = await slideshowsAPI.updateAudio(slideshow!.id, audioUrl);
      console.log('🎵 SLIDESHOW handleAudioSelected: Slideshow updated', updatedSlideshow);

      // Validate that we got a proper slideshow object back
      if (!updatedSlideshow || !updatedSlideshow.id) {
        console.error('🎵 SLIDESHOW handleAudioSelected: Invalid slideshow response:', updatedSlideshow);
        Alert.alert('Error', 'Failed to update slideshow - invalid response from server');
        return;
      }

      // Ensure the slideshow has the images array
      const slideshowWithImages = {
        ...updatedSlideshow,
        images: updatedSlideshow.images || images
      };

      onImagesUpdated(slideshowWithImages);
      Alert.alert('Success', 'Audio added to slideshow');
    } catch (error) {
      console.error('🎵 SLIDESHOW handleAudioSelected: Error:', error);
      Alert.alert('Error', 'Failed to add audio to slideshow');
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
          {/* Debug audio URL */}
          {console.log('🎵 SLIDESHOW_MANAGER: slideshow.audioUrl:', slideshow.audioUrl, 'Type:', typeof slideshow.audioUrl)}
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
                  <Image source={{ 
                    uri: image.imageUrl && image.imageUrl.includes('amazonaws.com') 
                      ? `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/slideshow-images/${image.id}/stream`
                      : image.imageUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='
                  }} style={styles.imagePreview} />
                  
                  <View style={styles.imageActions}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderText}>{index + 1}</Text>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.deleteImageButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        console.log('🗑️ Delete button pressed for image', image.id, 'type:', typeof image.id);
                        if (!image.id) {
                          console.error('🗑️ Image has no ID:', image);
                          Alert.alert('Error', 'Image ID is missing');
                          return;
                        }
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

      {/* Audio Media Picker Modal */}
      <AudioMediaPicker
        visible={showAudioPicker}
        onClose={() => setShowAudioPicker(false)}
        onSelect={handleAudioSelected}
        currentAudioUrl={slideshow.audioUrl}
      />
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
