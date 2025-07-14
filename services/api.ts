import axios from 'axios';
import { Product } from '@/shared/product-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/environment';
import { MediaFile } from '@/shared/media-schema';

// Use centralized environment configuration
const API_BASE_URL = env.apiBaseUrl;

console.log('✅ API configured with centralized environment config');
console.log('🔧 Environment API Base URL:', API_BASE_URL);
console.log('🔧 Current hostname:', typeof window !== 'undefined' ? window.location.hostname : 'N/A (not web)');
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
console.log('🔧 EXPO_PUBLIC_NODE_ENV:', process.env.EXPO_PUBLIC_NODE_ENV);
console.log('🔧 TIMESTAMP:', new Date().toISOString(), '- API CONFIG LOADING');

// Force localhost override if needed
let FINAL_API_BASE_URL = API_BASE_URL;

// Check if we're on the production web app first (highest priority)
if (typeof window !== 'undefined' && window.location.hostname === 'app.merchtech.net') {
  FINAL_API_BASE_URL = 'https://merchtech5-production.up.railway.app/api';
  console.log('🚨 CRITICAL: FORCED production API URL for app.merchtech.net:', FINAL_API_BASE_URL);
  console.log('🚨 CRITICAL: This should prevent mixed content errors!');
  console.log('🚨 CRITICAL: Current window.location.hostname:', window.location.hostname);
}
// Then check for localhost development
else if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  FINAL_API_BASE_URL = 'http://192.168.1.70:5001/api';
  console.log('🔧 FORCED localhost API URL for localhost development:', FINAL_API_BASE_URL);
}
// Check if we're explicitly in production mode
else if (process.env.EXPO_PUBLIC_NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
  FINAL_API_BASE_URL = 'https://merchtech5-production.up.railway.app/api';
  console.log('🔧 Using production API URL (explicitly set):', FINAL_API_BASE_URL);
}
// Default to local development server for React Native development
else if (typeof window === 'undefined') {
  FINAL_API_BASE_URL = 'http://192.168.1.70:5001/api';
  console.log('🔧 Using local development API URL for React Native:', FINAL_API_BASE_URL);
}
else {
  console.log('🔧 Using environment API URL:', FINAL_API_BASE_URL);
}

export const api = axios.create({
  baseURL: FINAL_API_BASE_URL,
  timeout: 60000, // Standard timeout for most requests
});

// Create a separate instance for large file uploads
export const uploadAPI = axios.create({
  baseURL: FINAL_API_BASE_URL,
  timeout: 300000, // 5 minutes for large uploads
});

console.log('🔧 API instances created with baseURL:', FINAL_API_BASE_URL);

// Add interceptors for upload API
uploadAPI.interceptors.response.use(
  (response) => {
    console.log('✅ Upload API Response successful:', response.config.url);
    return response;
  },
  (error) => {
    console.error('❌ Upload API Request failed:', {
      url: error.config?.url,
      method: error.config?.method,
      timeout: error.config?.timeout,
      message: error.message,
      status: error.response?.status,
    });
    return Promise.reject(error);
  }
);

uploadAPI.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (
      config.data &&
      typeof config.data === 'object' &&
      !(typeof window !== 'undefined' && config.data instanceof FormData)
    ) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response successful:', response.config.url);
    return response;
  },
  (error) => {
    console.error('❌ API Request failed:', {
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      timeout: error.config?.timeout,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });
    
    // Provide more specific error messages for network issues
    if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
      console.error('🔴 Network Error Details:', {
        isAndroid: typeof navigator !== 'undefined' && navigator.userAgent?.includes('Android'),
        baseURL: API_BASE_URL,
        suggestion: 'Check if server is running and accessible from Android device'
      });
    }
    
    return Promise.reject(error);
  }
);

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // If data is plain object (not FormData), default to JSON
    if (
      config.data &&
      typeof config.data === 'object' &&
      !(typeof window !== 'undefined' && config.data instanceof FormData)
    ) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Health check API
