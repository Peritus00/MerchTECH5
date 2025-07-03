import { Platform } from 'react-native';
import { api } from './api';

class UploadService {
  async uploadImage(uri: string): Promise<{ imageUrl: string }> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('file', blob, `photo.${blob.type.split('/')[1]}`);
    } else {
      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      formData.append('file', {
        uri,
        name: `photo.${fileType}`,
        type: `image/${fileType}`,
      } as any);
    }

    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return { imageUrl: response.data.fileUrl };
  }
}

export const uploadService = new UploadService(); 