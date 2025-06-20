import { User } from '@/types';

interface AuthResponse {
  user: User;
  token: string;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    // Mock authentication for development
    return Promise.resolve({
      user: {
        id: 1,
        email,
        username: email.split('@')[0],
        subscriptionTier: 'free',
        createdAt: new Date().toISOString()
      },
      token: 'mock-jwt-token'
    });
  },

  async register(email: string, password: string, username?: string): Promise<AuthResponse> {
    // Mock registration for development
    return Promise.resolve({
      user: {
        id: 1,
        email,
        username: username || email.split('@')[0],
        subscriptionTier: 'free',
        createdAt: new Date().toISOString()
      },
      token: 'mock-jwt-token'
    });
  },

  async logout(): Promise<void> {
    // Clear stored authentication
    return Promise.resolve();
  },

  async getCurrentUser(): Promise<User | null> {
    // Mock current user check
    return Promise.resolve(null);
  },

  async refreshToken(): Promise<string> {
    return Promise.resolve('new-mock-token');
  }
};