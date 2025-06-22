
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

// Global singleton state - only one instance allowed
let globalAuthInstance: {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  hasInitialized: boolean;
  isInitializing: boolean;
  initPromise: Promise<void> | null;
  subscribers: Set<() => void>;
} = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  hasInitialized: false,
  isInitializing: false,
  initPromise: null,
  subscribers: new Set(),
};

// Prevent multiple providers
let providerCount = 0;
const MAX_PROVIDERS = 1;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  providerCount++;
  
  // Block additional providers
  if (providerCount > MAX_PROVIDERS) {
    console.log(`🔴 AuthProvider: Blocking extra provider instance #${providerCount}`);
    return <>{children}</>;
  }

  console.log(`🔴 AuthProvider: Creating provider instance #${providerCount}`);

  const [localState, setLocalState] = useState({
    user: globalAuthInstance.user,
    isAuthenticated: globalAuthInstance.isAuthenticated,
    isLoading: globalAuthInstance.isLoading,
    isInitialized: globalAuthInstance.isInitialized,
  });

  const router = useRouter();
  const segments = useSegments();

  // Subscribe to global state changes
  useEffect(() => {
    const updateLocalState = () => {
      setLocalState({
        user: globalAuthInstance.user,
        isAuthenticated: globalAuthInstance.isAuthenticated,
        isLoading: globalAuthInstance.isLoading,
        isInitialized: globalAuthInstance.isInitialized,
      });
    };

    globalAuthInstance.subscribers.add(updateLocalState);
    
    return () => {
      globalAuthInstance.subscribers.delete(updateLocalState);
    };
  }, []);

  // Notify all subscribers of state changes
  const notifySubscribers = () => {
    globalAuthInstance.subscribers.forEach(callback => callback());
  };

  // Update global state
  const updateGlobalState = (updates: Partial<typeof globalAuthInstance>) => {
    Object.assign(globalAuthInstance, updates);
    notifySubscribers();
  };

  // Initialize auth only once
  useEffect(() => {
    if (globalAuthInstance.hasInitialized || globalAuthInstance.isInitializing) {
      console.log('🔴 Auth: Skipping initialization - already done or in progress');
      return;
    }

    console.log('🔴 Auth: Starting single initialization...');
    globalAuthInstance.isInitializing = true;
    globalAuthInstance.initPromise = initializeAuth();
  }, []);

  // Handle route navigation only from the primary provider
  useEffect(() => {
    if (providerCount !== 1 || !localState.isInitialized || localState.isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';

    if (!localState.isAuthenticated && !inAuthGroup && !inSubscriptionGroup) {
      console.log('🔴 Route: Redirecting to login');
      router.replace('/auth/login');
    } else if (localState.isAuthenticated && inAuthGroup) {
      console.log('🔴 Route: Redirecting to home');
      router.replace('/(tabs)');
    }
  }, [localState.isAuthenticated, localState.isInitialized, localState.isLoading, segments[0]]);

  const initializeAuth = async () => {
    try {
      updateGlobalState({ isLoading: true });
      console.log('🔴 Auth: Getting current user...');

      const currentUser = await authService.getCurrentUser();
      console.log('🔴 Auth: User result:', currentUser?.username || 'none');

      updateGlobalState({
        user: currentUser,
        isAuthenticated: !!currentUser,
      });
    } catch (error) {
      console.error('🔴 Auth: Init error:', error);
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });
    } finally {
      updateGlobalState({
        isLoading: false,
        isInitialized: true,
        hasInitialized: true,
        isInitializing: false,
      });
      globalAuthInstance.initPromise = null;
      console.log('🔴 Auth: Initialization complete');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      updateGlobalState({ isLoading: true });
      const response = await authService.login({ email, password });
      updateGlobalState({
        user: response.user,
        isAuthenticated: true,
      });
    } catch (error: any) {
      throw error;
    } finally {
      updateGlobalState({ isLoading: false });
    }
  };

  const register = async (email: string, password: string, username: string, firstName?: string, lastName?: string) => {
    try {
      updateGlobalState({ isLoading: true });
      const response = await authService.register({
        email,
        password,
        username,
        firstName,
        lastName
      });
      updateGlobalState({
        user: response.user,
        isAuthenticated: true,
      });
    } catch (error: any) {
      throw error;
    } finally {
      updateGlobalState({ isLoading: false });
    }
  };

  const logout = async () => {
    try {
      updateGlobalState({ isLoading: true });
      await authService.logout();
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });
      router.replace('/auth/login');
    } catch (error) {
      console.error('🔴 Auth: Logout error:', error);
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });
      router.replace('/auth/login');
    } finally {
      updateGlobalState({ isLoading: false });
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      updateGlobalState({
        user: currentUser,
        isAuthenticated: !!currentUser,
      });
    } catch (error) {
      console.error('🔴 Auth: Refresh error:', error);
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });
    }
  };

  return (
    <AuthContext.Provider value={{
      user: localState.user,
      isAuthenticated: localState.isAuthenticated,
      isLoading: localState.isLoading,
      isInitialized: localState.isInitialized,
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
