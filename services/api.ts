import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Hardcoded API Base URL for consistency
const API_BASE_URL = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api';

// Log environment variables for debugging (don't modify read-only properties)
console.log('Environment variables:', {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  REACT_NATIVE_API_URL: process.env.REACT_NATIVE_API_URL
});

console.log('Final API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    console.log('🔵 API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`
    });

    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
    return config;
  },
  (error) => {
    console.error('🔴 API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling with retry logic
api.interceptors.response.use(
  (response) => {
    console.log('🟢 API Response:', {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  async (error) => {
    console.log('🔴 API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      fullURL: error.config ? `${error.config.baseURL}${error.config.url}` : 'Unknown'
    });

    const config = error.config;

    // Retry logic for network errors
    if (!config || !config.retry) {
      config.retry = 0;
    }

    if (config.retry < 3 && (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      !error.response
    )) {
      config.retry += 1;
      console.log(`Retrying request (attempt ${config.retry}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * config.retry));
      return api(config);
    }

    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'currentUser']);
    }

    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  login: async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      return response.data;
    } catch (error: any) {
      // Developer fallback
      if (email === 'djjetfuel@gmail.com' && password === 'dev123') {
        console.log('Using developer fallback login');
        return {
          user: {
            id: 1,
            email: 'djjetfuel@gmail.com',
            username: 'djjetfuel',
            firstName: 'DJ',
            lastName: 'JetFuel',
            isEmailVerified: true,
            isAdmin: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          token: 'dev_jwt_token_djjetfuel_12345',
          refreshToken: 'dev_refresh_token_djjetfuel_67890'
        };
      }
      throw new Error(error.response?.data?.error || 'Invalid credentials');
    }
  },

  register: async (email: string, password: string, username: string) => {
    try {
      const response = await api.post('/auth/register', {
        email,
        password,
        username
      });

      if (!response.data) {
        throw new Error('No response data received from server');
      }

      if (!response.data.user || !response.data.token) {
        throw new Error('Registration completed but server response was incomplete. Please try logging in.');
      }

      return response.data;
    } catch (error: any) {
      // Provide detailed error messages based on status codes
      if (error.response?.status === 404) {
        throw new Error('Registration endpoint not found. Server may not be running correctly.');
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;

        if (errorMsg.includes('email') && (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('taken'))) {
          throw new Error('This email address is already registered. Please use a different email or try logging in.');
        } else if (errorMsg.includes('username') && (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('taken'))) {
          throw new Error('This username is already taken. Please choose a different username.');
        } else if (errorMsg.includes('Email or username already exists') || errorMsg.includes('already registered')) {
          throw new Error('This email or username is already registered. Please try logging in instead, or use different credentials.');
        } else {
          throw new Error(errorMsg || 'Registration failed. Please check your information and try again.');
        }
      } else if (error.response?.status === 409) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || '';
        if (errorMsg.includes('email')) {
          throw new Error('This email address is already registered. Please use a different email.');
        } else if (errorMsg.includes('username')) {
          throw new Error('This username is already taken. Please choose a different username.');
        } else {
          throw new Error('This email or username is already registered. Please use different credentials.');
        }
      } else if (error.response?.status === 500) {
        throw new Error('Server error occurred during registration. Please try again in a few moments.');
      } else if (error.response?.status === 422) {
        throw new Error('Invalid registration data. Please check all required fields and try again.');
      } else if (!error.response) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
      }

      throw new Error(error.response?.data?.error || error.message || 'Registration failed. Please try again.');
    }
  },

  verifyEmail: async (token: string) => {
    const response = await api.get(`/auth/verify-email/${token}`);
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

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken?: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 API: Refresh token failed:', errorText);
      throw new Error('Token refresh failed');
    }

    return response.json();
  },

  async forgotPassword(email: string) {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send password reset email');
    }

    return response.json();
  },

  async resetPassword(token: string, newPassword: string) {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to reset password');
    }

    return response.json();
  },

  async updateProfile(updates: any, token: string) {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update profile');
    }

    return response.json();
  },

  async changePassword(currentPassword: string, newPassword: string, token: string) {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to change password');
    }

    return response.json();
  },
};

// QR Code endpoints
export const qrCodeAPI = {
  getAll: async () => {
    const response = await api.get('/qr-codes');
    return response.data;
  },

  create: async (qrData: any) => {
    const response = await api.post('/qr-codes', qrData);
    return response.data;
  },

  update: async (id: number, updates: any) => {
    const response = await api.put(`/qr-codes/${id}`, updates);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/qr-codes/${id}`);
    return response.data;
  }
};

// Stripe endpoints
export const stripeAPI = {
  getProducts: async () => {
    const response = await api.get('/stripe/products');
    return response.data;
  },

  createCheckoutSession: async (priceId: string, quantity: number = 1) => {
    const response = await api.post('/stripe/create-checkout-session', {
      priceId,
      quantity
    });
    return response.data;
  },

  createPaymentIntent: async (amount: number, currency: string = 'usd') => {
    const response = await api.post('/stripe/create-payment-intent', {
      amount,
      currency
    });
    return response.data;
  }
};

// Analytics endpoints
export const analyticsAPI = {
  getSummary: async () => {
    const response = await api.get('/analytics/summary');
    return response.data;
  }
};

// Playlist endpoints
export const playlistAPI = {
  getAll: async () => {
    const response = await api.get('/playlists');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/playlists/${id}`);
    return response.data;
  },

  create: async (playlistData: {
    name: string;
    description?: string;
    mediaFileIds?: number[];
    requiresActivationCode?: boolean;
    isPublic?: boolean;
  }) => {
    const response = await api.post('/playlists', playlistData);
    return response.data;
  },

  update: async (id: string, updates: {
    name?: string;
    description?: string;
    requiresActivationCode?: boolean;
    isPublic?: boolean;
  }) => {
    const response = await api.put(`/playlists/${id}`, updates);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/playlists/${id}`);
    return response.data;
  }
};

// Media endpoints
export const mediaAPI = {
  getAll: async () => {
    const response = await api.get('/media');
    return response.data;
  },

  upload: async (mediaData: any) => {
    const response = await api.post('/media', mediaData);
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/media/${id}`);
    return response.data;
  },

  delete: async (id: number) => {
    try {
      const response = await api.delete(`/media/${id}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error('Media file not found or already deleted');
      } else if (error.response?.status === 403) {
        throw new Error('You do not have permission to delete this file');
      } else if (!error.response) {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }

      throw error;
    }
  }
};

// Admin endpoints
export const adminAPI = {
  getUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  }
};

const getApiBaseUrl = (): string => {
  // For development, we need to use the Replit domain with the correct port
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;

  if (replitDomain) {
    return `https://${replitDomain}/api`;
  }

  // Fallback for local development  
  return 'http://localhost:5000/api';
};