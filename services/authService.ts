
import { User } from '@/types';
import { authAPI } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  email: string;
  password: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

class AuthService {
  private static readonly TOKEN_KEY = 'authToken';
  private static readonly REFRESH_TOKEN_KEY = 'refreshToken';
  private static readonly USER_KEY = 'currentUser';

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await authAPI.login(credentials.email, credentials.password);

      if (!response.token || !response.user) {
        throw new Error('Invalid response from server');
      }

      // Store authentication data
      await this.storeAuthData(response);

      return response;
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Login failed. Please check your credentials.');
    }
  }

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateRegistrationData(credentials);

      const response = await authAPI.register(
        credentials.email,
        credentials.password,
        credentials.username
      );

      if (!response.token || !response.user) {
        throw new Error('Invalid response from server');
      }

      // Store authentication data
      await this.storeAuthData(response);

      return response;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed. Please try again.');
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear all stored authentication data
      await Promise.all([
        AsyncStorage.removeItem(AuthService.TOKEN_KEY),
        AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY),
        AsyncStorage.removeItem(AuthService.USER_KEY),
      ]);
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Failed to logout properly');
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem(AuthService.TOKEN_KEY),
        AsyncStorage.getItem(AuthService.USER_KEY),
      ]);

      if (!token || !userJson) {
        return null;
      }

      const user = JSON.parse(userJson);
      
      // Validate token is still valid
      if (await this.isTokenValid(token)) {
        return user;
      } else {
        // Token expired, try to refresh
        const refreshed = await this.refreshToken();
        return refreshed ? user : null;
      }
    } catch (error) {
      console.error('Get current user error:', error);
      await this.logout(); // Clear invalid data
      return null;
    }
  }

  async getStoredToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(AuthService.TOKEN_KEY);
    } catch (error) {
      console.error('Get stored token error:', error);
      return null;
    }
  }

  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await AsyncStorage.getItem(AuthService.REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        return false;
      }

      const response = await authAPI.refreshToken(refreshToken);
      if (response.token) {
        await AsyncStorage.setItem(AuthService.TOKEN_KEY, response.token);
        if (response.refreshToken) {
          await AsyncStorage.setItem(AuthService.REFRESH_TOKEN_KEY, response.refreshToken);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await authAPI.verifyEmail(token);
      return response;
    } catch (error: any) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: error.message || 'Verification failed. Please try again.'
      };
    }
  }

  async resendEmailVerification(email: string): Promise<{ success: boolean; message: string }> {
    try {
      await authAPI.resendVerification(email);
      return {
        success: true,
        message: 'Verification email sent successfully'
      };
    } catch (error: any) {
      console.error('Failed to resend verification email:', error);
      return {
        success: false,
        message: error.message || 'Failed to resend verification email'
      };
    }
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      await authAPI.forgotPassword(email);
      return {
        success: true,
        message: 'Password reset email sent successfully'
      };
    } catch (error: any) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        message: error.message || 'Failed to send password reset email'
      };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      await authAPI.resetPassword(token, newPassword);
      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error: any) {
      console.error('Password reset error:', error);
      return {
        success: false,
        message: error.message || 'Failed to reset password'
      };
    }
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    try {
      const token = await this.getStoredToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const updatedUser = await authAPI.updateProfile(updates, token);
      
      // Update stored user data
      await AsyncStorage.setItem(AuthService.USER_KEY, JSON.stringify(updatedUser));
      
      return updatedUser;
    } catch (error: any) {
      console.error('Profile update error:', error);
      throw new Error(error.message || 'Failed to update profile');
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getStoredToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      await authAPI.changePassword(currentPassword, newPassword, token);
      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error: any) {
      console.error('Change password error:', error);
      return {
        success: false,
        message: error.message || 'Failed to change password'
      };
    }
  }

  private async storeAuthData(authResponse: AuthResponse): Promise<void> {
    const promises = [
      AsyncStorage.setItem(AuthService.TOKEN_KEY, authResponse.token),
      AsyncStorage.setItem(AuthService.USER_KEY, JSON.stringify(authResponse.user)),
    ];

    if (authResponse.refreshToken) {
      promises.push(AsyncStorage.setItem(AuthService.REFRESH_TOKEN_KEY, authResponse.refreshToken));
    }

    await Promise.all(promises);
  }

  private validateRegistrationData(credentials: RegisterCredentials): void {
    if (!credentials.email || !credentials.email.includes('@')) {
      throw new Error('Please enter a valid email address');
    }

    if (!credentials.username || credentials.username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }

    if (!credentials.password || credentials.password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(credentials.password);
    const hasLowerCase = /[a-z]/.test(credentials.password);
    const hasNumbers = /\d/.test(credentials.password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw new Error('Password must contain uppercase, lowercase, and numbers');
    }
  }

  private async isTokenValid(token: string): Promise<boolean> {
    try {
      // You could implement a token validation endpoint
      // For now, just check if token exists and is not expired
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp > currentTime;
    } catch (error) {
      return false;
    }
  }
}

export const authService = new AuthService();
