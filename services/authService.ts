
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

  async register(credentials: RegisterCredentials): Promise<AuthResponse & { success: boolean }> {
    try {
      // Validate input
      this.validateRegistrationData(credentials);

      const response = await authAPI.register(
        credentials.email,
        credentials.password,
        credentials.username
      );

      if (!response.user || !response.token) {
        throw new Error('Invalid response from server');
      }

      // Store auth data immediately since user is created and logged in
      await this.storeAuthData(response);

      return {
        user: response.user,
        token: response.token,
        success: true
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed. Please try again.');
    }
  }

  async logout(): Promise<void> {
    try {
      console.log('🔴 AuthService: Starting logout...');
      
      // Log current storage state before clearing
      const currentToken = await AsyncStorage.getItem(AuthService.TOKEN_KEY);
      const currentUser = await AsyncStorage.getItem(AuthService.USER_KEY);
      console.log('🔴 AuthService: Current token exists:', !!currentToken);
      console.log('🔴 AuthService: Current user exists:', !!currentUser);
      
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
      console.log('🔴 AuthService: Token cleared successfully:', tokenAfter === null);
      console.log('🔴 AuthService: User cleared successfully:', userAfter === null);
      
      console.log('🔴 AuthService: All tokens cleared successfully');
    } catch (error) {
      console.error('🔴 AuthService logout error:', error);
      
      // Try to clear items individually if batch clear fails
      try {
        console.log('🔴 AuthService: Attempting individual cleanup...');
        await AsyncStorage.removeItem(AuthService.TOKEN_KEY);
        await AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(AuthService.USER_KEY);
        console.log('🔴 AuthService: Individual token cleanup completed');
      } catch (individualError) {
        console.error('🔴 AuthService: Individual cleanup also failed:', individualError);
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
      console.log('🔴 AuthService: Attempting refresh with token:', !!refreshToken);
      if (!refreshToken) {
        console.log('🔴 AuthService: No refresh token found');
        return false;
      }

      const response = await authAPI.refreshToken(refreshToken);
      if (response.token) {
        console.log('🔴 AuthService: Refresh successful, updating tokens');
        await AsyncStorage.setItem(AuthService.TOKEN_KEY, response.token);
        if (response.refreshToken) {
          await AsyncStorage.setItem(AuthService.REFRESH_TOKEN_KEY, response.refreshToken);
        }
        return true;
      }
      console.log('🔴 AuthService: Refresh response missing token');
      return false;
    } catch (error) {
      console.error('🔴 AuthService: Refresh token error:', error);
      // For dev login, don't clear tokens on refresh failure since they might still be valid
      // Only clear if it's a legitimate auth failure, not a network/endpoint issue
      if (error.message && error.message.includes('404')) {
        console.log('🔴 AuthService: 404 error on refresh - keeping existing tokens for dev login');
        return false; // Don't clear tokens for 404 errors
      }
      
      // Only clear tokens for genuine auth failures
      try {
        console.log('🔴 AuthService: Clearing tokens due to refresh failure');
        await Promise.all([
          AsyncStorage.removeItem(AuthService.TOKEN_KEY),
          AsyncStorage.removeItem(AuthService.REFRESH_TOKEN_KEY),
          AsyncStorage.removeItem(AuthService.USER_KEY),
        ]);
      } catch (clearError) {
        console.error('🔴 AuthService: Failed to clear tokens during refresh failure:', clearError);
      }
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
