/**
 * Cached playlist access query - shows last synced playlist when offline.
 */
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { api } from '@/services/api';

/** Access-control fields can change while a viewer has the player open, but re-checking
 *  more often than this just multiplies load: playback itself is gated server-side by the
 *  playback token on every /stream request. */
const ACCESS_STALE_TIME_MS = 30 * 1000;

export function usePlaylistAccess(
  id: string | undefined,
  playbackToken?: string | null,
  enabled: boolean = true
) {
  return useOfflineQuery({
    queryKey: ['playlist-access', id, playbackToken || null] as const,
    queryFn: async () => {
      const response = await api.get(`/playlist-access/${id}`, {
        params: playbackToken ? { token: playbackToken } : undefined,
      });
      return response.data;
    },
    // Held until the caller has resolved any stored playback token. Firing before then
    // means a tokenless request followed immediately by a second one under a new query
    // key, doubling every mount.
    enabled: !!id && enabled,
    staleTime: ACCESS_STALE_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}
