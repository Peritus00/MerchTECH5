
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
      console.log('🔴 AuthService: Attempting login for:', credentials.email);
      const response = await authAPI.login(credentials.email, credentials.password);
      console.log('🔴 AuthService: Login API response:', response);

      if (!response.token || !response.user) {
        throw new Error('Invalid response from server');
      }

      // Store authentication data
      console.log('🔴 AuthService: Storing auth data...');
      await this.storeAuthData(response);
      console.log('🔴 AuthService: Auth data stored successfully');

      return response;
    } catch (error: any) {
      console.error('🔴 AuthService: Login error:', error);
      throw new Error(error.message || 'Login failed. Please check your credentials.');
    }
  }

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      // Validate input
      this.validateRegistrationData(credentials);

      console.log('🔴 AuthService: Attempting registration for:', credentials.email);
      const response = await authAPI.register(
        credentials.email,
        credentials.password,
        credentials.username
      );

      if (!response.user || !response.token) {
        console.error('🔴 AuthService: Invalid registration response:', response);
        throw new Error('Registration completed but server response was invalid. Please try logging in.');
      }

      // Store authentication data for new user
      console.log('🔴 AuthService: Storing registration auth data...');
      await this.storeAuthData(response);
      console.log('🔴 AuthService: Registration auth data stored successfully');

      return response;
    } catch (error: any) {
      console.error('🔴 AuthService: Registration error:', error);
      console.error('🔴 AuthService: Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Provide more specific error messages based on the actual error
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.error || error.message;
        if (errorMessage.includes('Email already registered') || errorMessage.includes('already exists')) {
          throw new Error('This email is already registered. Please use a different email or try logging in.');
        } else if (errorMessage.includes('Username already taken') || errorMessage.includes('username')) {
          throw new Error('This username is already taken. Please choose a different username.');
        } else {
          throw new Error(errorMessage || 'Registration failed. Please check your information and try again.');
        }
      } else if (error.response?.status === 500) {
        throw new Error('Server error occurred during registration. Please try again in a few moments.');
      } else if (error.message.includes('network') || error.message.includes('Network') || !error.response) {
        throw new Error('Network connection error. Please check your internet connection and try again.');
      } else if (error.response?.status === 422) {
        throw new Error('Invalid registration data. Please check all fields and try again.');
      }
      
      // Fallback error message
      const fallbackMessage = error.response?.data?.error || error.message || 'Registration failed for an unknown reason.';
      throw new Error(fallbackMessage);
    }
  }

  async logout(): Promise<void> {
    try {
      console.log('🔴 AuthService: Starting logout...');
      
      // Log current storage state before clearing
      const currentToken = await AsyncStorage.getItem(AuthService.TOKEN_KEY);
      const currentUser = await AsyncStorage.getItem(AuthService.USER_KEY);
      const currentRefresh = await AsyncStorage.getItem(AuthService.REFRESH_TOKEN_KEY);
      console.log('🔴 AuthService: Current token exists:', !!currentToken);
      console.log('🔴 AuthService: Current user exists:', !!currentUser);
      console.log('🔴 AuthService: Current refresh token exists:', !!currentRefresh);
      
      // Clear all stored authentication data
      console.log('🔴 AuthService: Clearing all authentication data...');
      await Promise.all([
        AsyncStorage.removeItem(AuthService.TOKEN_KEY),
        AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY),
        AsyncStorage.removeItem(AuthService.USER_KEY),
      ]);
      
      // Verify clearing was successful
      const tokenAfter = await AsyncStorage.getItem(AuthService.TOKEN_KEY);
      const userAfter = await AsyncStorage.getItem(AuthService.USER_KEY);
      const refreshAfter = await AsyncStorage.getItem(AuthService.REFRESH_TOKEN_KEY);
      console.log('🔴 AuthService: Token cleared successfully:', tokenAfter === null);
      console.log('🔴 AuthService: User cleared successfully:', userAfter === null);
      console.log('🔴 AuthService: Refresh token cleared successfully:', refreshAfter === null);
      
      // Also try to clear all AsyncStorage to be absolutely sure
      console.log('🔴 AuthService: Performing complete AsyncStorage clear for auth data...');
      const allKeys = await AsyncStorage.getAllKeys();
      const authKeys = allKeys.filter(key => 
        key === AuthService.TOKEN_KEY || 
        key === AuthService.REFRESH_TOKEN_KEY || 
        key === AuthService.USER_KEY
      );
      
      if (authKeys.length > 0) {
        await AsyncStorage.multiRemove(authKeys);
        console.log('🔴 AuthService: Removed additional auth keys:', authKeys);
      }
      
      console.log('🔴 AuthService: All tokens cleared successfully');
    } catch (error) {
      console.error('🔴 AuthService logout error:', error);
      
      // Try to clear items individually if batch clear fails
      try {
        console.log('🔴 AuthService: Attempting individual cleanup...');
        await AsyncStorage.removeItem(AuthService.TOKEN_KEY);
        await AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(AuthService.USER_KEY);
        
        // Also try clearing with multiRemove as fallback
        await AsyncStorage.multiRemove([
          AuthService.TOKEN_KEY,
          AuthService.REFRESH_TOKEN_KEY,
          AuthService.USER_KEY
        ]);
        
        console.log('🔴 AuthService: Individual token cleanup completed');
      } catch (individualError) {
        console.error('🔴 AuthService: Individual cleanup also failed:', individualError);
        
        // Last resort - clear all AsyncStorage
        try {
          console.log('🔴 AuthService: Attempting complete AsyncStorage clear...');
          await AsyncStorage.clear();
          console.log('🔴 AuthService: Complete AsyncStorage clear successful');
        } catch (clearAllError) {
          console.error('🔴 AuthService: Complete clear also failed:', clearAllError);
        }
      }
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
      // Don't call logout here as it can create circular dependencies
      // Just return null and let the auth context handle the state
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
    } catch (error: any) {
      console.error('🔴 AuthService: Refresh token error:', error);
      
      // Only clear tokens for actual auth failures, not network/server errors
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        try {
          await Promise.all([
            AsyncStorage.removeItem(AuthService.TOKEN_KEY),
            AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY),
            AsyncStorage.removeItem(AuthService.USER_KEY),
          ]);
        } catch (clearError) {
          console.error('🔴 AuthService: Failed to clear tokens:', clearError);
        }
      }
      
      return false;
    }
  }

  async verifyEmailToken(token: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔴 AuthService: Verifying email token:', token.substring(0, 20) + '...');
      
      // Try direct API call for URL-based tokens first
      if (token.length > 50) { // JWT tokens are longer than simple codes
        try {
          const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/verify-email/${token}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          const result = await response.json();
          console.log('🔴 AuthService: URL verification response:', result);
          
          if (result.success) {
            // Update stored user data if verification includes user data
            if (result.user) {
              await AsyncStorage.setItem(AuthService.USER_KEY, JSON.stringify(result.user));
            }
            return { success: true, message: result.message || 'Email verified successfully!' };
          }
        } catch (urlError) {
          console.log('🔴 AuthService: URL verification failed, trying POST method:', urlError);
        }
      }
      
      // Fallback to POST method for manual codes
      const response = await authAPI.verifyEmail(token);
      return response;
    } catch (error: any) {
      console.error('🔴 AuthService: Email verification error:', error);
      return {
        success: false,
        message: error.message || 'Verification failed. Please try again.'
      };
    }
  }

  async sendEmailVerificationAfterSubscription(email: string): Promise<{ success: boolean; message: string }> {
    try {
      await authAPI.sendVerification(email);
      return {
        success: true,
        message: 'Verification email sent successfully'
      };
    } catch (error: any) {
      console.error('Failed to send verification email:', error);
      return {
        success: false,
        message: error.message || 'Failed to send verification email'
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

      // Get current user data first
      const currentUserJson = await AsyncStorage.getItem(AuthService.USER_KEY);
      if (!currentUserJson) {
        throw new Error('No current user data found');
      }
      
      const currentUser = JSON.parse(currentUserJson);
      
      // Merge updates with current user data
      const updatedUser = { ...currentUser, ...updates };
      
      // Update stored user data immediately since the backend update already succeeded
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
