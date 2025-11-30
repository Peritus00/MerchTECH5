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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MediaPlayer from '@/components/MediaPlayer';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { slideshowsAPI, slideshowAccessAPI, playlistsAPI, mediaAPI } from '@/services/api';
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
  const insets = useSafeAreaInsets();
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
          // Use slideshow-access API to get streaming URLs instead of direct S3 URLs
          const response = await slideshowAccessAPI.getByIdForAccess(contentId);
          if (response && response.images && response.images.length > 0) {
            return response;
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
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ThemedText style={styles.backButtonText}>{'< Back'}</ThemedText>
        </TouchableOpacity>
      </View>
      <MediaPlayer
        media={mediaFiles}
        playlist={playlist}
        slideshow={slideshow}
        autoPlay={false}
      />
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
    paddingHorizontal: 10,
    paddingBottom: 10,
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