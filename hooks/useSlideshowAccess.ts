/**
 * Cached slideshow access query - shows last synced slideshow when offline.
 */
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { api } from '@/services/api';

export function useSlideshowAccess(id: string | undefined) {
  return useOfflineQuery({
    queryKey: ['slideshow-access', id] as const,
    queryFn: async () => {
      const response = await api.get(`/slideshow-access/${id}`);
      return response.data;
    },
    enabled: !!id,
    // Access-control fields can change while a viewer has the player open.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
