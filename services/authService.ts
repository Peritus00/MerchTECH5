import { User } from '@/types';
import { authAPI } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthResponse {
  user: User;
  token: string;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await authAPI.login(email, password);

      // Store token
      await AsyncStorage.setItem('authToken', response.token);

      return response;
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Login failed');
    }
  },

  async register(email: string, password: string, username?: string): Promise<AuthResponse> {
    try {
      const response = await authAPI.register(email, password, username);

      // Store token
      await AsyncStorage.setItem('authToken', response.token);

      return response;
    } catch (error) {
      console.error('Registration error:', error);
      throw new Error('Registration failed');
    }
  },

  async logout(): Promise<void> {
    try {
      await AsyncStorage.removeItem('authToken');
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return null;

      // You could add a /me endpoint to verify token and get current user
      return null;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await authAPI.verifyEmail(token);
      return response;
    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'Verification failed. Please try again.'
      };
    }
  },

  async resendEmailVerification(email: string): Promise<void> {
    try {
      await authAPI.resendVerification(email);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      throw new Error('Failed to resend verification email');
    }
  }
};