export const healthAPI = {
  async check() {
    console.log('🏥 Health check: Testing connection to:', API_BASE_URL);
    try {
      const response = await api.get('/health');
      console.log('✅ Health check successful:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  },
};

// Auth API endpoints
export const authAPI = {
  async login(email: string, password: string) {
    console.log('🔐 AuthAPI: Starting login request');
    console.log('🔐 Email:', email);
    console.log('🔐 API Base URL:', API_BASE_URL);
    console.log('🔐 Full URL will be:', `${API_BASE_URL}/auth/login`);
    console.log('🔐 Environment variable EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
    
    try {
      const response = await api.post('/auth/login', { email, password });
      console.log('✅ AuthAPI: Login successful:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ AuthAPI: Login failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          method: error.config?.method
        }
      });
      throw error;
    }
  },

  async register(email: string, password: string, username: string) {
    const response = await api.post('/auth/register', { email, password, username });
    return response.data;
  },

  // **THE FIX**: Added the missing sendVerification function.
  async sendVerification(email: string) {
    const response = await api.post('/auth/send-verification', { email });
    return response.data;
  },
  
  // You may need these other functions later, so I've added them proactively.
  async resendVerification(email: string) {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  },

  async verifyEmail(token: string) {
    // Note: The verification link is a GET request, but if you have a form for it, it might be a POST.
    // This assumes the server has a POST route for this.
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
  },

  async forgotPassword(email: string) {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  async resetPassword(token: string, newPassword: string) {
    const response = await api.post('/auth/reset-password', { token, newPassword });
    return response.data;
  },
};

// Users API
export const usersAPI = {
  async getUserInfo(userId: string) {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },
};

// Universal Chat API
export const universalChatAPI = {
  async getMessages(filters: {
    limit?: number;
    offset?: number;
    filterType?: 'all' | 'user_store' | 'category';
    userId?: string;
    category?: string;
    messageType?: 'general' | 'store_promotion' | 'product_showcase';
  } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    
    const response = await api.get(`/chat/universal?${params.toString()}`);
    return response.data;
  },

  async postMessage(messageData: {
    message: string;
    messageType?: 'general' | 'store_promotion' | 'product_showcase';
    relatedProductId?: number;
    relatedStoreUserId?: number;
    productCategory?: string;
  }) {
    const response = await api.post('/chat/universal', messageData);
    return response.data;
  },

  async deleteMessage(messageId: number) {
    const response = await api.delete(`/chat/universal/${messageId}`);
    return response.data;
  },

  async getCategories() {
    const response = await api.get('/chat/categories');
    return response.data;
  },
};

// Products API
export const productsAPI = {
  async getMyProducts() {
    const res = await api.get('/products?mine=true');
    return res.data.products;
  },
  async getAllProducts() {
    const res = await api.get('/products/all');
    return res.data.products;
  },
  async getProductById(id: string) {
    console.log('🛍️ API: getProductById called for ID:', id);
    try {
      const res = await api.get(`/products/${id}`);
      console.log('✅ API: Product fetched successfully');
      return res.data;
    } catch (error: any) {
      console.error('🔴 API getProductById failed:', error);
      console.error('🔴 Response data:', error.response?.data);
      console.error('🔴 Status:', error.response?.status);
      throw error;
    }
  },
  async updateProduct(productId: string, updates: Partial<Record<string, any>>) {
    console.log('🟢 API: updateProduct called');
    console.log('🟢 Product ID:', productId);
    console.log('🟢 Updates payload:', JSON.stringify(updates, null, 2));
    
    try {
      const res = await api.patch(`/products/${productId}`, updates);
      console.log('✅ API response:', res.data);
      return res.data.product;
    } catch (error: any) {
      console.error('🔴 API updateProduct failed:', error);
      console.error('🔴 Response data:', error.response?.data);
      console.error('🔴 Status:', error.response?.status);
      throw error;
    }
  },
  async createProduct(productData: Partial<Product>) {
    console.log('🟢 API: createProduct called');
    console.log('🟢 Product data:', JSON.stringify(productData, null, 2));
    
    try {
      const res = await api.post('/products', productData);
      console.log('✅ API create response:', res.data);
      return res.data.product;
    } catch (error: any) {
      console.error('🔴 API createProduct failed:', error);
      console.error('🔴 Response data:', error.response?.data);
      console.error('🔴 Status:', error.response?.status);
      throw error;
    }
  },
  async deleteProduct(productId: string) {
    const res = await api.delete(`/products/${productId}`);
    return res.data;
  },
};

export const salesAPI = {
  async getMySales() {
    const res = await api.get('/sales/user');
    return res.data.sales;
  },
  async downloadMyCsv() {
    return api.get('/sales/user/csv', { responseType: 'blob' });
  },
  async getAllSales() {
    const res = await api.get('/sales/all');
    return res.data.sales;
  },
  async downloadAllCsv() {
    return api.get('/sales/all/csv', { responseType: 'blob' });
  }
};

export const checkoutAPI = {
  async createSession(items: { productId: string | number; quantity: number }[], successUrl: string, cancelUrl: string) {
    const res = await api.post('/checkout/session', { items, successUrl, cancelUrl });
    return res.data;
  },
};

// Media API
export const mediaAPI = {
  async getAll() {
    console.log('🔴 MediaAPI: Fetching all media files');
    const res = await api.get('/media?mine=true');
    console.log('🔴 MediaAPI: Loaded media files:', res.data.media?.length || 0);
    return res.data.media || [];
  },
  
  async getById(id: string) {
    console.log('🔴 MediaAPI: Fetching media file by ID:', id);
    const res = await api.get(`/media/${id}`);
    console.log('🔴 MediaAPI: Media file data:', res.data);
    return res.data.media;
  },
  
  async upload(mediaData: any) {
    console.log('🔴 MediaAPI: Uploading media file (legacy method)');
    const res = await uploadAPI.post('/media', mediaData);
    console.log('🔴 MediaAPI: Upload response:', res.data);
    return res.data;
  },

  async uploadFile(file: File, onProgress?: (progress: number) => void) {
    console.log('📤 MediaAPI: Uploading file directly to server');
    const formData = new FormData();
    formData.append('image', file);

    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          if (onProgress) {
            onProgress(progress);
          }
        }
      },
    });

    console.log('✅ MediaAPI: Direct upload successful:', response.data);
    return response.data;
  },

  async create(mediaData: Partial<MediaFile>) {
    console.log('📝 MediaAPI: Creating media record in database');
    const res = await api.post('/media', mediaData);
    console.log('📝 MediaAPI: Create media response:', res.data);
    return res.data;
  },

  async confirmUpload(uploadData: {
    title: string;
    fileUrl: string;
    filename: string;
    fileType: string;
    contentType: string;
    filesize: number;
    duration?: number;
    s3Key: string;
  }) {
    console.log('✅ MediaAPI: Confirming S3 upload');
    const res = await api.post('/media/confirm-upload', uploadData);
    console.log('✅ MediaAPI: Upload confirmation response:', res.data);
    return res.data;
  },

  async delete(mediaId: string) {
    console.log('🗑️ MediaAPI: Deleting media file:', mediaId);
    const res = await api.delete(`/media/${mediaId}`);
    console.log('🗑️ MediaAPI: Delete response:', res.data);
    return res.data;
  },
  async deleteMedia(mediaId: string) {
    // Legacy method - redirect to delete
    return this.delete(mediaId);
  },
};

