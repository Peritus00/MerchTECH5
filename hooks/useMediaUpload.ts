import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform } from 'react-native';
import { MediaFile } from '@/shared/media-schema';
import { mediaAPI } from '@/services/api';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';
import { useUpload } from '@/contexts/UploadContext';
import { useQueryClient } from '@tanstack/react-query';

const MAX_FILE_SIZE_WEB = 1024 * 1024 * 1024; // 1GB for web
const MAX_FILE_SIZE_MOBILE = 200 * 1024 * 1024; // 200MB for mobile
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks (under Vercel's 6MB limit)

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  stage: 'selecting' | 'reading' | 'uploading' | 'processing' | 'complete';
}

interface UseMediaUploadResult {
  uploadFile: (fileUri: string, fileType: string, fileName: string) => Promise<MediaFile | null>;
  selectAndUploadFile: () => Promise<MediaFile | null>;
}

export const useMediaUpload = (): UseMediaUploadResult => {
  const { setUploadProgress, setIsUploading } = useUpload();
  const { canCreate } = useSubscriptionLimits();
  const queryClient = useQueryClient();

  const updateProgress = (loaded: number, total: number, stage: UploadProgress['stage']) => {
    const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
    setUploadProgress({ loaded, total, percentage, stage });
  };

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
    updateProgress(0, asset.size || 0, 'reading');

    const maxSize = Platform.OS === 'web' ? MAX_FILE_SIZE_WEB : MAX_FILE_SIZE_MOBILE;
    if (asset.size && asset.size > maxSize) {
      const sizeMB = Math.round((asset.size / 1024 / 1024) * 100) / 100;
      const maxSizeMB = Math.round((maxSize / 1024 / 1024) * 100) / 100;
      throw new Error(`File too large. Maximum size is ${maxSizeMB}MB, but your file is ${sizeMB}MB.`);
    }

    try {
      updateProgress(0, asset.size || 0, 'uploading');

      let fileToUpload: File;
      
      if (Platform.OS === 'web') {
        // Web platform - convert URI to File object
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], asset.name, { type: asset.mimeType });
      } else {
        // Mobile platforms (iOS/Android) - use URI directly
        // Create a File-like object that works with React Native
        fileToUpload = {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream'
        } as any;
      }

      const uploadResult = await mediaAPI.uploadFile(fileToUpload, (progress) => {
        updateProgress(progress, 100, 'uploading');
      });

      updateProgress(100, 100, 'processing');

      const mediaData = {
        title: asset.name || 'Untitled',
        url: uploadResult.url,
        proxy_url: uploadResult.proxy_url,
        key: uploadResult.key,
        filename: asset.name,
        fileType: getFileType(asset.mimeType || ''),
        contentType: asset.mimeType,
        filesize: asset.size,
      };
      
      const uploadedFile = await mediaAPI.create(mediaData);

      console.log('🔴 UPLOAD: Upload successful:', uploadedFile);

      await queryClient.invalidateQueries({ queryKey: ['media'] });
      console.log('✅ invalidated media query');

      updateProgress(100, 100, 'complete');

      await new Promise(resolve => setTimeout(resolve, 500));

      return uploadedFile;
    } catch (error) {
      console.error('🔴 UPLOAD: Upload failed:', error);
      throw error;
    } finally {
      // Hide the indicator after a short delay
      setTimeout(() => {
        setIsUploading(false);
        updateProgress(0, 0, 'selecting');
      }, 2000);
    }
  };

  const selectAndUploadFile = async (): Promise<MediaFile | null> => {
    try {
      console.log('🔴 UPLOAD: Starting file selection...');
      console.log('🔴 UPLOAD: Platform detected:', Platform.OS);
      setUploadProgress({ loaded: 0, total: 0, percentage: 0, stage: 'selecting' });

      // Configure document picker for different platforms
      const documentPickerOptions = {
        type: Platform.OS === 'web' 
          ? [
              'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/wmv',
              'video/flv', 'video/mkv', 'video/3gpp', 'video/3gp2', 'video/quicktime',
              'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska',
              'video/mp2t', 'video/x-ms-asf', 'video/x-m4v', 'video/x-ms-wmx',
              'video/x-ms-wvx', 'video/x-ms-wm', 'video/x-ms-wmp'
            ]
          : [
              'audio/*', 'video/*',
              'video/3gpp', 'video/3gp2', 'video/mp4', 'video/webm', 'video/ogg',
              'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/mkv',
              'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv',
              'video/x-matroska', 'video/mp2t', 'video/x-ms-asf', 'video/x-m4v',
              'video/x-ms-wmx', 'video/x-ms-wvx', 'video/x-ms-wm', 'video/x-ms-wmp'
            ],
        copyToCacheDirectory: Platform.OS !== 'web',
        multiple: false,
      };

      console.log('🔴 UPLOAD: DocumentPicker options:', documentPickerOptions);

      const result = await DocumentPicker.getDocumentAsync(documentPickerOptions);
      
      if (result.canceled) {
        console.log('🔴 UPLOAD: File selection canceled');
        setIsUploading(false);
        return null;
      }

      const asset = result.assets[0];
      console.log('🔴 UPLOAD: Selected file:', {
        name: asset.name,
        size: asset.size,
        type: asset.mimeType,
        uri: asset.uri?.substring(0, 50) + '...',
        platform: Platform.OS
      });

      // Validate file size
      const maxSize = Platform.OS === 'web' ? MAX_FILE_SIZE_WEB : MAX_FILE_SIZE_MOBILE;
      if (asset.size && asset.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        const fileSizeMB = Math.round(asset.size / (1024 * 1024));
        throw new Error(`File too large: ${fileSizeMB}MB. Maximum allowed: ${maxSizeMB}MB`);
      }

      // Show file size warning for large files
      if (asset.size && asset.size > 100 * 1024 * 1024) { // 100MB
        const fileSizeMB = Math.round(asset.size / (1024 * 1024));
        console.log(`⚠️ UPLOAD: Large file detected (${fileSizeMB}MB). This may take several minutes to upload.`);
      }

      return await uploadFile(result);
    } catch (error) {
      console.error('🔴 MEDIA: Upload error:', error);
      console.error('🔴 MEDIA: Error details:', {
        message: error.message,
        code: error.code,
        platform: Platform.OS,
        stack: error.stack
      });
      setIsUploading(false);
      throw error;
    }
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'unknown';
  };

  return {
    uploadFile,
    selectAndUploadFile,
  };
};