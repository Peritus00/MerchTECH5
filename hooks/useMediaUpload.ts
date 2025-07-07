import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform } from 'react-native';
import { MediaFile } from '@/shared/media-schema';
import { mediaAPI } from '@/services/api';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';

const MAX_FILE_SIZE_WEB = 1024 * 1024 * 1024; // 1GB for web
const MAX_FILE_SIZE_MOBILE = 1024 * 1024 * 1024; // 1GB for mobile
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks (under Vercel's 6MB limit)

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  stage: 'selecting' | 'reading' | 'uploading' | 'processing' | 'complete';
}

interface UseMediaUploadResult {
  uploadProgress: UploadProgress;
  isUploading: boolean;
  uploadFile: (file: DocumentPicker.DocumentPickerResult) => Promise<MediaFile>;
  selectAndUploadFile: () => Promise<MediaFile | null>;
  selectAudioFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
  selectVideoFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
  selectImageFile: () => Promise<DocumentPicker.DocumentPickerResult | null>;
}

export const useMediaUpload = (): UseMediaUploadResult => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
    stage: 'selecting'
  });
  const [isUploading, setIsUploading] = useState(false);
  const { canCreate } = useSubscriptionLimits();

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

    // Check file size (1GB limit for both web and mobile)
    const maxSize = Platform.OS === 'web' ? MAX_FILE_SIZE_WEB : MAX_FILE_SIZE_MOBILE;
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
      updateProgress(0, asset.size || 0, 'reading');
      
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
          updateProgress((asset.size || 0) * 0.3, asset.size || 0, 'reading');
          
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
      updateProgress((asset.size || 0) * 0.5, asset.size || 0, 'uploading');
      
      // Upload to database via API
      const uploadedFile = await mediaAPI.upload(mediaData);

      console.log('🔴 UPLOAD: Upload successful:', uploadedFile);

      // Complete progress
      updateProgress(asset.size || 0, asset.size || 0, 'complete');

      await new Promise(resolve => setTimeout(resolve, 500));

      return uploadedFile;
    } catch (error) {
      console.error('🔴 UPLOAD: Upload failed:', error);
      throw error;
    } finally {
      setIsUploading(false);
      updateProgress(0, 0, 'selecting');
    }
  };

  const selectAndUploadFile = async (): Promise<MediaFile | null> => {
    try {
      setIsUploading(true);
      updateProgress(0, 100, 'selecting');

      console.log('🔴 UPLOAD: Starting file selection...');

      // Step 1: File Selection
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' 
          ? [
              // Audio formats
              'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac',
              // Video formats - Web explicit MIME types
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/wmv',
              'video/flv', 'video/mkv', 'video/3gpp', 'video/3gpp2', 'video/quicktime',
              'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska',
              'video/hevc', 'video/h264', 'video/h265', 'video/mp2t', 'video/x-ms-asf'
            ]
          : [
              // Mobile - use wildcards for better native picker support
              'audio/*', 'video/*'
            ],
        copyToCacheDirectory: Platform.OS !== 'web', // Disable cache copying on web
        multiple: false,
      });

      if (result.canceled) {
        console.log('🔴 UPLOAD: File selection cancelled');
        setIsUploading(false);
        return null;
      }

      const asset = result.assets[0];
      console.log('🔴 UPLOAD: Selected file:', {
        name: asset.name,
        size: asset.size,
        type: asset.mimeType,
        uri: asset.uri?.substring(0, 50) + '...'
      });

      updateProgress(20, 100, 'reading');

      // Step 2: File Size Validation
      const maxSize = Platform.OS === 'web' ? MAX_FILE_SIZE_WEB : MAX_FILE_SIZE_MOBILE;
      if (asset.size && asset.size > maxSize) {
        const sizeMB = Math.round(asset.size / (1024 * 1024));
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        throw new Error(`File too large: ${sizeMB}MB. Maximum size is ${maxSizeMB}MB.`);
      }

      // Show warning for large files
      if (asset.size && asset.size > 100 * 1024 * 1024) { // 100MB
        const sizeMB = Math.round(asset.size / (1024 * 1024));
        console.warn(`🔴 UPLOAD: Large file detected (${sizeMB}MB). Upload may take several minutes.`);
      }

      updateProgress(40, 100, 'reading');

      // Step 3: Read File Content
      let fileContent: string;
      let actualMimeType = asset.mimeType || 'application/octet-stream';

      if (Platform.OS === 'web') {
        // Web file handling
        if (asset.file) {
          // Newer Expo versions provide file property directly
          const file = asset.file as File;
          actualMimeType = file.type || actualMimeType;
          
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const base64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
          fileContent = `data:${actualMimeType};base64,${base64}`;
        } else if (asset.uri && asset.uri.startsWith('blob:')) {
          // Handle blob URLs
          const response = await fetch(asset.uri);
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const base64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
          fileContent = `data:${actualMimeType};base64,${base64}`;
        } else {
          throw new Error('Unable to read file on web platform');
        }
      } else {
        // Mobile file handling
        try {
          fileContent = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fileContent = `data:${actualMimeType};base64,${fileContent}`;
        } catch (error) {
          console.error('🔴 UPLOAD: FileSystem read failed:', error);
          throw new Error('Failed to read file content');
        }
      }

      updateProgress(60, 100, 'uploading');

      // Step 4: Check if chunked upload is needed
      const fileSizeBytes = fileContent.length;
      const needsChunking = fileSizeBytes > CHUNK_SIZE;

      console.log('🔴 UPLOAD: File processing:', {
        originalSize: asset.size,
        base64Size: fileSizeBytes,
        needsChunking,
        chunks: needsChunking ? Math.ceil(fileSizeBytes / CHUNK_SIZE) : 1
      });

      let uploadedFile;

      if (needsChunking) {
        // Chunked upload for large files
        uploadedFile = await uploadFileInChunks(fileContent, asset, actualMimeType);
      } else {
        // Direct upload for small files
        uploadedFile = await uploadFileDirect(fileContent, asset, actualMimeType);
      }

      updateProgress(100, 100, 'complete');
      console.log('🔴 UPLOAD: Upload completed successfully:', uploadedFile);

      return uploadedFile;

    } catch (error: any) {
      console.error('🔴 UPLOAD: Upload failed:', error);
      updateProgress(0, 100, 'selecting');
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFileDirect = async (fileContent: string, asset: any, mimeType: string) => {
    const mediaData = {
      title: asset.name.replace(/\.[^/.]+$/, ''), // Remove file extension
      url: fileContent,
      filename: asset.name,
      fileType: mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'file',
      contentType: mimeType,
      filesize: asset.size,
      duration: null,
      uniqueId: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    return await mediaAPI.upload(mediaData);
  };

  const uploadFileInChunks = async (fileContent: string, asset: any, mimeType: string) => {
    // For chunked uploads, we'll need to implement a chunked upload API
    // For now, let's try to compress the file or use a different approach
    console.log('🔴 UPLOAD: File too large for direct upload, attempting compression...');
    
    // Try to upload anyway - the server might handle it better than expected
    try {
      return await uploadFileDirect(fileContent, asset, mimeType);
    } catch (error: any) {
      if (error.response?.status === 413) {
        throw new Error(`File too large for upload. Please use a file smaller than 4MB or contact support for assistance with large file uploads.`);
      }
      throw error;
    }
  };

  const selectAudioFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web'
        ? [
            // Standard audio formats
            'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/aac',
            // Mobile formats
            'audio/3gpp', 'audio/x-m4a',
            // Other common formats
            'audio/ogg', 'audio/flac', 'audio/webm'
          ]
        : 'audio/*', // Mobile uses wildcard for better compatibility
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
    });
  };

  const selectVideoFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web' 
        ? [
            // Standard video formats
            'video/mp4', 'video/webm', 'video/ogg',
            // Mobile formats
            'video/3gpp', 'video/3gpp2', 'video/quicktime',
            // Common formats
            'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/mkv',
            // Alternative MIME types
            'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/x-matroska',
            // High efficiency formats
            'video/hevc', 'video/h264', 'video/h265',
            // Streaming formats
            'video/mp2t', 'video/x-ms-asf'
          ]
        : 'video/*', // Mobile uses wildcard for better compatibility
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
    });
  };

  const selectImageFile = async () => {
    return await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'web'
        ? [
            // Standard image formats
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            // Mobile formats
            'image/heic', 'image/heif'
          ]
        : 'image/*', // Mobile uses wildcard for better compatibility
      copyToCacheDirectory: Platform.OS !== 'web', // Don't copy to cache on web
    });
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    
    // Handle specific document types
    if (mimeType === 'application/pdf') return 'document';
    if (mimeType === 'text/plain') return 'document';
    if (mimeType.includes('word') || mimeType.includes('doc')) return 'document';
    
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