// Playlist API
export const playlistAPI = {
  async create(playlistData: any) {
    console.log('📤 PlaylistAPI: Creating playlist');
    const res = await api.post('/playlists', playlistData);
    return res.data.playlist;
  },
  async getAll() {
    const res = await api.get('/playlists');
    return res.data.playlists;
  },
  async getById(id: string) {
    const res = await api.get(`/playlists/${id}`);
    return res.data.playlist;
  },
  async update(id: string, updates: any) {
    const res = await api.patch(`/playlists/${id}`, updates);
    return res.data.playlist;
  },
  async delete(id: string) {
    const res = await api.delete(`/playlists/${id}`);
    return res.data;
  },
  async addMedia(playlistId: string, mediaId: number, displayOrder?: number) {
    console.log('📤 PlaylistAPI: Adding media to playlist');
    const res = await api.post(`/playlists/${playlistId}/media`, { mediaId, displayOrder });
    return res.data;
  },
  async removeMedia(playlistId: string, mediaId: number) {
    console.log('📤 PlaylistAPI: Removing media from playlist');
    const res = await api.delete(`/playlists/${playlistId}/media/${mediaId}`);
    return res.data;
  },
  async updateMedia(playlistId: string, mediaIds: number[]) {
    console.log('📤 PlaylistAPI: Updating playlist media files');
    
    // Get current playlist to compare
    const currentPlaylist = await this.getById(playlistId);
    const currentMediaIds = currentPlaylist.mediaFiles?.map((f: any) => f.id) || [];
    
    // Remove media files that are no longer in the list
    const toRemove = currentMediaIds.filter((id: number) => !mediaIds.includes(id));
    for (const mediaId of toRemove) {
      await this.removeMedia(playlistId, mediaId);
    }
    
    // Add new media files
    const toAdd = mediaIds.filter((id: number) => !currentMediaIds.includes(id));
    for (let i = 0; i < toAdd.length; i++) {
      await this.addMedia(playlistId, toAdd[i], currentMediaIds.length + i + 1);
    }
    
    // Note: This doesn't handle reordering of existing files
    // For full reordering, we'd need to remove all and re-add in order
    
    return { message: 'Media files updated successfully' };
  },
};

