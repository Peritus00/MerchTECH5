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

    // Check file size (1GB limit for both web and mobile)
    const maxSize = 1024 * 1024 * 1024; // 1GB for both platforms
    if (asset.size && asset.size > maxSize) {
      const sizeMB = Math.round((asset.size / 1024 / 1024) * 100) / 100;
      const maxSizeMB = Math.round((maxSize / 1024 / 1024) * 100) / 100;
      throw new Error(`File too large. Maximum size is ${maxSizeMB}MB, but your file is ${sizeMB}MB. Note: Base64 encoding increases file size by ~33%.`);
    }
    
    // Show warning for large files
    if (asset.size && asset.size > 100 * 1024 * 1024) { // 100MB+
      const sizeMB = Math.round((asset.size / 1024 / 1024) * 100) / 100;
      console.log(`⚠️ Large file upload: ${sizeMB}MB - This may take several minutes to upload`);
      Alert.alert(
        'Large File Upload',
        `You're uploading a ${sizeMB}MB file. This may take several minutes to complete. Please keep the app open during upload.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => { throw new Error('Upload cancelled by user'); } },
          { text: 'Continue', style: 'default' }
        ]
      );
    }

    try {
      // Show initial progress for file preparation
      setUploadProgress({
        loaded: 0,
        total: asset.size || 0,
        percentage: 10,
      });
      
      console.log('🔄 Starting file processing for upload...');

      let fileBase64 = '';
      
      // Handle file reading differently for web vs mobile
      if (Platform.OS === 'web') {
        // For web, handle the file directly from the asset
        try {
          console.log('🔴 WEB UPLOAD: Processing file:', {
            name: asset.name,
            size: asset.size,
            type: asset.mimeType,
            uri: asset.uri?.substring(0, 50) + '...',
            hasFile: !!(asset as any).file
          });

          // On web, the asset might already be a File object or have a file property
          let fileToRead: File;
          
          if ((asset as any).file instanceof File) {
            // If asset has a file property (newer Expo versions)
            fileToRead = (asset as any).file;
            console.log('🔴 WEB UPLOAD: Using asset.file property');
          } else if (typeof window !== 'undefined' && asset.uri) {
            // Try to get the file from the URI if it's a blob URL
            if (asset.uri.startsWith('blob:')) {
              console.log('🔴 WEB UPLOAD: Fetching blob from URI');
              const response = await fetch(asset.uri);
              const blob = await response.blob();
              fileToRead = new File([blob], asset.name || 'upload', { type: asset.mimeType });
            } else {
              throw new Error('Unsupported file URI format');
            }
          } else {
            throw new Error('Could not access file on web');
          }
          
          // Convert file to base64
          const reader = new FileReader();
          fileBase64 = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Extract base64 data from data URL
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = (error) => {
              console.error('FileReader error:', error);
              reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(fileToRead);
          });

          console.log('🔴 WEB UPLOAD: File read successfully, base64 length:', fileBase64.length);
          
          // Update progress after file reading
          setUploadProgress({
            loaded: (asset.size || 0) * 0.3,
            total: asset.size || 0,
            percentage: 30,
          });
          
        } catch (error) {
          console.error('🔴 WEB UPLOAD: File reading failed:', error);
          // Fallback: try to use the URI directly if it's a data URL
          if (asset.uri && asset.uri.startsWith('data:')) {
            console.log('🔴 WEB UPLOAD: Fallback - using data URL directly');
            const base64Part = asset.uri.split(',')[1];
            if (base64Part) {
              fileBase64 = base64Part;
            } else {
              throw new Error('Invalid data URL format');
            }
          } else {
            throw new Error(`Failed to read file on web: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } else {
        // For mobile, use FileSystem
        try {
          fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (error) {
          console.error('Mobile file reading failed:', error);
          // Fallback: try to use the URI directly if it's a data URL
          if (asset.uri && asset.uri.startsWith('data:')) {
            console.log('🔴 MOBILE UPLOAD: Fallback - using data URL directly');
            const base64Part = asset.uri.split(',')[1];
            if (base64Part) {
              fileBase64 = base64Part;
            } else {
              throw new Error('Invalid data URL format');
            }
          } else {
            throw new Error('Failed to read file on mobile');
          }
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

      // Update progress before upload
      setUploadProgress({
        loaded: (asset.size || 0) * 0.5,
        total: asset.size || 0,
        percentage: 50,
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
        copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
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
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
    });
  };

  const selectVideoFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
    });
  };

  const selectImageFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
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