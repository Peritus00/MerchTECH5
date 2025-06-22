
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

// Global singleton state to prevent any re-initialization
let globalAuthState = {
  user: null as User | null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  hasBeenInitialized: false,
  initPromise: null as Promise<void> | null,
};

// Global instance counter
let instanceCount = 0;
let masterInstanceId: number | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const instanceId = ++instanceCount;
  
  // Only allow the first instance to be the master
  if (masterInstanceId === null) {
    masterInstanceId = instanceId;
    console.log(`🔴 AuthContext: Master instance created (${instanceId})`);
  } else {
    console.log(`🔴 AuthContext: Slave instance created (${instanceId}) - will use master state`);
  }

  const [localUser, setLocalUser] = useState<User | null>(globalAuthState.user);
  const [localIsLoading, setLocalIsLoading] = useState(globalAuthState.isLoading);
  const [localIsInitialized, setLocalIsInitialized] = useState(globalAuthState.isInitialized);
  
  const router = useRouter();
  const segments = useSegments();

  const isAuthenticated = !!localUser;
  const isMaster = instanceId === masterInstanceId;

  // Sync local state with global state
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (
        localUser !== globalAuthState.user ||
        localIsLoading !== globalAuthState.isLoading ||
        localIsInitialized !== globalAuthState.isInitialized
      ) {
        setLocalUser(globalAuthState.user);
        setLocalIsLoading(globalAuthState.isLoading);
        setLocalIsInitialized(globalAuthState.isInitialized);
      }
    }, 50);

    return () => clearInterval(syncInterval);
  }, [localUser, localIsLoading, localIsInitialized]);

  // Only master instance handles initialization
  useEffect(() => {
    if (!isMaster) return;
    
    if (globalAuthState.hasBeenInitialized) {
      console.log('🔴 AuthContext: Already initialized, skipping');
      return;
    }

    if (globalAuthState.initPromise) {
      console.log('🔴 AuthContext: Initialization already in progress');
      return;
    }

    console.log('🔴 AuthContext: Master instance starting initialization...');
    globalAuthState.initPromise = initializeAuth();
  }, [isMaster]);

  // Only master instance handles route navigation
  useEffect(() => {
    if (!isMaster || !localIsInitialized || localIsLoading) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const inSubscriptionGroup = segments[0] === 'subscription';

    if (!isAuthenticated && !inAuthGroup && !inSubscriptionGroup) {
      console.log('🔴 Route navigation: Master redirecting unauthenticated user to login');
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      console.log('🔴 Route navigation: Master redirecting authenticated user to home');
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, localIsInitialized, localIsLoading, isMaster]);

  const updateGlobalState = (updates: Partial<typeof globalAuthState>) => {
    Object.assign(globalAuthState, updates);
    
    // Force update all instances
    setLocalUser(globalAuthState.user);
    setLocalIsLoading(globalAuthState.isLoading);
    setLocalIsInitialized(globalAuthState.isInitialized);
  };

  const initializeAuth = async () => {
    if (globalAuthState.hasBeenInitialized) return;
    
    try {
      updateGlobalState({ isLoading: true });
      console.log('🔴 AuthContext: Starting authentication initialization...');

      const currentUser = await authService.getCurrentUser();
      console.log('🔴 AuthContext: Current user from storage:', currentUser);

      updateGlobalState({
        user: currentUser,
        isAuthenticated: !!currentUser,
      });

      if (currentUser) {
        console.log('🔴 AuthContext: User authenticated successfully:', currentUser.username);
      } else {
        console.log('🔴 AuthContext: No authenticated user found');
      }
    } catch (error) {
      console.error('🔴 AuthContext: Initialize auth error:', error);
      updateGlobalState({ user: null, isAuthenticated: false });
    } finally {
      updateGlobalState({
        isLoading: false,
        isInitialized: true,
        hasBeenInitialized: true,
      });
      globalAuthState.initPromise = null;
      console.log('🔴 AuthContext: Authentication initialization completed');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      updateGlobalState({ isLoading: true });
      console.log('🔴 AuthContext: Starting login for:', email);

      const response = await authService.login({ email, password });
      console.log('🔴 AuthContext: Login successful:', response.user);

      updateGlobalState({
        user: response.user,
        isAuthenticated: true,
      });
    } catch (error: any) {
      console.error('🔴 AuthContext: Login error:', error);
      throw error;
    } finally {
      updateGlobalState({ isLoading: false });
    }
  };

  const register = async (email: string, password: string, username: string, firstName?: string, lastName?: string) => {
    try {
      updateGlobalState({ isLoading: true });
      console.log('🔴 AuthContext: Starting registration for:', email);

      const response = await authService.register({
        email,
        password,
        username,
        firstName,
        lastName
      });

      console.log('🔴 AuthContext: Registration successful:', response.user);
      updateGlobalState({
        user: response.user,
        isAuthenticated: true,
      });
    } catch (error: any) {
      console.error('🔴 AuthContext: Registration error:', error);
      throw error;
    } finally {
      updateGlobalState({ isLoading: false });
    }
  };

  const logout = async () => {
    try {
      updateGlobalState({ isLoading: true });
      console.log('🔴 AuthContext: Starting logout...');

      await authService.logout();
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });

      console.log('🔴 AuthContext: Logout completed successfully');
      router.replace('/auth/login');
    } catch (error) {
      console.error('🔴 AuthContext: Logout error:', error);
      // Even if logout fails, clear local state
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
      console.log('🔴 AuthContext: Refreshing user data...');
      const currentUser = await authService.getCurrentUser();

      if (currentUser) {
        updateGlobalState({
          user: currentUser,
          isAuthenticated: true,
        });
        console.log('🔴 AuthContext: User data refreshed:', currentUser.username);
      } else {
        console.log('🔴 AuthContext: No user found during refresh');
        updateGlobalState({
          user: null,
          isAuthenticated: false,
        });
      }
    } catch (error) {
      console.error('🔴 AuthContext: Refresh user error:', error);
      updateGlobalState({
        user: null,
        isAuthenticated: false,
      });
    }
  };

  return (
    <AuthContext.Provider value={{
      user: localUser,
      isAuthenticated,
      isLoading: localIsLoading,
      isInitialized: localIsInitialized,
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
