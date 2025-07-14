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
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { slideshowAPI, playlistAPI, mediaAPI } from '@/services/api';
import { CartHeader } from '@/components/CartHeader';
import { ShareButton } from '@/components/ShareButton';

type ContentType = 'playlist' | 'slideshow' | 'media';

interface ContentData {
  type: ContentType;
  data: any;
}

export default function DynamicMediaPlayerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    // This effect runs only on the client, after hydration,
    // so it's safe to access window here.
    if (Platform.OS === 'web') {
      setShareUrl(window.location.href);
    }

    if (id) {
      detectAndLoadContent(id);
    }
  }, [id]);

  const detectContentTypeFromURL = (): ContentType | null => {
    // This is a simplified example. In a real app, you might have more robust routing.
    // For now, we'll try fetching from all possible endpoints.
    return null; // Let the fetcher determine the type
  };

  const detectAndLoadContent = async (contentId: string) => {
    setIsLoading(true);
    setError(null);

    // Try fetching as a playlist first
    try {
      const playlistData = await playlistAPI.getById(contentId);
      if (playlistData) {
        setContent({ type: 'playlist', data: playlistData });
        setIsLoading(false);
        return;
      }
    } catch (e) {
      // Not a playlist, ignore error and try next type
    }

    // Try fetching as a slideshow
    try {
      const slideshowData = await slideshowAPI.getById(contentId);
      if (slideshowData) {
        setContent({ type: 'slideshow', data: slideshowData });
        setIsLoading(false);
        return;
      }
    } catch (e) {
      // Not a slideshow, ignore error and try next type
    }

    // Try fetching as a single media file
    try {
      const mediaData = await mediaAPI.getById(contentId);
      if (mediaData) {
        setContent({ type: 'media', data: mediaData });
        setIsLoading(false);
        return;
      }
    } catch (e) {
      // Not a media file either
    }

    setError(`Content with ID ${contentId} not found.`);
    setIsLoading(false);
  };

  const mediaFiles = useMemo(() => {
    if (!content) return [];
    if (content.type === 'playlist') return content.data.mediaFiles || [];
    if (content.type === 'slideshow') return content.data.images || [];
    if (content.type === 'media') return [content.data];
    return [];
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
              <ShareButton url={shareUrl} />
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
      <MediaPlayer
        media={mediaFiles}
        playlist={content?.type === 'playlist' ? content.data : undefined}
        slideshow={content?.type === 'slideshow' ? content.data : undefined}
        autoPlay
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