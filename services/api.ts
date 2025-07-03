import axios from 'axios';
import { Product } from '@/shared/product-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/environment';

// Use centralized environment configuration
const API_BASE_URL = env.apiBaseUrl;

console.log('✅ API configured with centralized environment config');
if (env.isDevelopment) {
  console.log('🔍 Environment details:', {
    environment: env.nodeEnv,
    apiUrl: API_BASE_URL,
    isProduction: env.isProduction
  });
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout for Android
});

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
};

// Users API
export const usersAPI = {
  async getUserInfo(userId: string) {
    const response = await api.get(`/users/${userId}`);
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
  async upload(mediaData: any) {
    console.log('📤 MediaAPI: Uploading media file');
    const res = await api.post('/media', mediaData);
    return res.data;
  },
  async getMyMedia() {
    const res = await api.get('/media?mine=true');
    return res.data.media;
  },
  async getAllMedia() {
    const res = await api.get('/media/all');
    return res.data.media;
  },
  async getById(id: string) {
    const res = await api.get(`/media/${id}`);
    return res.data.media;
  },
  async deleteMedia(mediaId: string) {
    const res = await api.delete(`/media/${mediaId}`);
    return res.data;
  },
  async getAll() {
    const res = await api.get('/media');
    return res.data.media;
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
};

// Slideshow API
export const slideshowAPI = {
  async create(slideshowData: any) {
    console.log('📤 SlideshowAPI: Creating slideshow');
    const res = await api.post('/slideshows', slideshowData);
    return res.data.slideshow;
  },
  async getAll() {
    const res = await api.get('/slideshows');
    return res.data.slideshows;
  },
  async getById(id: string) {
    const res = await api.get(`/slideshows/${id}`);
    return res.data.slideshow;
  },
  async update(id: string, updates: any) {
    const res = await api.patch(`/slideshows/${id}`, updates);
    return res.data.slideshow;
  },
  async delete(id: string) {
    const res = await api.delete(`/slideshows/${id}`);
    return res.data;
  },
  async addImage(slideshowId: number | string, data: { imageUrl: string; caption?: string; displayOrder?: number }) {
    console.log('📤 slideshowAPI.addImage: req', slideshowId, data);
    const res = await api.post(`/slideshows/${slideshowId}/images`, data);
    console.log('📤 slideshowAPI.addImage: res', res.data);
    return res.data.slideshow;
  },
  async deleteImage(slideshowId: number | string, imageId: number | string) {
    console.log('📤 slideshowAPI.deleteImage: req', slideshowId, imageId);
    const res = await api.delete(`/slideshows/${slideshowId}/images/${imageId}`);
    console.log('📤 slideshowAPI.deleteImage: res', res.data);
    return res.data.slideshow;
  },
  async updateAudio(slideshowId: number | string, audioUrl: string) {
    const res = await api.patch(`/slideshows/${slideshowId}/audio`, { audioUrl });
    return res.data.slideshow;
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
    const formData = new FormData();
    let payload: any;
    if (file instanceof File) {
      payload = file; // Web direct
    } else if (typeof window !== 'undefined') {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      payload = new File([blob], file.name, { type: file.type });
    } else {
      payload = { uri: file.uri, name: file.name, type: file.type } as any;
    }
    formData.append('file', payload, file.name ?? (payload.name || 'upload'));
    // Let axios set the correct multipart boundary; specifying the header manually
    // can omit the boundary and lead to 400 errors on some environments.
    const res = await api.post('/upload', formData);
    return res.data.fileUrl as string;
  },
};

export default api;
