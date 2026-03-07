/**
 * Cached playlist access query - shows last synced playlist when offline.
 */
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { api } from '@/services/api';

export function usePlaylistAccess(id: string | undefined) {
  return useOfflineQuery({
    queryKey: ['playlist-access', id] as const,
    queryFn: async () => {
      const response = await api.get(`/playlist-access/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 2, // 2 min - playlist content doesn't change often
  });
}
