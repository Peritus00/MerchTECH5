import axios from 'axios';
import { Product } from '@/shared/product-schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rely on the environment variable set in your .env file
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.70:5001/api';

console.log('✅ API configured to use public URL:', API_BASE_URL);
console.log('🔍 Environment check:', {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV,
  finalURL: API_BASE_URL
});

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout for Android
  headers: {
    'Content-Type': 'application/json',
  },
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
    const response = await api.post('/auth/login', { email, password });
    return response.data;
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

export default api;
