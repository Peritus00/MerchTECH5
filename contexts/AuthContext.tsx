
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

// Global singleton to prevent multiple initializations across hot reloads
let globalAuthState = {
  isInitialized: false,
  isInitializing: false,
  user: null as User | null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(globalAuthState.user);
  const [isLoading, setIsLoading] = useState(!globalAuthState.isInitialized);
  const [isInitialized, setIsInitialized] = useState(globalAuthState.isInitialized);
  const initializationRef = useRef(false);

  const router = useRouter();
  const segments = useSegments();

  // Single initialization effect
  useEffect(() => {
    // Prevent duplicate initialization
    if (initializationRef.current || globalAuthState.isInitialized || globalAuthState.isInitializing) {
      if (globalAuthState.isInitialized) {
        setUser(globalAuthState.user);
        setIsLoading(false);
        setIsInitialized(true);
      }
      return;
    }

    initializationRef.current = true;
    globalAuthState.isInitializing = true;
    
    console.log('🔴 AuthContext: Starting initialization...');
    
    const initializeAuth = async () => {
      try {
        setIsLoading(true);

        const currentUser = await authService.getCurrentUser();
        console.log('🔴 AuthContext: Current user:', currentUser?.username || 'none');

        globalAuthState.user = currentUser;
        globalAuthState.isInitialized = true;
        globalAuthState.isInitializing = false;
        
        setUser(currentUser);
      } catch (error) {
        console.error('🔴 AuthContext: Init error:', error);
        globalAuthState.user = null;
        globalAuthState.isInitialized = true;
        globalAuthState.isInitializing = false;
        setUser(null);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
        console.log('🔴 AuthContext: Initialization complete');
      }
    };

    initializeAuth();
  }, []);

  // Handle navigation only when auth is ready and not during initialization
  useEffect(() => {
    if (!isInitialized || isLoading || globalAuthState.isInitializing) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';
    const isAuthenticated = !!user;

    console.log('🔴 Auth navigation check:', { 
      isAuthenticated, 
      inAuthGroup, 
      inSubscriptionGroup, 
      segments: segments.slice(0, 2) // Only log first 2 segments
    });

    if (!isAuthenticated && !inAuthGroup && !inSubscriptionGroup) {
      console.log('🔴 Redirecting to login');
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('🔴 Redirecting to home');
      router.replace('/(tabs)');
    }
  }, [user, isInitialized, isLoading, segments[0]]);

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
    try {
      setIsLoading(true);
      const response = await authService.register({
        email,
        password,
        username,
        firstName,
        lastName
      });
      globalAuthState.user = response.user;
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
