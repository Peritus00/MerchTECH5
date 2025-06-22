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
  const logoutDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const forceLogoutUntilRef = useRef(0);

  const initializeAuth = async () => {
    // Check if we're in forced logout period
    if (Date.now() < forceLogoutUntilRef.current) {
      console.log('BLOCKED: Still in forced logout period');
      return;
    }

    // Check for nuclear logout flags
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const nuclearFlag = await AsyncStorage.getItem('NUCLEAR_LOGOUT_FLAG');
      const logoutTimestamp = await AsyncStorage.getItem('LOGOUT_TIMESTAMP');
      
      if (nuclearFlag === 'true') {
        const timestamp = parseInt(logoutTimestamp || '0');
        const timeSinceLogout = Date.now() - timestamp;
        
        if (timeSinceLogout < 12000) { // Block for 12 seconds
          console.log('NUCLEAR BLOCKED: Nuclear logout flag is active', {
            timeSinceLogout,
            remainingTime: 12000 - timeSinceLogout
          });
          return;
        } else {
          // Auto-cleanup expired nuclear flags
          await AsyncStorage.removeItem('NUCLEAR_LOGOUT_FLAG');
          await AsyncStorage.removeItem('LOGOUT_TIMESTAMP');
          console.log('NUCLEAR CLEANUP: Expired nuclear flags removed');
        }
      }
    } catch (error) {
      console.error('Error checking nuclear logout flags:', error);
    }
    
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
      console.log('NUCLEAR LOGOUT: Starting complete system shutdown...');
      
      // STEP 0: Clear any existing debounce
      if (logoutDebounceRef.current) {
        clearTimeout(logoutDebounceRef.current);
      }
      
      // STEP 1: Set PERSISTENT logout flag in storage FIRST
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem('NUCLEAR_LOGOUT_FLAG', 'true');
      await AsyncStorage.setItem('LOGOUT_TIMESTAMP', Date.now().toString());
      console.log('NUCLEAR: Persistent flags set');
      
      // STEP 2: Set forced logout period for 12 seconds
      forceLogoutUntilRef.current = Date.now() + 12000;
      
      // STEP 3: IMMEDIATELY block ALL authentication everywhere
      isLoggingOutRef.current = true;
      const { authAPI } = await import('@/services/api');
      authAPI.lockAuthentication();
      authAPI.setLoggingOut(true);
      console.log('NUCLEAR: All authentication blocked');
      
      // STEP 4: Complete AsyncStorage wipe (except our nuclear flags)
      const nuclearFlag = await AsyncStorage.getItem('NUCLEAR_LOGOUT_FLAG');
      const timestamp = await AsyncStorage.getItem('LOGOUT_TIMESTAMP');
      await AsyncStorage.clear();
      if (nuclearFlag) {
        await AsyncStorage.setItem('NUCLEAR_LOGOUT_FLAG', 'true');
        await AsyncStorage.setItem('LOGOUT_TIMESTAMP', timestamp || Date.now().toString());
      }
      console.log('NUCLEAR: Complete storage wipe completed');

      // STEP 5: Nuclear state reset with forced logout flag
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        isLoggingOut: true, // Keep this true to prevent any auth attempts
      });
      console.log('NUCLEAR: State reset with logout flag active');

      // STEP 6: Clear auth service data
      await authService.logout();
      console.log('NUCLEAR: Auth service cleared');

      // STEP 7: Complete router reset and navigation
      router.dismissAll(); // Clear entire navigation stack
      setTimeout(() => {
        router.replace('/auth/login');
        console.log('NUCLEAR: Router completely reset to login');
      }, 100);
      
      // STEP 8: Extended recovery after 12 seconds
      logoutDebounceRef.current = setTimeout(async () => {
        console.log('NUCLEAR RECOVERY: Starting system recovery...');
        const AsyncStorage = require('@react-native-async-storage/async-storage');
        await AsyncStorage.removeItem('NUCLEAR_LOGOUT_FLAG');
        await AsyncStorage.removeItem('LOGOUT_TIMESTAMP');
        isLoggingOutRef.current = false;
        authAPI.setLoggingOut(false);
        authAPI.unlockAuthentication();
        forceLogoutUntilRef.current = 0;
        
        // Final state cleanup
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
          isLoggingOut: false,
        });
        
        console.log('NUCLEAR RECOVERY: Complete system recovery finished');
      }, 12000);

    } catch (error) {
      console.error('NUCLEAR LOGOUT ERROR:', error);

      // Even if everything fails, force nuclear reset
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const nuclearFlag = await AsyncStorage.getItem('NUCLEAR_LOGOUT_FLAG');
      const timestamp = Date.now().toString();
      await AsyncStorage.clear();
      await AsyncStorage.setItem('NUCLEAR_LOGOUT_FLAG', 'true');
      await AsyncStorage.setItem('LOGOUT_TIMESTAMP', timestamp);
      
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        isLoggingOut: true,
      });

      // Nuclear navigation reset
      router.dismissAll();
      setTimeout(() => router.replace('/auth/login'), 100);
      
      // Nuclear recovery timer
      forceLogoutUntilRef.current = Date.now() + 12000;
      const { authAPI } = await import('@/services/api');
      logoutDebounceRef.current = setTimeout(async () => {
        await AsyncStorage.removeItem('NUCLEAR_LOGOUT_FLAG');
        await AsyncStorage.removeItem('LOGOUT_TIMESTAMP');
        isLoggingOutRef.current = false;
        authAPI.setLoggingOut(false);
        authAPI.unlockAuthentication();
        forceLogoutUntilRef.current = 0;
        setState(prev => ({ ...prev, isLoggingOut: false }));
        console.log('NUCLEAR ERROR RECOVERY: All systems restored');
      }, 12000);
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