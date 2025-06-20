
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { User } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
}

export const authService = {
  // Login user
  async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    const response = await api.post('/auth/login', credentials);
    const { user, token } = response.data;
    
    // Store token locally
    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    
    return { user, token };
  },

  // Register user
  async register(data: RegisterData): Promise<{ user: User; token: string }> {
    const response = await api.post('/auth/register', data);
    const { user, token } = response.data;
    
    // Store token locally
    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    
    return { user, token };
  },

  // Get current user
  async getCurrentUser(): Promise<User | null> {
    try {
      const userStr = await AsyncStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      return null;
    }
  },

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return !!token;
    } catch (error) {
      return false;
    }
  },

  // Logout user
  async logout(): Promise<void> {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('user');
  },

  // Refresh user data
  async refreshUser(): Promise<User> {
    const response = await api.get('/user');
    const user = response.data;
    await AsyncStorage.setItem('user', JSON.stringify(user));
    return user;
  },
};
