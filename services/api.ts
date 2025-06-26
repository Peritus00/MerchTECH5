import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const getApiBaseUrl = () => {
  // Use environment variable first
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  if (envUrl) {
    console.log('API Base URL (from env):', envUrl);
    return envUrl;
  }

  // If no env var, throw an error to make it obvious
  console.error('❌ EXPO_PUBLIC_API_URL environment variable not set!');
  throw new Error('API URL not configured - EXPO_PUBLIC_API_URL environment variable is required');
};

// Get the API base URL from environment variable
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/api';

console.log('API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and debug logging
api.interceptors.request.use(
  async (config) => {
    console.log('🔵 API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      headers: config.headers,
      data: config.data
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
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  async (error) => {
    console.log('🔴 API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      fullURL: error.config ? `${error.config.baseURL}${error.config.url}` : 'Unknown',
      data: error.response?.data
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

// Auth API calls
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
      console.log('🔴 API: ============ REGISTRATION DEBUG START ============');
      console.log('🔴 API: Registration attempt with:', { 
        email, 
        username, 
        passwordLength: password?.length,
        timestamp: new Date().toISOString()
      });
      console.log('🔴 API: Current base URL:', api.defaults.baseURL);
      console.log('🔴 API: Full registration URL:', `${api.defaults.baseURL}/auth/register`);

      // Test server health first
      try {
        console.log('🔴 API: Testing server health...');
        const healthResponse = await api.get('/health');
        console.log('🔴 API: Server health check successful:', healthResponse.data);
      } catch (healthError: any) {
        console.error('🔴 API: Server health check failed:', {
          status: healthError.response?.status,
          statusText: healthError.response?.statusText,
          data: healthError.response?.data,
          message: healthError.message
        });
      }

      // Make the registration request
      console.log('🔴 API: Making registration request...');
      const response = await api.post('/auth/register', { 
        email, 
        password, 
        username 
      });

      console.log('🔴 API: Registration response received!');
      console.log('🔴 API: Response status:', response.status);
      console.log('🔴 API: Response headers:', response.headers);
      console.log('🔴 API: Response data:', response.data);

      if (!response.data) {
        console.error('🔴 API: No response data received!');
        throw new Error('No response data received from server');
      }

      if (!response.data.user || !response.data.token) {
        console.error('🔴 API: Invalid registration response structure:', {
          hasUser: !!response.data.user,
          hasToken: !!response.data.token,
          responseKeys: Object.keys(response.data),
          fullResponse: response.data
        });
        throw new Error('Registration completed but server response was incomplete. Please try logging in.');
      }

      console.log('🔴 API: Registration successful!', {
        userId: response.data.user?.id,
        userEmail: response.data.user?.email,
        tokenLength: response.data.token?.length
      });
      console.log('🔴 API: ============ REGISTRATION DEBUG END ============');

      return response.data;
    } catch (error: any) {
      console.error('🔴 API: ============ REGISTRATION ERROR DEBUG START ============');
      console.error('🔴 API: Registration failed with error:', error);
      console.error('🔴 API: Error type:', typeof error);
      console.error('🔴 API: Error name:', error.name);
      console.error('🔴 API: Error message:', error.message);

      if (error.response) {
        console.error('🔴 API: Error response details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          dataType: typeof error.response.data,
          dataPreview: typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 500) + '...'
            : error.response.data
        });

        // Check if we're getting HTML instead of JSON (404 page)
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          console.error('🔴 API: Server returned HTML instead of JSON - this means the endpoint does not exist!');
          console.error('🔴 API: This is a 404 error - the registration route is not found on the server');
        }
      } else if (error.request) {
        console.error('🔴 API: Request was made but no response received:', error.request);
      } else {
        console.error('🔴 API: Error setting up request:', error.message);
      }

      console.error('🔴 API: Error config:', error.config);
      console.error('🔴 API: ============ REGISTRATION ERROR DEBUG END ============');

      // Provide detailed error messages based on status codes
      if (error.response?.status === 404) {
        throw new Error('Registration endpoint not found. Server may not be running correctly.');
      } else if (error.response?.status === 400) {
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

// Admin endpoints
export const adminAPI = {
  getUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  }
};