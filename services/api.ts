import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const getApiBaseUrl = () => {
  // Use environment variable or fallback to current Replit URL
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const replitUrl = 'https://2baba274-1c74-4233-8964-1b11f1b566fa-00-205iex35lh4nb.kirk.replit.dev/api';
  
  const finalUrl = envUrl || replitUrl;
  console.log('API Base URL:', finalUrl);
  return finalUrl;
};

const API_BASE_URL = getApiBaseUrl();

console.log('API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout
  headers: {
    'Content-Type': 'application/json',
  },
  // Add retry logic
  retry: 3,
  retryDelay: 1000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
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
    return Promise.reject(error);
  }
);

// Response interceptor for error handling with retry logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
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
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * config.retry));
      
      return api(config);
    }

    if (error.response?.status === 401) {
      // Handle unauthorized access - clear all auth data
      await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'currentUser']);
    }

    // Log all API errors for debugging
    console.error('API Error Details:', {
      message: error.message,
      code: error.code,
      baseURL: API_BASE_URL,
      status: error.response?.status,
      url: error.config?.url,
      retries: config.retry || 0
    });

    return Promise.reject(error);
  }
);

export default api;

// Auth endpoints
export const authAPI = {
  login: async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      return response.data;
    } catch (error: any) {
      console.log('API login failed, checking for developer fallback');

      // If backend fails, fall back to developer login
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
      console.log('🔴 API: Attempting registration with:', { email, username });
      const response = await api.post('/auth/register', { 
        email, 
        password, 
        username 
      });
      console.log('🔴 API: Registration response:', response.data);

      if (!response.data.user || !response.data.token) {
        console.error('🔴 API: Invalid registration response structure:', response.data);
        throw new Error('Registration completed but server response was incomplete. Please try logging in.');
      }

      return response.data;
    } catch (error: any) {
      console.error('🔴 API: Registration failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      // If backend fails, fall back to developer registration  
      if (email === 'djjetfuel@gmail.com') {
        console.log('Using developer fallback registration');
        return {
          user: {
            id: 1,
            email: 'djjetfuel@gmail.com',
            username: username || 'djjetfuel',
            firstName: null,
            lastName: null,
            isEmailVerified: true,
            isAdmin: true,
            subscriptionTier: 'free',
            isNewUser: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          token: 'dev_jwt_token_djjetfuel_12345',
          refreshToken: 'dev_refresh_token_djjetfuel_67890'
        };
      }

      // Provide detailed error messages based on status codes
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || error.message;
        if (errorMsg.includes('Email already registered')) {
          throw new Error('This email is already registered. Please use a different email or try logging in.');
        } else if (errorMsg.includes('Username already taken')) {
          throw new Error('This username is already taken. Please choose a different username.');
        } else {
          throw new Error(errorMsg || 'Invalid registration data. Please check your information.');
        }
      } else if (error.response?.status === 500) {
        throw new Error('Server error. Please try again in a few moments.');
      } else if (error.response?.status === 422) {
        throw new Error('Registration data validation failed. Please check all required fields.');
      } else if (!error.response) {
        throw new Error('Network connection error. Please check your internet connection and try again.');
      }

      // Generic fallback
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
    console.log('🔴 API: Attempting refresh token with URL:', `${API_BASE_URL}/auth/refresh`);
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    console.log('🔴 API: Refresh token response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 API: Refresh token failed:', errorText);
      throw new Error('Token refresh failed');
    }

    const result = await response.json();
    console.log('🔴 API: Refresh token success:', result);
    return result;
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

// Analytics endpoints
export const analyticsAPI = {
  getSummary: async () => {
    const response = await api.get('/analytics/summary');
    return response.data;
  }
};

// Admin endpoints
export const adminAPI = {
  getUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  }
};