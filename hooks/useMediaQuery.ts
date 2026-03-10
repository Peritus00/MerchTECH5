import { useQuery } from '@tanstack/react-query';
import { mediaAPI } from '@/services/api';
import { MediaFile } from '@/shared/media-schema';

const MEDIA_QUERY_KEY = ['media'] as const;

async function fetchMedia(): Promise<MediaFile[]> {
  const response = await mediaAPI.getAll();
  const files = response?.media || response || [];
  return Array.isArray(files) ? files : [];
}

export function useMediaQuery() {
  const query = useQuery({
    queryKey: MEDIA_QUERY_KEY,
    queryFn: fetchMedia,
  });

  const mediaFiles: MediaFile[] = query.data ?? [];
  return {
    ...query,
    mediaFiles,
  };
}

export { MEDIA_QUERY_KEY };
