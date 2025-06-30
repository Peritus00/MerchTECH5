import { Platform } from 'react-native';
import { api } from './api';

class UploadService {
  async uploadImage(uri: string): Promise<{ imageUrl: string }> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, `photo.${blob.type.split('/')[1]}`);
    } else {
      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      formData.append('image', {
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

    return response.data;
  }
}

export const uploadService = new UploadService(); 