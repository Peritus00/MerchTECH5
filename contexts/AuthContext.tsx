import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { User } from '@/types';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
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
  });

  // Initialize authentication state on app start
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const currentUser = await authService.getCurrentUser();

      if (currentUser) {
        setState({
          user: currentUser,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
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

      const response = await authService.register({
        email,
        password,
        username
      });

      if (response.success && response.user && response.token) {
        setState({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
        return { success: true };
      } else {
        return { success: false, error: 'Registration failed - invalid server response' };
      }
    } catch (error: any) {
      console.error('Registration failed:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { 
        success: false, 
        error: error.message || 'Registration failed. Please try again.' 
      };
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const logout = async () => {
    console.log('🔴 AuthContext: Starting logout process...');
    console.log('🔴 AuthContext: Current state before logout:', {
      user: state.user?.username,
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading
    });
    
    // Step 1: Immediately clear authentication state to prevent UI delays
    console.log('🔴 AuthContext: Immediately clearing authentication state...');
    const loggedOutState = {
      user: null,
      isAuthenticated: false,
      isLoading: true, // Keep loading true while cleaning up
      isInitialized: true,
    };
    setState(loggedOutState);
    console.log('🔴 AuthContext: State immediately set to:', loggedOutState);
    
    try {
      // Step 2: Clear auth service data in background
      console.log('🔴 AuthContext: Calling authService.logout()...');
      await authService.logout();
      console.log('🔴 AuthContext: authService.logout() completed');
      
      // Step 3: Set final logged out state
      console.log('🔴 AuthContext: Setting final logged out state...');
      const finalState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      };
      setState(finalState);
      console.log('🔴 AuthContext: Final state set to:', finalState);
      
      // Step 4: Navigate to login
      console.log('🔴 AuthContext: Navigating to login...');
      router.replace('/auth/login');
      console.log('🔴 AuthContext: Navigation completed');
      
    } catch (error) {
      console.error('🔴 AuthContext: Error during logout cleanup:', error);
      console.error('🔴 AuthContext: Error stack:', error.stack);
      
      // Ensure state is still cleared even on error
      const errorState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      };
      setState(errorState);
      console.log('🔴 AuthContext: Error state set to:', errorState);
      
      // Force navigation even on cleanup error
      console.log('🔴 AuthContext: Force navigating to login due to cleanup error...');
      router.replace('/auth/login');
      
      // Don't re-throw the error since logout should always succeed from UI perspective
      console.log('🔴 AuthContext: Logout completed despite cleanup error');
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