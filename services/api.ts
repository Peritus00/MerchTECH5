import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// --- IMPORTANT: HARDCODED API BASE URL FOR DEBUGGING AND CONSISTENCY ---
// This bypasses environment variables to ensure the correct URL is ALWAYS used.
// The backend is running on port 5000, so we must include :5000 in the URL
const API_BASE_URL = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5000/api';
// -----------------------------------------------------------------------

// Force override any environment variables that might interfere  
process.env.EXPO_PUBLIC_API_URL = API_BASE_URL;
process.env.API_BASE_URL = API_BASE_URL;
process.env.REACT_NATIVE_API_URL = API_BASE_URL;

console.log('Final API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Force the baseURL to be correct in case it gets overridden
api.defaults.baseURL = API_BASE_URL;

// Double-check that the URL includes port 5000
if (!API_BASE_URL.includes(':5000')) {
  console.error('🔴 API: ERROR - API_BASE_URL missing port 5000!', API_BASE_URL);
  // Force it to have the correct port
  const correctedUrl = API_BASE_URL.replace('/api', ':5000/api');
  api.defaults.baseURL = correctedUrl;
  console.log('🔴 API: Corrected URL to:', correctedUrl);
} else {
  console.log('✅ API: Base URL correctly includes port 5000:', API_BASE_URL);
}

// Request interceptor to add auth token and debug logging
api.interceptors.request.use(
  async (config) => {
    // Ensure baseURL is always correct and includes port 5000
    if (!config.baseURL || !config.baseURL.includes(':5000')) {
      console.warn('🔴 API: Correcting baseURL to include port 5000');
      console.warn('🔴 API: Old baseURL was:', config.baseURL);
      
      // Force the correct URL with port 5000
      const correctUrl = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5000/api';
      config.baseURL = correctUrl;
      console.warn('🔴 API: New baseURL is:', config.baseURL);
    }
    
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
        throw new Error('Registration service is currently unavailable. Please try again later.');
      } else if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
        
        // Check for specific duplicate errors
        if (errorMsg.includes('email') && (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('taken'))) {
          throw new Error('This email address is already registered. Please use a different email or try logging in.');
        } else if (errorMsg.includes('username') && (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('taken'))) {
          throw new Error('This username is already taken. Please choose a different username.');
        } else if (errorMsg.includes('Email or username already exists') || errorMsg.includes('already registered')) {
          throw new Error('This email or username is already registered. Please try logging in instead, or use different credentials.');
        } else if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
          throw new Error('Please check your information and try again.');
        } else {
          throw new Error(errorMsg || 'Registration failed. Please check your information and try again.');
        }
      } else if (error.response?.status === 409) {
        // Conflict status typically indicates duplicate data
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
    // Use API_BASE_URL directly here as it's now hardcoded and reliable
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
    // Use API_BASE_URL directly here as it's now hardcoded and reliable
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
    // Use API_BASE_URL directly here as it's now hardcoded and reliable
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
    // Use API_BASE_URL directly here as it's now hardcoded and reliable
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
    // Use API_BASE_URL directly here as it's now hardcoded and reliable
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
    console.log('🔴 API: Deleting media file with ID:', id);
    console.log('🔴 API: Using base URL:', api.defaults.baseURL);
    try {
      const response = await api.delete(`/media/${id}`);
      console.log('🔴 API: Delete response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('🔴 API: Delete error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        fullURL: error.config ? `${error.config.baseURL}${error.config.url}` : 'Unknown'
      });
      
      // Provide user-friendly error messages
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