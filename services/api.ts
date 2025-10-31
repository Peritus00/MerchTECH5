import axios from 'axios';
import { Product } from '@/shared/product-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/environment';
import { MediaFile } from '@/shared/media-schema';
import { Platform } from 'react-native';

// Use centralized environment configuration
const API_BASE_URL = env.apiBaseUrl;

console.log(`[${new Date().toISOString()}] API Service Initialized. Using Base URL: ${API_BASE_URL}`);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Standard timeout for most requests
  withCredentials: true, // Send cookies with requests (important for visitor ID tracking)
});

// Create a separate instance for large file uploads
export const uploadAPI = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for large uploads
  withCredentials: true, // Send cookies with requests
});

console.log('🔧 API instances created with baseURL:', API_BASE_URL);

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
      data: error.response?.data,
    });
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed - token may be expired');
      // Don't automatically logout here as it can cause loops
    } else if (error.response?.status === 403) {
      console.error('🔐 Access forbidden - insufficient permissions');
    } else if (error.response?.status === 404) {
      console.error('🔍 Resource not found');
    } else if (error.response?.status >= 500) {
      console.error('🔥 Server error');
    }
    
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
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('🔐 API: Adding auth token to request:', config.url);
      } else {
        console.log('🔐 API: No auth token found for request:', config.url);
      }
    } catch (error) {
      console.error('🔐 API: Error getting auth token:', error);
    }
    
    // If data is plain object (not FormData), default to JSON
    if (
      config.data &&
      typeof config.data === 'object' &&
      !(typeof window !== 'undefined' && config.data instanceof FormData)
    ) {
      config.headers['Content-Type'] = 'application/json';
    }
    
    // Add environment info for debugging
    console.log('🔧 API: Request config:', {
      url: config.url,
      baseURL: config.baseURL,
      method: config.method,
      hasAuth: !!config.headers.Authorization,
      environment: env.nodeEnv,
      isProduction: env.isProduction
    });
    
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

  async sendVerification(email: string) {
    const response = await api.post('/auth/send-verification', { email });
    return response.data;
  },
  
  async resendVerification(email: string) {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  },

  async verifyEmail(token: string) {
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
  async getDemographics() {
    const response = await api.get('/user/demographics');
    return response.data;
  },
  async updateDemographics(ageRange: string, gender: string) {
    const response = await api.put('/user/demographics', { ageRange, gender });
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
    const res = await api.get(`/products?mine=true&_t=${Date.now()}`);
    // Extract products from response wrapper and ensure it's always an array
    const products = res.data.products || res.data;
    return Array.isArray(products) ? products : [];
  },
  async getAllProducts() {
    try {
      console.log('📦 API: getAllProducts - Starting request');
      
      // Try the public endpoint first (no auth required)
      let res;
      try {
        console.log('📦 API: getAllProducts - Trying public endpoint /products/all');
        res = await api.get(`/products/all?_t=${Date.now()}`);
        console.log('📦 API: getAllProducts - Public endpoint successful');
      } catch (publicError: any) {
        console.log('📦 API: getAllProducts - Public endpoint failed, trying authenticated endpoint');
        console.log('📦 API: getAllProducts - Public error:', publicError.response?.status, publicError.message);
        
        // Fallback to authenticated endpoint
        res = await api.get(`/products?_t=${Date.now()}`);
        console.log('📦 API: getAllProducts - Authenticated endpoint successful');
      }
      
      console.log('📦 API: getAllProducts - Response received:', {
        status: res.status,
        statusText: res.statusText,
        hasData: !!res.data,
        dataType: typeof res.data,
        dataKeys: res.data ? Object.keys(res.data) : []
      });
      
      // Extract products from response wrapper and ensure it's always an array
      const products = res.data.products || res.data;
      console.log('📦 API: getAllProducts response type:', typeof products, 'isArray:', Array.isArray(products));
      console.log('📦 API: getAllProducts raw response:', res.data);
      
      if (!Array.isArray(products)) {
        console.error('📦 API: getAllProducts - Expected array but got:', typeof products, products);
        return [];
      }
      
      console.log('📦 API: getAllProducts - Returning', products.length, 'products');
      return products;
    } catch (error: any) {
      console.error('📦 API: getAllProducts - Error occurred:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        }
      });
      
      // Always return empty array on error to prevent .map() issues
      return [];
    }
  },
  async getProductById(id: string) {
    try {
      const response = await api.get(`/products/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching product with id ${id}:`, error);
      throw error;
    }
  },
  async updateProduct(productId: string, updates: Partial<Record<string, any>>) {
    try {
      console.log('Updating product with data:', updates);
      const response = await api.patch(`/products/${productId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  },
  async createProduct(productData: Partial<Product>) {
    try {
      console.log('Creating product with data:', productData);
      const response = await api.post('/products', productData);
      return response.data;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  },
  async deleteProduct(productId: string) {
    try {
      const response = await api.delete(`/products/${productId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  },
};

export const salesAPI = {
  async getMySales() {
    const res = await api.get('/sales?mine=true');
    return res.data;
  },
  async downloadMyCsv() {
    return api.get('/sales/csv?mine=true', { responseType: 'blob' });
  },
  async getAllSales() {
    const res = await api.get('/sales');
    return res.data;
  },
  async downloadAllCsv() {
    return api.get('/sales/csv', { responseType: 'blob' });
  },
};

export const paymentAPI = {
  async createSession(items: { productId: string | number; quantity: number }[], successUrl: string, cancelUrl: string) {
    const response = await api.post('/checkout/session', {
      items,
      successUrl,
      cancelUrl,
    });
    return response.data;
  },
};

// Alias for backward compatibility
export const checkoutAPI = paymentAPI;

export const mediaAPI = {
  async getAll() {
    const response = await api.get('/media');
    return response.data;
  },

  async getById(id: string) {
    const response = await api.get(`/media/${id}`);
    return response.data;
  },

  async upload(mediaData: any) {
    const response = await uploadAPI.post('/media/upload', mediaData);
    return response.data;
  },

  async uploadFile(file: File | any, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    
    // Handle different platforms
    if (Platform.OS === 'web') {
      // Web platform - file is a File object
      formData.append('image', file);
    } else {
      // Mobile platforms (iOS/Android) - file has uri, name, type properties
      formData.append('image', {
        uri: file.uri,
        name: file.name,
        type: file.type
      } as any);
    }

    const config = {
      onUploadProgress: (progressEvent: any) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    };

    const response = await uploadAPI.post('/upload', formData, config);
    return response.data;
  },

  async create(mediaData: Partial<MediaFile>) {
    const response = await api.post('/media', mediaData);
    return response.data;
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
    const response = await api.post('/media/confirm-upload', uploadData);
    return response.data;
  },

  async delete(mediaId: string) {
    await api.delete(`/media/${mediaId}`);
  },
};

export const playlistsAPI = {
  async deleteMedia(mediaId: string) {
    // This seems to be a duplicate of mediaAPI.delete, but keeping it in case of subtle differences
    console.warn('playlistsAPI.deleteMedia is deprecated. Use mediaAPI.delete instead.');
    const response = await api.delete(`/media/${mediaId}`);
    return response.data;
  },
  async create(playlistData: any) {
    const response = await api.post('/playlists', playlistData);
    return response.data;
  },
  async getAll() {
    const response = await api.get('/playlists');
    // Handle both { playlists: [...] } and direct array
    const data = response.data.playlists || response.data;
    return Array.isArray(data) ? data : [];
  },
  async getById(id: string) {
    const response = await api.get(`/playlists/${id}`);
    return response.data;
  },
  async update(id: string, updates: any) {
    const response = await api.patch(`/playlists/${id}`, updates);
    return response.data;
  },
  async delete(id: string) {
    const response = await api.delete(`/playlists/${id}`);
    return response.data;
  },
  async addMedia(playlistId: string, mediaId: number, displayOrder?: number) {
    const response = await api.post(`/playlists/${playlistId}/media`, { mediaId, displayOrder });
    return response.data;
  },
  async removeMedia(playlistId: string, mediaId: number) {
    const response = await api.delete(`/playlists/${playlistId}/media/${mediaId}`);
    return response.data;
  },
  async updateMedia(playlistId: string, mediaIds: number[]) {
    // This endpoint should handle reordering of all media items in a playlist
    const response = await api.put(`/playlists/${playlistId}/media`, { mediaFileIds: mediaIds });
    return response.data;
  },
};

export const slideshowsAPI = {
  async create(slideshowData: any) {
    console.log('Creating slideshow with data:', slideshowData);
    // Ensure `is_featured` is a boolean
    const payload = {
      ...slideshowData,
      is_featured: slideshowData.is_featured === true || slideshowData.is_featured === 'true',
    };
    try {
      const response = await api.post('/slideshows', payload);
      console.log('Slideshow created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating slideshow:', error.response ? error.response.data : error.message);
      throw error;
    }
  },
  async getAll() {
    const response = await api.get('/slideshows');
    // Handle both { slideshows: [...] } and direct array
    const data = response.data.slideshows || response.data;
    return Array.isArray(data) ? data : [];
  },
  async getById(id: string) {
    try {
      const response = await api.get(`/slideshows/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching slideshow', error);
      throw error;
    }
  },
  async update(id: string, updates: any) {
    // Ensure boolean values are correctly formatted if they are strings
    if (updates.is_featured !== undefined) {
      updates.is_featured = updates.is_featured === true || updates.is_featured === 'true';
    }
    if (updates.is_public !== undefined) {
      updates.is_public = updates.is_public === true || updates.is_public === 'true';
    }
    console.log('Updating slideshow with data:', updates);
    try {
      const response = await api.patch(`/slideshows/${id}`, updates);
      console.log('Slideshow updated successfully:', response.data);
      // Backend returns { slideshow: {...} }, extract the slideshow object
      return response.data.slideshow || response.data;
    } catch (error: any) {
      console.error('Error updating slideshow:', error.response ? error.response.data : error.message);
      throw error;
    }
  },
  async delete(id: string) {
    const response = await api.delete(`/slideshows/${id}`);
    return response.data;
  },
  async addImage(slideshowId: number | string, file: any, caption?: string, displayOrder?: number) {
    console.log('addImage called with:', { slideshowId, file, caption, displayOrder });
    const formData = new FormData();
    if (file.uri) { // React Native
      formData.append('image', {
        uri: file.uri,
        name: file.name || 'photo.jpg',
        type: file.type || 'image/jpeg',
      } as any);
    } else { // Web
      formData.append('image', file);
    }

    if (caption) formData.append('caption', caption);
    if (displayOrder) formData.append('display_order', String(displayOrder));
  
    console.log('Uploading image to slideshow:', slideshowId);
    console.log('FormData content:', formData);

    try {
      // Use the dedicated uploadAPI instance for this request
      const response = await uploadAPI.post(`/slideshows/${slideshowId}/images`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('Image added successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error adding image to slideshow:', error.response ? error.response.data : error.message);
      throw error;
    }
  },
  async deleteImage(slideshowId: number | string, imageId: number | string) {
    const response = await api.delete(`/slideshows/${slideshowId}/images/${imageId}`);
    return response.data;
  },
  async updateAudio(slideshowId: number | string, audioUrl: string) {
    console.log(`Updating audio for slideshow ${slideshowId} with URL: ${audioUrl}`);
    const response = await api.patch(`/slideshows/${slideshowId}`, { audio_url: audioUrl });
    // Backend returns { slideshow: {...} }, extract the slideshow object
    return response.data.slideshow || response.data;
  },
};

export const slideshowAccessAPI = {
  async getByIdForAccess(id: string, activationCode?: string) {
    try {
      console.log('🎬 API: Fetching slideshow access for ID:', id, 'with code:', activationCode || 'none');
      
      const config = activationCode 
        ? { params: { code: activationCode } }
        : {};
      
      const response = await api.get(`/slideshow-access/${id}`, config);
      console.log('🎬 API: Slideshow access response:', response.data);
      
      // The server returns the slideshow data directly, not wrapped in { slideshow: ... }
      return response.data;
    } catch (error: any) {
      console.error('🎬 API: Error fetching slideshow for access:', error);
      if (error.response && error.response.status === 404) {
        console.warn(`Slideshow with ID ${id} not found.`);
        return null;
      }
      throw error;
    }
  },
  async getByIdForPreview(id: string) {
    try {
      console.log('🎬 API: Fetching slideshow preview for ID:', id);
      const response = await api.get(`/slideshow-preview/${id}`);
      console.log('🎬 API: Slideshow preview response:', response.data);
      
      // The server returns the slideshow data directly
      return response.data;
    } catch (error: any) {
      console.error('🎬 API: Error fetching slideshow for preview:', error);
      if (error.response && error.response.status === 404) {
        console.warn(`Slideshow with ID ${id} not found.`);
        return null;
      }
      throw error;
    }
  },
};

export const playlistAccessAPI = {
  async getByIdForAccess(id: string, activationCode?: string) {
    try {
      console.log('🎵 API: Fetching playlist access for ID:', id, 'with code:', activationCode || 'none');
      
      const config = activationCode 
        ? { params: { code: activationCode } }
        : {};
      
      const response = await api.get(`/playlist-access/${id}`, config);
      console.log('🎵 API: Playlist access response:', response.data);
      
      return response.data;
    } catch (error: any) {
      console.error('🎵 API: Error fetching playlist for access:', error);
      if (error.response && error.response.status === 404) {
        console.warn(`Playlist with ID ${id} not found.`);
        return null;
      }
      throw error;
    }
  },
};

// This is for managing products associated with playlists or slideshows.
export const contentProductsAPI = {
  // Playlist-specific product management
  async getByPlaylistId(playlistId: string) {
    const response = await api.get(`/playlists/${playlistId}/products`);
    return response.data;
  },
  async addToPlaylist(playlistId: string, productId: string) {
    const response = await api.post(`/playlists/${playlistId}/products`, { productId });
    return response.data;
  },
  async removeFromPlaylist(playlistId: string, productId: string) {
    const response = await api.delete(`/playlists/${playlistId}/products/${productId}`);
    return response.data;
  },

  // Slideshow-specific product management
  async getBySlideshowId(slideshowId: string) {
    const response = await api.get(`/slideshows/${slideshowId}/products`);
    return response.data;
  },
  async addToSlideshow(slideshowId: string, productId: string) {
    const response = await api.post(`/slideshows/${slideshowId}/products`, { productId });
    return response.data;
  },
  async removeFromSlideshow(slideshowId: string, productId: string) {
    const response = await api.delete(`/slideshows/${slideshowId}/products/${productId}`);
    return response.data;
  },
};

export const qrCodeAPI = {
  async create(qrData: any) {
    console.log('Creating QR code with data:', qrData);
    // Validate that either playlist_id or slideshow_id is present
    if (!qrData.playlist_id && !qrData.slideshow_id) {
      throw new Error('Either playlist_id or slideshow_id must be provided.');
    }
    // Ensure optional fields are handled correctly
    const payload = {
      ...qrData,
      max_uses: qrData.max_uses || null,
      expires_at: qrData.expires_at || null,
      is_active: qrData.is_active !== false, // Default to true
    };
    try {
      const response = await api.post('/qrcodes', payload);
      console.log('QR code created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating QR code:', error.response ? error.response.data : error.message);
      throw error;
    }
  },
  async getAll() {
    const response = await api.get('/qrcodes');
    // Handle both { qrCodes: [...] } and direct array
    const data = response.data.qrCodes || response.data;
    return Array.isArray(data) ? data : [];
  },

  async getById(id: string) {
    const response = await api.get(`/qrcodes/${id}`);
    return response.data;
  },

  async update(id: string, updates: any) {
    const response = await api.patch(`/qrcodes/${id}`, updates);
    return response.data;
  },
  async delete(id: string) {
    console.log('🌐 API: Attempting to delete QR code with ID:', id);
    console.log('🌐 API: Delete URL:', `/qrcodes/${id}`);
    
    try {
      const response = await api.delete(`/qrcodes/${id}`);
      console.log('🌐 API: Delete response status:', response.status);
      console.log('🌐 API: Delete response data:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('🌐 API: Delete request failed:', error);
      console.error('🌐 API: Error response:', error.response?.data);
      console.error('🌐 API: Error status:', error.response?.status);
      throw error;
    }
  },
};

export const accessCodeAPI = {
  // Create a new activation code
  async create(data: { playlistId?: string; slideshowId?: string; maxUses?: number; expiresAt?: string }) {
    const response = await api.post('/activation-codes', data);
    return response.data;
  },
  // Get all codes generated by the current user
  async getGenerated() {
    const response = await api.get('/activation-codes/generated');
    // Handle both { activationCodes: [...] } and direct array
    const data = response.data.activationCodes || response.data;
    return Array.isArray(data) ? data : [];
  },
  // Get all codes owned/claimed by the current user
  async getMyAccess() {
    const response = await api.get('/activation-codes/my-access');
    // Handle both { accessCodes: [...] } and direct array
    const data = response.data.accessCodes || response.data;
    return Array.isArray(data) ? data : [];
  },
  // Attach/claim a code
  async attach(code: string) {
    const response = await api.post('/activation-codes/attach', { code });
    return response.data;
  },
  // Detach/unclaim a code
  async detach(codeId: string) {
    const response = await api.delete(`/activation-codes/${codeId}/detach`);
    return response.data;
  },
  // Validate a code for a specific piece of content
  async validate(code: string, playlistId?: string, slideshowId?: string) {
    const response = await api.post('/activation-codes/validate', { code, playlistId, slideshowId });
    return response.data;
  },
  // Get all codes for a specific playlist or slideshow
  async getForContent(contentType: 'playlist' | 'slideshow', contentId: string) {
    const response = await api.get(`/activation-codes/content/${contentType}/${contentId}`);
    return response.data;
  },
  // Update a code
  async update(codeId: string, updates: { maxUses?: number | null; expiresAt?: string | null; isActive?: boolean }) {
    const response = await api.patch(`/activation-codes/${codeId}`, updates);
    return response.data;
  },
  // Delete a code
  async delete(codeId: string) {
    const response = await api.delete(`/activation-codes/${codeId}`);
    return response.data;
  },
};

// Backward compatibility alias
export const activationCodesAPI = accessCodeAPI;

// Playlist Chat API
export const playlistChatAPI = {
  async getMessages(playlistId: string, limit = 50, offset = 0) {
    const response = await api.get(`/playlists/${playlistId}/chat?limit=${limit}&offset=${offset}`);
    return response.data;
  },
  async sendMessage(playlistId: string, message: string) {
    const response = await api.post(`/playlists/${playlistId}/chat`, { message });
    return response.data;
  },
  async deleteMessage(playlistId: string, messageId: string) {
    console.log('📤 ChatAPI: Deleting message:', messageId);
    const res = await api.delete(`/playlists/${playlistId}/chat/${messageId}`);
    return res.data;
  },
};

// Slideshow Chat API
export const slideshowChatAPI = {
  async getMessages(slideshowId: string, limit = 50, offset = 0) {
    const response = await api.get(`/slideshows/${slideshowId}/chat?limit=${limit}&offset=${offset}`);
    return response.data;
  },
  async sendMessage(slideshowId: string, message: string) {
    const response = await api.post(`/slideshows/${slideshowId}/chat`, { message });
    return response.data;
  },
  async deleteMessage(slideshowId: string, messageId: string) {
    console.log('📤 SlideshowChatAPI: Deleting message:', messageId);
    const res = await api.delete(`/slideshows/${slideshowId}/chat/${messageId}`);
    return res.data;
  },
};

// Main chat API (alias for playlist chat for backward compatibility)
export const chatAPI = playlistChatAPI;

// Admin API
export const adminAPI = {
  async searchUsers(query: string) {
    const response = await api.get(`/admin/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  async getUserScans(userId: number) {
    const response = await api.get(`/admin/users/${userId}/scans`);
    return response.data;
  },

  async resetUserScans(userId: number) {
    const response = await api.delete(`/admin/users/${userId}/scans`);
    return response.data;
  },
};