// Slideshow API
export const slideshowAPI = {
  async create(slideshowData: any) {
    console.log('📤 SlideshowAPI: Creating slideshow');
    
    // Convert camelCase to snake_case for server
    const serverData = {
      ...slideshowData,
      autoplay_interval: slideshowData.autoplayInterval,
      requires_activation_code: slideshowData.requiresActivationCode,
      is_public: slideshowData.isPublic,
    };
    
    // Remove camelCase fields
    delete serverData.autoplayInterval;
    delete serverData.requiresActivationCode;
    delete serverData.isPublic;
    
    console.log('📤 slideshowAPI.create: Converting fields for server:', { 
      original: slideshowData, 
      converted: serverData 
    });
    
    const res = await api.post('/slideshows', serverData);
    return res.data.slideshow;
  },
  async getAll() {
    const res = await api.get('/slideshows');
    return res.data.slideshows;
  },
  async getById(id: string) {
    console.log('🎬 slideshowAPI.getById: Fetching slideshow:', id);
    console.log('🎬 slideshowAPI.getById: Full endpoint:', `/slideshows/${id}`);
    const res = await api.get(`/slideshows/${id}`);
    console.log('🎬 slideshowAPI.getById: Response:', res.data);
    return res.data.slideshow;
  },
  async update(id: string, updates: any) {
    // Convert camelCase to snake_case for server
    const serverUpdates = {
      ...updates,
      autoplay_interval: updates.autoplayInterval,
      requires_activation_code: updates.requiresActivationCode,
      is_public: updates.isPublic,
    };
    
    // Remove camelCase fields
    delete serverUpdates.autoplayInterval;
    delete serverUpdates.requiresActivationCode;
    delete serverUpdates.isPublic;
    
    console.log('📤 slideshowAPI.update: Converting fields for server:', { 
      original: updates, 
      converted: serverUpdates 
    });
    
    const res = await api.patch(`/slideshows/${id}`, serverUpdates);
    return res.data.slideshow;
  },
  async delete(id: string) {
    const res = await api.delete(`/slideshows/${id}`);
    return res.data;
  },
  async addImage(slideshowId: number | string, file: any, caption?: string, displayOrder?: number) {
    console.log('📤 slideshowAPI.addImage: req', slideshowId, { hasFile: !!file, caption, displayOrder });
    
    const formData = new FormData();
    
    // Handle different file formats
    if (file instanceof File) {
      formData.append('image', file);
    } else if (typeof window !== 'undefined' && file.uri) {
      // Web environment with URI
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const fileObj = new File([blob], file.name || 'image.jpg', { type: file.type || 'image/jpeg' });
      formData.append('image', fileObj);
    } else {
      // React Native environment
      formData.append('image', {
        uri: file.uri,
        name: file.name || 'image.jpg',
        type: file.type || 'image/jpeg'
      } as any);
    }
    
    // Add optional fields
    if (caption) formData.append('caption', caption);
    if (displayOrder !== undefined) formData.append('position', displayOrder.toString());
    
    const res = await api.post(`/slideshows/${slideshowId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('📤 slideshowAPI.addImage: res', res.data);
    return res.data.image;
  },
  async deleteImage(slideshowId: number | string, imageId: number | string) {
    console.log('📤 slideshowAPI.deleteImage: req', slideshowId, imageId);
    const res = await api.delete(`/slideshows/${slideshowId}/images/${imageId}`);
    console.log('📤 slideshowAPI.deleteImage: res', res.data);
    return res.data.slideshow;
  },
  async updateAudio(slideshowId: number | string, audioUrl: string) {
    console.log('🎵 slideshowAPI.updateAudio: req', slideshowId, audioUrl);
    const res = await api.patch(`/slideshows/${slideshowId}/audio`, { audioUrl });
    console.log('🎵 slideshowAPI.updateAudio: res', res.data);
    // Server returns slideshow directly, not wrapped in .slideshow
    return res.data;
  },
  async getByIdForAccess(id: string) {
    console.log('🎬 slideshowAPI.getByIdForAccess: Fetching slideshow for public access:', id);
    try {
      const res = await api.get(`/slideshow-access/${id}`);
      console.log('🎬 slideshowAPI.getByIdForAccess: res', res.data);
      
      // Check if access is restricted
      if (res.data.accessRestricted) {
        console.log('🎬 slideshowAPI.getByIdForAccess: Access is restricted, returning slideshow with restriction flag');
        return {
          ...res.data.slideshow,
          accessRestricted: true,
          message: res.data.message
        };
      }
      
      // Full access granted
      console.log('🎬 slideshowAPI.getByIdForAccess: Full access granted');
      return res.data.slideshow;
    } catch (error: any) {
      console.error('🎬 slideshowAPI.getByIdForAccess: Error fetching slideshow:', error);
      
      // Handle 403 errors (invalid activation code)
      if (error.response?.status === 403) {
        console.log('🎬 slideshowAPI.getByIdForAccess: 403 error - invalid activation code or access denied');
        throw error; // Let the calling code handle 403 errors
      }
      
      // Handle other errors
      throw error;
    }
  },
};

// Product Links API
export const productLinksAPI = {
  async getByPlaylistId(playlistId: string) {
    console.log('🔗 ProductLinksAPI: Fetching product links for playlist:', playlistId);
    const res = await api.get(`/playlists/${playlistId}/product-links`);
    return res.data;
  },
  async addToPlaylist(playlistId: string, productId: string) {
    console.log('🔗 ProductLinksAPI: Adding product link to playlist:', { playlistId, productId });
    const res = await api.post(`/playlists/${playlistId}/product-links`, { productId });
    return res.data;
  },
  async removeFromPlaylist(playlistId: string, productId: string) {
    console.log('🔗 ProductLinksAPI: Removing product link from playlist:', { playlistId, productId });
    const res = await api.delete(`/playlists/${playlistId}/product-links/${productId}`);
    return res.data;
  },
  async getBySlideshowId(slideshowId: string) {
    console.log('🔗 ProductLinksAPI: Fetching product links for slideshow:', slideshowId);
    const res = await api.get(`/slideshows/${slideshowId}/product-links`);
    return res.data;
  },
  async addToSlideshow(slideshowId: string, productId: string) {
    console.log('🔗 ProductLinksAPI: Adding product link to slideshow:', { slideshowId, productId });
    const res = await api.post(`/slideshows/${slideshowId}/product-links`, { productId });
    return res.data;
  },
  async removeFromSlideshow(slideshowId: string, productId: string) {
    console.log('🔗 ProductLinksAPI: Removing product link from slideshow:', { slideshowId, productId });
    const res = await api.delete(`/slideshows/${slideshowId}/product-links/${productId}`);
    return res.data;
  },
};

// QR Code API
export const qrCodeAPI = {
  async create(qrData: any) {
    console.log('📱 QRCodeAPI: ============ API CREATE DEBUG START ============');
    console.log('📱 QRCodeAPI: Creating QR code with data:', JSON.stringify(qrData, null, 2));
    console.log('📱 QRCodeAPI: API Base URL:', API_BASE_URL);
    console.log('📱 QRCodeAPI: Full endpoint will be:', `${API_BASE_URL}/qr-codes`);
    
    try {
      console.log('📱 QRCodeAPI: About to make POST request...');
      const res = await api.post('/qr-codes', qrData);
      console.log('📱 QRCodeAPI: POST request successful');
      console.log('📱 QRCodeAPI: Response status:', res.status);
      console.log('📱 QRCodeAPI: Response data:', JSON.stringify(res.data, null, 2));
      console.log('📱 QRCodeAPI: ============ API CREATE DEBUG END ============');
      return res.data.qrCode;
    } catch (error: any) {
      console.error('📱 QRCodeAPI: ============ API CREATE ERROR DEBUG START ============');
      console.error('📱 QRCodeAPI: POST request failed:', error);
      console.error('📱 QRCodeAPI: Error message:', error.message);
      
      if (error.response) {
        console.error('📱 QRCodeAPI: Error response details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
      } else if (error.request) {
        console.error('📱 QRCodeAPI: Network error - no response:', error.request);
      }
      
      console.error('📱 QRCodeAPI: ============ API CREATE ERROR DEBUG END ============');
      throw error;
    }
  },
  async getAll() {
    console.log('📱 QRCodeAPI: Fetching all QR codes');
    const res = await api.get('/qr-codes');
    return res.data.qrCodes;
  },
  async getById(id: string) {
    console.log('📱 QRCodeAPI: Fetching QR code by ID:', id);
    const res = await api.get(`/qr-codes/${id}`);
    return res.data.qrCode;
  },
  async update(id: string, updates: any) {
    console.log('📱 QRCodeAPI: Updating QR code:', id);
    const res = await api.patch(`/qr-codes/${id}`, updates);
    return res.data.qrCode;
  },
  async delete(id: string) {
    console.log('📱 QRCodeAPI: Deleting QR code:', id);
    const res = await api.delete(`/qr-codes/${id}`);
    return res.data;
  },
};

// Activation Codes API
export const activationCodesAPI = {
  // Generate new activation code
  async create(data: { playlistId?: string; slideshowId?: string; maxUses?: number; expiresAt?: string }) {
    console.log('🔑 ActivationCodesAPI: Creating activation code');
    const res = await api.post('/activation-codes', data);
    return res.data.activationCode;
  },

  // Get all codes generated by user (ALL GENERATED CODES tab)
  async getGenerated() {
    console.log('🔑 ActivationCodesAPI: Fetching generated codes');
    const res = await api.get('/activation-codes/generated');
    return res.data.activationCodes;
  },

  // Get codes attached to user's profile (MY ACCESS CODES tab)
  async getMyAccess() {
    console.log('🔑 ActivationCodesAPI: Fetching my access codes');
    const res = await api.get('/activation-codes/my-access');
    return res.data.accessCodes;
  },

  // Attach activation code to user's profile
  async attach(code: string) {
    console.log('🔑 ActivationCodesAPI: Attaching code:', code);
    const res = await api.post('/activation-codes/attach', { code });
    return res.data;
  },

  // Detach activation code from user's profile (removes access)
  async detach(codeId: string) {
    console.log('🔑 ActivationCodesAPI: Detaching code:', codeId);
    const res = await api.delete(`/activation-codes/detach/${codeId}`);
    return res.data;
  },

  // Validate activation code for playlist/slideshow access
  async validate(code: string, playlistId?: string, slideshowId?: string) {
    console.log('🔑 ActivationCodesAPI: Validating code:', { code, playlistId, slideshowId });
    const res = await api.post('/activation-codes/validate', { code, playlistId, slideshowId });
    return res.data;
  },

  // Get codes for specific playlist/slideshow (for content creators)
  async getForContent(contentType: 'playlist' | 'slideshow', contentId: string) {
    console.log('🔑 ActivationCodesAPI: Fetching codes for content:', { contentType, contentId });
    const res = await api.get(`/activation-codes/content/${contentType}/${contentId}`);
    return res.data.activationCodes;
  },

  // Update activation code (change expiration date, usage limits, or active status)
  async update(codeId: string, updates: { maxUses?: number | null; expiresAt?: string | null; isActive?: boolean }) {
    console.log('🔑 ActivationCodesAPI: Updating code:', { codeId, updates });
    const res = await api.patch(`/activation-codes/${codeId}`, updates);
    return res.data.activationCode;
  },

  // Delete activation code
  async delete(codeId: string) {
    console.log('🔑 ActivationCodesAPI: Deleting code:', codeId);
    const res = await api.delete(`/activation-codes/${codeId}`);
    return res.data;
  },
};

// Chat API
export const chatAPI = {
  async getMessages(playlistId: string, limit = 50, offset = 0) {
    console.log('📤 ChatAPI: Fetching messages for playlist:', playlistId);
    const res = await api.get(`/playlists/${playlistId}/chat?limit=${limit}&offset=${offset}`);
    return res.data.messages;
  },
  async sendMessage(playlistId: string, message: string) {
    console.log('📤 ChatAPI: Sending message to playlist:', playlistId);
    const res = await api.post(`/playlists/${playlistId}/chat`, { message });
    return res.data.message;
  },
  async deleteMessage(playlistId: string, messageId: string) {
    console.log('📤 ChatAPI: Deleting message:', messageId);
    const res = await api.delete(`/playlists/${playlistId}/chat/${messageId}`);
    return res.data;
  },
};

export const fileUploadAPI = {
  async upload(file: any) {
    console.log('🔧 fileUploadAPI.upload called with:', {
      fileName: file.name,
      fileType: file.type,
      isFile: file instanceof File,
      hasUri: !!file.uri
    });
    
    // Log the current API configuration
    console.log('🔧 Current API baseURL:', api.defaults.baseURL);
    console.log('🔧 Environment API URL:', FINAL_API_BASE_URL);
    console.log('🔧 Upload will go to:', `${api.defaults.baseURL}/upload`);
    
    const formData = new FormData();
    let payload: any;
    if (file instanceof File) {
      payload = file; // Web direct
      console.log('🔧 Using File directly');
    } else if (typeof window !== 'undefined') {
      console.log('🔧 Converting URI to File object');
      const response = await fetch(file.uri);
      const blob = await response.blob();
      payload = new File([blob], file.name, { type: file.type });
    } else {
      console.log('🔧 Using URI payload for native');
      payload = { uri: file.uri, name: file.name, type: file.type } as any;
    }
    
    // Use 'image' field name to match server expectation
    formData.append('image', payload, file.name ?? (payload.name || 'upload'));
    console.log('🔧 FormData prepared, making request to /upload');
    console.log('🔧 Final request URL will be:', `${api.defaults.baseURL}/upload`);
    
    // Let axios set the correct multipart boundary; specifying the header manually
    // can omit the boundary and lead to 400 errors on some environments.
    const res = await api.post('/upload', formData);
    console.log('🔧 Upload response:', res.data);
    // Server returns 'imageUrl' but we want to return 'fileUrl' for consistency
    return res.data.imageUrl as string;
  },
};

export default api;
