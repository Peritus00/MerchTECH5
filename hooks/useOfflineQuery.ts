/**
 * Shared offline-aware query hook with sensible defaults for cached reads.
 * Use instead of raw useQuery for screens that should show cached data when offline.
 */
import {
  useQuery,
  useQueryClient,
  UseQueryOptions,
  QueryKey,
} from '@tanstack/react-query';

const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
const DEFAULT_GC_TIME = 1000 * 60 * 60 * 24; // 24 hours

export interface OfflineQueryOptions<TData, TError>
  extends Omit<UseQueryOptions<TData, TError>, 'staleTime' | 'gcTime' | 'retry' | 'networkMode'> {
  /** How long data is considered fresh (default 5 min) */
  staleTime?: number;
  /** How long unused data stays in cache (default 24h) */
  gcTime?: number;
  /** When offline, use cached data and skip fetch. Default true for read-heavy screens. */
  offlineFirst?: boolean;
}

/**
 * useOfflineQuery - Query hook that prefers cached data when offline.
 * - Uses networkMode: 'offlineFirst' when offlineFirst is true (default)
 * - Pauses refetch when offline; refetches on reconnect
 * - Sensible stale/gc times for cellular-friendly caching
 */
export function useOfflineQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: OfflineQueryOptions<TQueryFnData, TError> & {
    queryKey: TQueryKey;
    queryFn: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>['queryFn'];
  }
) {
  const {
    staleTime = DEFAULT_STALE_TIME,
    gcTime = DEFAULT_GC_TIME,
    offlineFirst = true,
    retry = 2,
    ...rest
  } = options;

  return useQuery({
    ...rest,
    staleTime,
    gcTime,
    retry,
    networkMode: offlineFirst ? 'offlineFirst' : 'online',
    refetchOnReconnect: true,
  });
}

export { useQueryClient };
