/**
 * Prefetch next 1-2 media assets for smoother playback on cellular.
 * Images use expo-image disk cache; video/audio URLs are prefetched for browser cache.
 */
import { useEffect } from 'react';
import { Image } from 'expo-image';
import { Platform } from 'react-native';

interface MediaItem {
  id?: string | number;
  url?: string;
  proxy_url?: string;
  media_type?: string;
  fileType?: string;
  type?: string;
  contentType?: string;
}

export interface MediaPrefetchOptions {
  playbackToken?: string;
  appendStreamToken?: (uri: string) => string;
  skipStreamPrefetchWithoutToken?: boolean;
}

function getMediaUrl(item: MediaItem): string | null {
  const url = item?.proxy_url || item?.url;
  if (!url || typeof url !== 'string') return null;
  return url.startsWith('http') ? url : null;
}

function isImage(item: MediaItem, url: string | null): boolean {
  const t = item?.media_type || item?.fileType || item?.type || '';
  const ct = item?.contentType || '';
  return (
    t === 'image' ||
    ct.startsWith('image/') ||
    (!!url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url))
  );
}

function isStreamUrl(url: string): boolean {
  return url.includes('/api/media/') && url.includes('/stream');
}

function resolvePrefetchUrl(
  url: string,
  options?: MediaPrefetchOptions
): string | null {
  if (!isStreamUrl(url)) {
    return url;
  }

  if (options?.appendStreamToken) {
    return options.appendStreamToken(url);
  }

  if (options?.playbackToken) {
    if (/[?&]token=/.test(url)) {
      return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(options.playbackToken)}`;
  }

  if (options?.skipStreamPrefetchWithoutToken) {
    return null;
  }

  return url;
}

export function useMediaPrefetch(
  media: MediaItem[],
  currentIndex: number,
  prefetchCount = 2,
  options?: MediaPrefetchOptions
) {
  useEffect(() => {
    if (!media?.length) return;

    const urlsToPrefetch: string[] = [];
    for (let i = 1; i <= prefetchCount; i++) {
      const idx = (currentIndex + i) % media.length;
      const item = media[idx];
      const url = getMediaUrl(item);
      if (url) {
        const isImg = isImage(item, url);
        if (isImg) {
          urlsToPrefetch.push(url);
        }
        // For video/audio on web, pre-buffer first 256KB so playback starts immediately on track change
        if (Platform.OS === 'web' && !isImg) {
          const prefetchUrl = resolvePrefetchUrl(url, options);
          if (prefetchUrl) {
            fetch(prefetchUrl, {
              method: 'GET',
              headers: { Range: 'bytes=0-262143' },
              cache: 'force-cache',
            }).catch(() => {});
          }
        }
      }
    }

    if (urlsToPrefetch.length > 0) {
      Image.prefetch(urlsToPrefetch, { cachePolicy: 'disk' }).catch(() => {});
    }
  }, [media, currentIndex, options?.appendStreamToken, options?.playbackToken, options?.skipStreamPrefetchWithoutToken, prefetchCount]);
}
