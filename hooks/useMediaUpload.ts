import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform } from 'react-native';
import { MediaFile } from '@/shared/media-schema';
import { mediaAPI } from '@/services/api';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UseMediaUploadResult {
  uploadProgress: UploadProgress | null;
  isUploading: boolean;
  uploadFile: (file: DocumentPicker.DocumentPickerResult) => Promise<MediaFile>;
  selectAndUploadFile: () => Promise<MediaFile | null>;
  selectAudioFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
  selectVideoFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
  selectImageFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
}

export const useMediaUpload = (): UseMediaUploadResult => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { canCreate } = useSubscriptionLimits();

  const uploadFile = async (file: DocumentPicker.DocumentPickerResult): Promise<MediaFile> => {
    if (file.canceled || !file.assets || file.assets.length === 0) {
      throw new Error('No file selected');
    }

    // Check subscription limits before uploading
    const canUpload = canCreate('media');
    if (!canUpload.allowed) {
      Alert.alert(
        'Upload Limit Reached',
        canUpload.message,
        [{ text: 'OK' }]
      );
      throw new Error(canUpload.message);
    }

    const asset = file.assets[0];
    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: asset.size || 0, percentage: 0 });

    // Check file size (limit to 1GB)
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (asset.size && asset.size > maxSize) {
      throw new Error(`File too large. Maximum size is 1GB, but your file is ${Math.round((asset.size / 1024 / 1024) * 100) / 100}MB`);
    }

    try {
      // Simulate upload progress
      for (let i = 0; i <= 90; i += 10) {
        setUploadProgress({
          loaded: (asset.size || 0) * (i / 100),
          total: asset.size || 0,
          percentage: i,
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      let fileBase64 = '';
      
      // Handle file reading differently for web vs mobile
      if (Platform.OS === 'web') {
        // For web, use the File API
        try {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          
          // Convert blob to base64
          const reader = new FileReader();
          fileBase64 = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Extract base64 data from data URL
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Web file reading failed:', error);
          throw new Error('Failed to read file on web');
        }
      } else {
        // For mobile, use FileSystem
        try {
          fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (error) {
          console.error('Mobile file reading failed:', error);
          throw new Error('Failed to read file on mobile');
        }
      }

      // Prepare media data for API
      const mediaData = {
        title: asset.name || 'Untitled',
        filePath: `data:${asset.mimeType || 'application/octet-stream'};base64,${fileBase64}`,
        url: `data:${asset.mimeType || 'application/octet-stream'};base64,${fileBase64}`,
        filename: asset.name,
        fileType: getFileType(asset.mimeType || ''),
        contentType: asset.mimeType,
        filesize: asset.size,
        duration: null, // Could be extracted for audio/video files if needed
        uniqueId: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      console.log('🔴 UPLOAD: Uploading media to database:', {
        title: mediaData.title,
        filename: mediaData.filename,
        fileType: mediaData.fileType,
        contentType: mediaData.contentType,
        filesize: mediaData.filesize,
        platform: Platform.OS,
        dataUrlLength: mediaData.url.length
      });

      // Upload to database via API
      const uploadedFile = await mediaAPI.upload(mediaData);

      console.log('🔴 UPLOAD: Upload successful:', uploadedFile);

      // Complete progress
      setUploadProgress({
        loaded: asset.size || 0,
        total: asset.size || 0,
        percentage: 100,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      return uploadedFile;
    } catch (error) {
      console.error('🔴 UPLOAD: Upload failed:', error);
      throw error;
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const selectAndUploadFile = async (): Promise<MediaFile | null> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        return await uploadFile(result);
      }
      return null;
    } catch (error) {
      console.error('Error selecting/uploading file:', error);
      throw error;
    }
  };

  const selectAudioFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
  };

  const selectVideoFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
    });
  };

  const selectImageFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    return 'other';
  };

  return {
    uploadProgress,
    isUploading,
    uploadFile,
    selectAndUploadFile,
    selectAudioFile,
    selectVideoFile,
    selectImageFile,
  };
};