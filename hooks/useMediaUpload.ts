
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { MediaFile } from '@/shared/media-schema';

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

  const uploadFile = async (file: DocumentPicker.DocumentPickerResult): Promise<MediaFile> => {
    if (file.canceled || !file.assets || file.assets.length === 0) {
      throw new Error('No file selected');
    }

    const asset = file.assets[0];
    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: asset.size || 0, percentage: 0 });

    try {
      // Mock upload - replace with actual API call
      const mockFile: MediaFile = {
        id: Math.floor(Math.random() * 1000),
        uniqueId: `media-${Date.now()}`,
        title: asset.name || 'Untitled',
        fileType: getFileType(asset.mimeType || ''),
        filePath: asset.uri,
        url: asset.uri,
        filename: asset.name,
        filesize: asset.size,
        contentType: asset.mimeType,
        createdAt: new Date().toISOString(),
      };

      // Simulate upload progress
      for (let i = 0; i <= 100; i += 10) {
        setUploadProgress({
          loaded: (asset.size || 0) * (i / 100),
          total: asset.size || 0,
          percentage: i,
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return mockFile;
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
