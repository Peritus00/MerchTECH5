
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_BASE_URL || (__DEV__ 
  ? 'https://jsonplaceholder.typicode.com' 
  : 'https://your-production-url.com/api');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      await AsyncStorage.removeItem('authToken');
      // You might want to navigate to login screen here
    }
    return Promise.reject(error);
  }
);

export default api;
// Email verification endpoint
export const verifyEmail = async (token: string): Promise<{ success: boolean; message: string }> => {
  try {
    // In a real app, this would make an API call to your backend
    // For now, we'll simulate the verification process
    
    // Mock verification logic
    if (token && token.length >= 6) {
      return {
        success: true,
        message: 'Email verified successfully!'
      };
    } else {
      return {
        success: false,
        message: 'Invalid verification token'
      };
    }
  } catch (error) {
    console.error('Email verification error:', error);
    return {
      success: false,
      message: 'Verification failed. Please try again.'
    };
  }
};

// Resend verification email
export const resendVerificationEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    // This would call your backend to resend the verification email
    return {
      success: true,
      message: 'Verification email sent successfully!'
    };
  } catch (error) {
    console.error('Resend verification error:', error);
    return {
      success: false,
      message: 'Failed to resend verification email'
    };
  }
};
