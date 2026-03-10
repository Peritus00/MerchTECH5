import { useQuery } from '@tanstack/react-query';
import { mediaAPI } from '@/services/api';
import { MediaFile } from '@/shared/media-schema';

const MEDIA_QUERY_KEY = ['media'] as const;
const SCAN_POLL_INTERVAL_MS = 4000;

async function fetchMedia(): Promise<MediaFile[]> {
  const response = await mediaAPI.getAll();
  const files = response?.media || response || [];
  return Array.isArray(files) ? files : [];
}

function hasPendingScans(files: MediaFile[]): boolean {
  return files.some(
    (f) => f.uploadStatus === 'pending_scan' || f.uploadStatus === 'scanning'
  );
}

export function useMediaQuery() {
  const query = useQuery({
    queryKey: MEDIA_QUERY_KEY,
    queryFn: fetchMedia,
    refetchInterval: (query) => {
      const files = query.state.data ?? [];
      return hasPendingScans(files) ? SCAN_POLL_INTERVAL_MS : false;
    },
  });

  const mediaFiles: MediaFile[] = query.data ?? [];
  return {
    ...query,
    mediaFiles,
  };
}

export { MEDIA_QUERY_KEY };
