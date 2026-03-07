/**
 * Persisted React Query client with offline-aware defaults.
 * Cache is persisted to AsyncStorage and restored on app launch.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours
const STALE_TIME_MS = 1000 * 60 * 5; // 5 minutes - data considered fresh

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: CACHE_MAX_AGE_MS,
      staleTime: STALE_TIME_MS,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'MERCHTECH_QUERY_CACHE',
  throttleTime: 1000,
});

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: 'v1',
};
