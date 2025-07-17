import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MediaPlayer from '@/components/MediaPlayer';
import PreviewPlayer from '@/components/PreviewPlayer';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { slideshowsAPI, playlistsAPI, mediaAPI } from '@/services/api';
import { CartHeader } from '@/components/CartHeader';
import ShareButton from '@/components/ShareButton';

type ContentType = 'playlist' | 'slideshow' | 'media';

interface ContentData {
  type: ContentType;
  data: any;
}

export default function DynamicMediaPlayerPage() {
  const { id, type: contentType } = useLocalSearchParams<{ id: string; type?: ContentType }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    // This effect runs only on the client, after hydration,
    // so it's safe to access window here.
    if (Platform.OS === 'web') {
      const currentUrl = window.location.href;
      console.log('Current URL for sharing:', currentUrl);
      setShareUrl(currentUrl);
    }

    if (id) {
      console.log(`[media-player] Detected ID: ${id}. Starting content load.`);
      detectAndLoadContent(id, contentType);
    }
  }, [id, contentType]);

  const detectContentTypeFromURL = (): ContentType | null => {
    // This is a simplified example. In a real app, you might have more robust routing.
    // For now, we'll try fetching from all possible endpoints.
    return null; // Let the fetcher determine the type
  };

  const detectAndLoadContent = async (contentId: string, type?: ContentType) => {
    setIsLoading(true);
    setError(null);
    console.log(`[media-player] Attempting to load content for ID: ${contentId} (Type hint: ${type})`);

    const loaders: { type: ContentType; load: () => Promise<any> }[] = [
      {
        type: 'playlist',
        load: async () => {
          const response = await playlistsAPI.getById(contentId);
          if (response && response.playlist && response.playlist.mediaFiles && response.playlist.mediaFiles.length > 0) {
            return response.playlist;
          }
          return null;
        },
      },
      {
        type: 'slideshow',
        load: async () => {
          const response = await slideshowsAPI.getById(contentId);
          if (response && response.slideshow && response.slideshow.images && response.slideshow.images.length > 0) {
            return response.slideshow;
          }
          return null;
        },
      },
      {
        type: 'media',
        load: async () => {
          const response = await mediaAPI.getById(contentId);
          if (response && response.media) {
            return response.media;
          }
          return null;
        },
      },
    ];

    // If a type is provided, try that loader first
    if (type) {
      const preferredLoader = loaders.find(l => l.type === type);
      if (preferredLoader) {
        try {
          console.log(`[media-player] Prioritizing fetch for type: ${type}`);
          const data = await preferredLoader.load();
          if (data) {
            console.log(`[media-player] Content found with preferred type ${type}:`, data);
            setContent({ type: preferredLoader.type, data });
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn(`[media-player] Preferred fetch for type ${type} failed, will try others. Error:`, e);
        }
      }
    }
    
    // Iterate through all loaders if preferred type fails or is not provided
    for (const loader of loaders) {
       // Skip the preferred loader if it was already tried
      if (type && loader.type === type) continue;
      
      try {
        console.log(`[media-player] Checking for ${loader.type}...`);
        const data = await loader.load();
        if (data) {
          console.log(`[media-player] ${loader.type} found:`, data);
          setContent({ type: loader.type, data });
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn(`[media-player] Not a ${loader.type}, or API error:`, e);
      }
    }

    console.error(`[media-player] Content with ID ${contentId} not found across all types.`);
    setError(`Content with ID ${contentId} not found.`);
    setIsLoading(false);
  };

  const { mediaFiles, playlist, slideshow } = useMemo(() => {
    if (!content) return { mediaFiles: [], playlist: null, slideshow: null };

    switch (content.type) {
      case 'playlist':
        return {
          mediaFiles: content.data.mediaFiles || [],
          playlist: content.data,
          slideshow: null,
        };
      case 'slideshow':
        return {
          mediaFiles: content.data.images || [],
          playlist: null,
          slideshow: content.data,
        };
      case 'media':
        return { mediaFiles: [content.data], playlist: null, slideshow: null };
      default:
        return { mediaFiles: [], playlist: null, slideshow: null };
    }
  }, [content]);

  const getContentName = () => {
    return content?.data?.name || 'Media Player';
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText>Loading Player...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.linkText}>Go Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: getContentName(),
          headerRight: () => (
            <>
              <ShareButton url={shareUrl} title={getContentName()} />
              <CartHeader />
            </>
          ),
        }}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>{'< Back'}</ThemedText>
        </TouchableOpacity>
      </View>
      {slideshow ? (
        <PreviewPlayer
          mediaFiles={mediaFiles}
          playlistName={slideshow.name}
          playlistId={slideshow.id}
          previewDuration={30}
          autoplay={false}
          productLinks={slideshow.productLinks || []}
          onPreviewComplete={() => console.log('Preview completed')}
          backgroundAudioUrl={slideshow.audioUrl 
            ? `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/slideshow-audio/${slideshow.id}/stream`
            : undefined}
        />
      ) : (
        <MediaPlayer
          media={mediaFiles}
          playlist={playlist}
          slideshow={slideshow}
          autoPlay={false}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    padding: 10,
  },
  backButton: {},
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    marginBottom: 20,
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
  },
});