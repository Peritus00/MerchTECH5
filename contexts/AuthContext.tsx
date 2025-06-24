import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSegments } from 'expo-router';
import { User } from '@/types';
import { authService } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, firstName?: string, lastName?: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global singleton to prevent multiple initializations across hot reloads
let globalAuthState = {
  isInitialized: false,
  isInitializing: false,
  user: null as User | null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Check for existing authentication on mount
  useEffect(() => {
    if (!initialized) {
      checkAuthState();
    }
  }, [initialized]);

  const checkAuthState = async () => {
    if (initialized) return;

    console.log('🔴 AuthContext: Starting initialization...');

    try {
      setIsLoading(true);
      const currentUser = await authService.getCurrentUser();

      if (currentUser) {
        console.log('🔴 AuthContext: Current user:', currentUser.username);
        setUser(currentUser);
      } else {
        console.log('🔴 AuthContext: Current user:', 'none');
        setUser(null);
      }
    } catch (error) {
      console.error('🔴 AuthContext: Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
      setInitialized(true);
      console.log('🔴 AuthContext: Initialization complete');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await authService.login({ email, password });
      globalAuthState.user = response.user;
      setUser(response.user);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, username: string, firstName?: string, lastName?: string) => {
    setIsLoading(true);
    try {
      console.log('🔴 Auth: Starting registration for:', email);
      const authResponse = await authService.register({ email, password, username, firstName, lastName });

      // Registration now returns auth response with user and token
      console.log('🔴 Auth: Registration successful, user logged in:', authResponse.user.username);
      globalAuthState.user = authResponse.user;
      setUser(authResponse.user);

      return { success: true, user: authResponse.user };
    } catch (error: any) {
      console.error('🔴 Auth: Registration error:', error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authService.logout();
      globalAuthState.user = null;
      setUser(null);
      router.replace('/auth/login');
    } catch (error) {
      console.error('🔴 Auth: Logout error:', error);
      globalAuthState.user = null;
      setUser(null);
      router.replace('/auth/login');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      globalAuthState.user = currentUser;
      setUser(currentUser);
    } catch (error) {
      console.error('🔴 Auth: Refresh error:', error);
      globalAuthState.user = null;
      setUser(null);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      const updatedUser = await authService.updateProfile(updates);
      globalAuthState.user = updatedUser;
      setUser(updatedUser);
      return { success: true };
    } catch (error: any) {
      console.error('🔴 Auth: Update profile error:', error);
      return { success: false, error: error.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      isInitialized: initialized,
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}