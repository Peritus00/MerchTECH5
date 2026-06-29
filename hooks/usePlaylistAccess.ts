/**
 * Cached playlist access query - shows last synced playlist when offline.
 */
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { api } from '@/services/api';

export function usePlaylistAccess(id: string | undefined, playbackToken?: string | null) {
  return useOfflineQuery({
    queryKey: ['playlist-access', id, playbackToken || null] as const,
    queryFn: async () => {
      const response = await api.get(`/playlist-access/${id}`, {
        params: playbackToken ? { token: playbackToken } : undefined,
      });
      return response.data;
    },
    enabled: !!id,
    // Access-control fields can change while a viewer has the player open.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
