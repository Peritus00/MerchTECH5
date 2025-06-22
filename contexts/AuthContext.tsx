import React, { createContext, useContext, useState, useEffect } from 'react';
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
  register: (email: string, password: string, username: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple singleton to prevent multiple initializations
let isAuthInitialized = false;
let authPromise: Promise<void> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  // Initialize auth only once across the entire app
  useEffect(() => {
    if (isAuthInitialized && authPromise) {
      // If already initializing, wait for it
      authPromise.then(() => {
        setIsLoading(false);
        setIsInitialized(true);
      });
      return;
    }

    if (isAuthInitialized) {
      // Already initialized, just update local state
      setIsLoading(false);
      setIsInitialized(true);
      return;
    }

    // Mark as initializing and start the process
    isAuthInitialized = true;
    authPromise = initializeAuth();

    authPromise.finally(() => {
      authPromise = null;
    });
  }, []);

  // Handle navigation only when auth is ready
  useEffect(() => {
    if (!isInitialized || isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const isAuthenticated = !!user;

    console.log('🔴 Auth navigation check:', { isAuthenticated, inAuthGroup, inSubscriptionGroup, segments });

    if (!isAuthenticated && !inAuthGroup && !inSubscriptionGroup) {
      console.log('🔴 Redirecting to login');
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('🔴 Redirecting to home');
      router.replace('/(tabs)');
    }
  }, [user, isInitialized, isLoading, segments[0]]);

  const initializeAuth = async () => {
    try {
      console.log('🔴 AuthContext: Starting initialization...');
      setIsLoading(true);

      const currentUser = await authService.getCurrentUser();
      console.log('🔴 AuthContext: Current user:', currentUser?.username || 'none');

      setUser(currentUser);
    } catch (error) {
      console.error('🔴 AuthContext: Init error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
      console.log('🔴 AuthContext: Initialization complete');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await authService.login({ email, password });
      setUser(response.user);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, username: string, firstName?: string, lastName?: string) => {
    try {
      setIsLoading(true);
      const response = await authService.register({
        email,
        password,
        username,
        firstName,
        lastName
      });
      setUser(response.user);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authService.logout();
      setUser(null);
      router.replace('/auth/login');
    } catch (error) {
      console.error('🔴 Auth: Logout error:', error);
      setUser(null);
      router.replace('/auth/login');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('🔴 Auth: Refresh error:', error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      isInitialized,
      login,
      register,
      logout,
      refreshUser,
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