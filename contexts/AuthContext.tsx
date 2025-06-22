import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

// Singleton to prevent multiple auth contexts
let authContextInstance: any = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Prevent multiple instances
  if (authContextInstance) {
    return authContextInstance;
  }

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  const isAuthenticated = !!user;

  // Initialize auth on mount with debouncing
  useEffect(() => {
    console.log('🔴 AuthContext: Component mounted, initializing...');

    // Debounce initialization to prevent rapid re-initialization
    const timer = setTimeout(() => {
      initializeAuth();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Separate effect for route navigation with more stable dependencies
  useEffect(() => {
    if (!isInitialized || isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';

    // Only redirect on authentication state changes, not on every segment change
    if (!isAuthenticated && !inAuthGroup && !inSubscriptionGroup) {
      console.log('🔴 Route navigation: Redirecting unauthenticated user to login');
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('🔴 Route navigation: Redirecting authenticated user to home');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isInitialized, isLoading]); // Removed segments dependency to prevent constant re-renders

  const initializeAuth = async () => {
    if (isInitializing || isInitialized) {
      console.log('🔴 AuthContext: Skipping initialization - already in progress or completed');
      return;
    }

    try {
      setIsInitializing(true);
      setIsLoading(true);
      console.log('🔴 AuthContext: Starting authentication initialization...');

      const currentUser = await authService.getCurrentUser();
      console.log('🔴 AuthContext: Current user from storage:', currentUser);

      if (currentUser) {
        setUser(currentUser);
        console.log('🔴 AuthContext: User authenticated successfully:', currentUser.username);
      } else {
        console.log('🔴 AuthContext: No authenticated user found');
      }
    } catch (error) {
      console.error('🔴 AuthContext: Initialize auth error:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
      setIsInitializing(false);
      console.log('🔴 AuthContext: Authentication initialization completed');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      console.log('🔴 AuthContext: Starting login for:', email);

      const response = await authService.login({ email, password });
      console.log('🔴 AuthContext: Login successful:', response.user);

      setUser(response.user);
    } catch (error: any) {
      console.error('🔴 AuthContext: Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, username: string, firstName?: string, lastName?: string) => {
    try {
      setIsLoading(true);
      console.log('🔴 AuthContext: Starting registration for:', email);

      const response = await authService.register({
        email,
        password,
        username,
        firstName,
        lastName
      });

      console.log('🔴 AuthContext: Registration successful:', response.user);
      setUser(response.user);
    } catch (error: any) {
      console.error('🔴 AuthContext: Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      console.log('🔴 AuthContext: Starting logout...');

      await authService.logout();
      setUser(null);

      console.log('🔴 AuthContext: Logout completed successfully');
      router.replace('/auth/login');
    } catch (error) {
      console.error('🔴 AuthContext: Logout error:', error);
      // Even if logout fails, clear local state
      setUser(null);
      router.replace('/auth/login');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      console.log('🔴 AuthContext: Refreshing user data...');
      const currentUser = await authService.getCurrentUser();

      if (currentUser) {
        setUser(currentUser);
        console.log('🔴 AuthContext: User data refreshed:', currentUser.username);
      } else {
        console.log('🔴 AuthContext: No user found during refresh');
        setUser(null);
      }
    } catch (error) {
      console.error('🔴 AuthContext: Refresh user error:', error);
      setUser(null);
    }
  };

  const contextValue = (
    <AuthContext.Provider value={{
        user,
        isAuthenticated,
        isLoading,
        isInitialized,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );

  // Store instance to prevent duplicates
  authContextInstance = contextValue;

  return contextValue;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}