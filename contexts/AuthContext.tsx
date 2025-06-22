import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { User } from '@/types';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  isLoggingOut: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message: string }>;
  resendVerification: (email: string) => Promise<{ success: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; user?: User; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isInitialized: false,
    isLoggingOut: false,
  });

  // Initialize authentication state on app start
  useEffect(() => {
    initializeAuth();
  }, []);

  // Prevent auth initialization during logout
  const isLoggingOutRef = useRef(false);

  const initializeAuth = async () => {
    try {
      // Don't initialize auth if we're in the middle of logging out
      if (state.isLoggingOut || isLoggingOutRef.current) {
        console.log('Skipping auth initialization - logout in progress');
        return;
      }

      setState(prev => ({ ...prev, isLoading: true }));
      
      // Check if there's existing auth data instead of clearing it
      const currentUser = await authService.getCurrentUser();
      
      if (currentUser) {
        setState({
          user: currentUser,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
          isLoggingOut: false,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          isLoggingOut: false,
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        isLoggingOut: false,
      });
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await authService.login({ email, password });

      setState({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Login failed:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { 
        success: false, 
        error: error.message || 'Login failed. Please try again.' 
      };
    }
  };

  const register = async (email: string, password: string, username: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await authService.register({ email, password, username });

      // If registration requires verification, don't authenticate yet
      if (response.message && !response.user) {
        setState(prev => ({ ...prev, isLoading: false }));
        return { success: true };
      }

      setState({
        user: { ...response.user, isNewUser: true },
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Registration failed:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { 
        success: false, 
        error: error.message || 'Registration failed. Please try again.' 
      };
    }
  };

  const logout = async () => {
    try {
      console.log('FINAL LOGOUT: Starting with complete authentication block...');
      
      // STEP 1: IMMEDIATELY block ALL authentication everywhere
      isLoggingOutRef.current = true;
      const { authAPI } = await import('@/services/api');
      authAPI.lockAuthentication();
      authAPI.setLoggingOut(true);
      
      // STEP 2: Force clear AsyncStorage FIRST
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      await AsyncStorage.clear();
      console.log('ULTIMATE: AsyncStorage completely cleared');

      // STEP 3: Update state to logged out immediately
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        isLoggingOut: false,
      });
      console.log('ULTIMATE: State reset to logged out');

      // STEP 4: Clear auth service data
      await authService.logout();
      console.log('ULTIMATE: Auth service cleared');

      // STEP 5: Force navigation immediately
      console.log('ULTIMATE: Forcing navigation to login...');
      router.replace('/auth/login');
      
      // STEP 6: Keep authentication locked for 10 seconds
      setTimeout(() => {
        isLoggingOutRef.current = false;
        authAPI.setLoggingOut(false);
        authAPI.unlockAuthentication();
        console.log('FINAL: Authentication unlocked after 10 seconds');
      }, 10000);

    } catch (error) {
      console.error('ULTIMATE LOGOUT ERROR:', error);

      // Even if everything fails, force the state reset
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      await AsyncStorage.clear();
      
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        isLoggingOut: false,
      });

      // Force navigation no matter what
      router.replace('/auth/login');
      
      // Reset flags
      const { authAPI } = await import('@/services/api');
      setTimeout(() => {
        isLoggingOutRef.current = false;
        authAPI.setLoggingOut(false);
        authAPI.unlockAuthentication();
      }, 10000);
    }
  };

  const verifyEmail = async (token: string) => {
    try {
      const result = await authService.verifyEmailToken(token);

      if (result.success && state.user) {
        const updatedUser = { ...state.user, isEmailVerified: true };
        setState(prev => ({ ...prev, user: updatedUser }));
      }

      return result;
    } catch (error: any) {
      console.error('Email verification failed:', error);
      return { 
        success: false, 
        message: error.message || 'Verification failed' 
      };
    }
  };

  const resendVerification = async (email: string) => {
    try {
      return await authService.resendEmailVerification(email);
    } catch (error: any) {
      console.error('Resend verification failed:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to resend verification email' 
      };
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      return await authService.forgotPassword(email);
    } catch (error: any) {
      console.error('Forgot password failed:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to send password reset email' 
      };
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    try {
      return await authService.resetPassword(token, newPassword);
    } catch (error: any) {
      console.error('Password reset failed:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to reset password' 
      };
    }
  };

  const updateProfile = async (updates: Partial<User>): Promise<{ success: boolean; user?: User; error?: string }> => {
    try {
      const updatedUser = await authService.updateProfile(updates);

      setState(prev => ({ ...prev, user: updatedUser }));

      return { success: true, user: updatedUser };
    } catch (error: any) {
      console.error('Profile update failed:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to update profile' 
      };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      return await authService.changePassword(currentPassword, newPassword);
    } catch (error: any) {
      console.error('Change password failed:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to change password' 
      };
    }
  };

  const refreshAuth = useCallback(async () => {
    await initializeAuth();
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    updateProfile,
    changePassword,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}