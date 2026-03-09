/**
 * @deprecated Use mediaAPI.uploadFile from @/services/api instead.
 * This service previously used the legacy POST /upload endpoint.
 * It now delegates to the presigned-S3 flow for consistency.
 */
import { Platform } from 'react-native';
import { mediaAPI } from './api';

class UploadService {
  async uploadImage(uri: string): Promise<{ imageUrl: string }> {
    let filePayload: File | { uri: string; name: string; type: string };

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = blob.type?.split('/')[1] || 'jpg';
      filePayload = new File([blob], `photo.${ext}`, { type: blob.type || 'image/jpeg' });
    } else {
      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      filePayload = {
        uri,
        name: `photo.${fileType}`,
        type: `image/${fileType}`,
      } as any;
    }

    const media = await mediaAPI.uploadFile(filePayload);
    return { imageUrl: media?.url ?? '' };
  }
}

export const uploadService = new UploadService(); 