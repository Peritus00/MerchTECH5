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
  const { 
    setUploadProgress, 
    setIsUploading, 
    setUploadError,
    setCurrentFileName,
    setEstimatedTimeRemaining,
    showUploadError,
    showUploadSuccess,
    showUploadWarning,
  } = useUpload();
  const { canCreate } = useSubscriptionLimits();
  const queryClient = useQueryClient();

  const updateProgress = (loaded: number, total: number, stage: UploadProgress['stage']) => {
    const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
    setUploadProgress({ loaded, total, percentage, stage });
    
    // Calculate estimated time remaining
    if (stage === 'uploading' && loaded > 0 && total > 0) {
      const uploadSpeed = loaded / (Date.now() - uploadStartTime) * 1000; // bytes per second
      const remainingBytes = total - loaded;
      const estimatedSeconds = Math.round(remainingBytes / uploadSpeed);
      setEstimatedTimeRemaining(estimatedSeconds);
    }
  };

  let uploadStartTime = Date.now();

  const uploadFile = async (file: DocumentPicker.DocumentPickerResult): Promise<MediaFile> => {
    if (file.canceled || !file.assets || file.assets.length === 0) {
      throw new Error('No file selected');
    }

    // Check subscription limits before uploading
    const canUpload = canCreate('media');
    if (!canUpload.allowed) {
      showUploadError({ 
        message: canUpload.message || 'Upload limit reached',
        code: 'SUBSCRIPTION_LIMIT'
      });
      throw new Error(canUpload.message);
    }

    const asset = file.assets[0];
    uploadStartTime = Date.now();
    setIsUploading(true);
    setUploadError(null);
    setCurrentFileName(asset.name);
    setEstimatedTimeRemaining(null);
    updateProgress(0, asset.size || 0, 'reading');

    const maxSize = Platform.OS === 'web' ? MAX_FILE_SIZE_WEB : MAX_FILE_SIZE_MOBILE;
    if (asset.size && asset.size > maxSize) {
      const sizeMB = Math.round((asset.size / 1024 / 1024) * 100) / 100;
      const maxSizeMB = Math.round((maxSize / 1024 / 1024) * 100) / 100;
      const error = {
        message: `File too large. Maximum size is ${maxSizeMB}MB, but your file is ${sizeMB}MB.`,
        code: 'FILE_TOO_LARGE'
      };
      showUploadError(error, asset.name);
      throw new Error(error.message);
    }

    try {
      updateProgress(0, asset.size || 0, 'uploading');

      let fileToUpload: File;
      
      if (Platform.OS === 'web') {
        // Web platform - prioritize native File object to avoid blob URL truncation issues
        // Check if asset.file exists (native File object exposed by Expo DocumentPicker on web)
        if ((asset as any).file instanceof File) {
          console.log('✅ UPLOAD: Using native File object directly (bypasses blob URL conversion)');
          fileToUpload = (asset as any).file;
        } else if (asset.uri instanceof File) {
          // Fallback: Check if asset.uri is already a File object
          console.log('✅ UPLOAD: Using File object from asset.uri');
          fileToUpload = asset.uri;
        } else {
          // Last resort: Fetch from blob URL with strict validation
          console.warn('⚠️ UPLOAD: Native File object not available, using blob URL fetch (may truncate large files)');
          const response = await fetch(asset.uri);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }
          
          // Use arrayBuffer for better large file handling than blob()
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: asset.mimeType });
          
          // CRITICAL VALIDATION: Fail immediately if blob is significantly smaller than expected
          if (asset.size && blob.size < asset.size * 0.99) {
            const missingMB = ((asset.size - blob.size) / 1024 / 1024).toFixed(2);
            throw new Error(`File appears to be truncated during blob conversion. Expected ${(asset.size / 1024 / 1024).toFixed(2)}MB but only got ${(blob.size / 1024 / 1024).toFixed(2)}MB (missing ${missingMB}MB). This is a browser limitation with blob URLs. Please try: 1) Using a different browser, 2) Uploading from a different device, or 3) Compressing the video file first.`);
          }
          
          // Warn if there's any size mismatch (even small ones)
          if (asset.size && blob.size !== asset.size) {
            const sizeDiffPercent = ((asset.size - blob.size) / asset.size * 100).toFixed(2);
            console.warn('⚠️ UPLOAD: Blob size differs from expected file size', {
              expected: asset.size,
              actual: blob.size,
              difference: asset.size - blob.size,
              differencePercent: `${sizeDiffPercent}%`,
              filename: asset.name
            });
          }
          
          fileToUpload = new File([blob], asset.name, { type: asset.mimeType });
        }
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
        s3_key: uploadResult.key,  // Fixed: use s3_key instead of key
        filename: asset.name,
        fileType: getFileType(asset.mimeType || ''),
        contentType: asset.mimeType,
        // Use actual uploaded file size from S3 instead of original file size
        // This prevents validation failures if the file was truncated during upload
        filesize: uploadResult.filesize || asset.size,
      };
      
      const uploadedFile = await mediaAPI.create(mediaData);

      console.log('🔴 UPLOAD: Upload successful:', uploadedFile);

      await queryClient.invalidateQueries({ queryKey: ['media'] });
      console.log('✅ invalidated media query');

      updateProgress(100, 100, 'complete');
      
      // Show success notification
      showUploadSuccess(asset.name);

      await new Promise(resolve => setTimeout(resolve, 500));

      return uploadedFile;
    } catch (error: any) {
      console.error('🔴 UPLOAD: Upload failed:', error);
      
      // Parse error response and show appropriate error message
      let errorMessage = 'Upload failed. Please try again.';
      let errorCode = 'UNKNOWN_ERROR';
      
      if (error.response?.data) {
        errorMessage = error.response.data.error || error.response.data.message || errorMessage;
        errorCode = error.response.data.code || errorCode;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Show error notification
      showUploadError({
        message: errorMessage,
        code: errorCode,
        details: error.response?.data?.details
      }, asset.name);
      
      throw error;
    } finally {
      // Hide the indicator after a short delay
      setTimeout(() => {
        setIsUploading(false);
        setCurrentFileName(null);
        setEstimatedTimeRemaining(null);
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
        showUploadWarning(
          `This is a large file (${fileSizeMB}MB). Upload may take several minutes. Please keep the app open during upload.`,
          asset.name
        );
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