import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import MediaPlayer from '@/components/MediaPlayer';
import { MediaFile, Playlist, Slideshow } from '@/shared/media-schema';
import { MaterialIcons } from '@expo/vector-icons';
import { slideshowAPI, playlistAPI, mediaAPI } from '@/services/api';
import { CartHeader } from '@/components/CartHeader';

// Determine backend origin for stream URLs
const backendOrigin = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'http://localhost:5001'
  : (process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app');

type ContentType = 'playlist' | 'slideshow' | 'media';

interface ContentData {
  type: ContentType;
  data: Playlist | Slideshow | MediaFile;
  mediaFiles: MediaFile[];
  backgroundAudioUrl?: string | null;
  productLinks?: any[];
}

export default function MediaPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      detectAndLoadContent(id);
    }
  }, [id]);

  const detectContentTypeFromURL = (): ContentType | null => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      console.log('🔴 MEDIA_PLAYER: Current URL path:', currentPath);
      
      // Check if we came from a playlist or slideshow page
      if (currentPath.includes('/playlist-access/') || 
          document.referrer.includes('/playlist-access/') ||
          document.referrer.includes('/(tabs)/playlists')) {
        console.log('🔴 MEDIA_PLAYER: Detected playlist context from URL');
        return 'playlist';
      }
      
      if (currentPath.includes('/slideshow-access/') || 
          document.referrer.includes('/slideshow-access/') ||
          document.referrer.includes('/(tabs)/slideshows')) {
        console.log('🔴 MEDIA_PLAYER: Detected slideshow context from URL');
        return 'slideshow';
      }
    }
    
    return null;
  };

  const detectAndLoadContent = async (contentId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔴 MEDIA_PLAYER: Detecting content type for ID:', contentId);
      console.log('🔴 MEDIA_PLAYER: Current API base URL:', process.env.EXPO_PUBLIC_API_URL);
      
      // First, try to detect content type from URL context
      const urlContentType = detectContentTypeFromURL();
      console.log('🔴 MEDIA_PLAYER: URL-based content type hint:', urlContentType);
      
      let contentData: ContentData | null = null;
      
      if (urlContentType === 'playlist') {
        // Try playlist first if URL suggests it's a playlist
        console.log('🔴 MEDIA_PLAYER: URL suggests playlist, trying playlist API first');
        try {
          const playlist = await playlistAPI.getById(contentId);
          console.log('🔴 MEDIA_PLAYER: Successfully fetched playlist:', playlist);
          
          if (playlist.mediaFiles && playlist.mediaFiles.length > 0) {
            console.log('🔴 MEDIA_PLAYER: Playlist has media files, using playlist');
            contentData = await processPlaylistData(playlist);
          } else {
            console.log('🔴 MEDIA_PLAYER: Playlist is empty, falling back to slideshow check');
            // Fall back to slideshow if playlist is empty
            contentData = await trySlideshow(contentId);
          }
        } catch (error) {
          console.log('🔴 MEDIA_PLAYER: Playlist API failed, trying slideshow:', error);
          console.error('🔴 MEDIA_PLAYER: Playlist API error details:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
          });
          contentData = await trySlideshow(contentId);
        }
      } else if (urlContentType === 'slideshow') {
        // Try slideshow first if URL suggests it's a slideshow
        console.log('🔴 MEDIA_PLAYER: URL suggests slideshow, trying slideshow API first');
        contentData = await trySlideshow(contentId);
        
        if (!contentData || (contentData.mediaFiles && contentData.mediaFiles.length === 0)) {
          console.log('🔴 MEDIA_PLAYER: Slideshow is empty, falling back to playlist check');
          try {
            const playlist = await playlistAPI.getById(contentId);
            console.log('🔴 MEDIA_PLAYER: Successfully fetched playlist as fallback:', playlist);
            contentData = await processPlaylistData(playlist);
          } catch (error) {
            console.log('🔴 MEDIA_PLAYER: Playlist fallback also failed:', error);
          }
        }
      } else {
        // No URL hint, try individual media file first since that's most likely when coming from media library
        console.log('🔴 MEDIA_PLAYER: No URL hint, trying individual media file first');
        
        try {
          contentData = await tryMediaFile(contentId);
          console.log('🔴 MEDIA_PLAYER: Successfully loaded individual media file');
        } catch (mediaError) {
          console.log('🔴 MEDIA_PLAYER: Individual media file failed, trying playlist and slideshow:', mediaError);
          
          // If individual media file fails, try both playlist and slideshow in parallel
          const [slideshowResult, playlistResult] = await Promise.allSettled([
            trySlideshow(contentId),
            (async () => {
              const playlist = await playlistAPI.getById(contentId);
              return await processPlaylistData(playlist);
            })()
          ]);

          console.log('🔴 MEDIA_PLAYER: API results:', {
            slideshow: slideshowResult.status,
            playlist: playlistResult.status
          });

          // Determine which content to use based on what has actual media files
          if (slideshowResult.status === 'fulfilled' && playlistResult.status === 'fulfilled') {
            console.log('🔴 MEDIA_PLAYER: Both slideshow and playlist found, determining which has content');
            
            const slideshowData = slideshowResult.value;
            const playlistData = playlistResult.value;
            
            const slideshowHasContent = slideshowData && slideshowData.mediaFiles && slideshowData.mediaFiles.length > 0;
            const playlistHasContent = playlistData && playlistData.mediaFiles && playlistData.mediaFiles.length > 0;
            
            console.log('🔴 MEDIA_PLAYER: Content analysis:', {
              slideshowHasContent,
              playlistHasContent,
              slideshowMediaFiles: slideshowData?.mediaFiles?.length || 0,
              playlistMediaFiles: playlistData?.mediaFiles?.length || 0
            });

            if (playlistHasContent && !slideshowHasContent) {
              console.log('🔴 MEDIA_PLAYER: Playlist has content, slideshow is empty - using playlist');
              contentData = playlistData;
            } else if (slideshowHasContent && !playlistHasContent) {
              console.log('🔴 MEDIA_PLAYER: Slideshow has content, playlist is empty - using slideshow');
              contentData = slideshowData;
            } else if (playlistHasContent && slideshowHasContent) {
              console.log('🔴 MEDIA_PLAYER: Both have content - defaulting to playlist');
              contentData = playlistData;
            } else {
              console.log('🔴 MEDIA_PLAYER: Neither has content - defaulting to playlist');
              contentData = playlistData;
            }
          } else if (slideshowResult.status === 'fulfilled' && slideshowResult.value) {
            console.log('🔴 MEDIA_PLAYER: Only slideshow found, using slideshow');
            contentData = slideshowResult.value;
          } else if (playlistResult.status === 'fulfilled' && playlistResult.value) {
            console.log('🔴 MEDIA_PLAYER: Only playlist found, using playlist');
            contentData = playlistResult.value;
          } else {
            console.error('🔴 MEDIA_PLAYER: All content types failed:', {
              mediaError,
              slideshowError: slideshowResult.status === 'rejected' ? slideshowResult.reason : null,
              playlistError: playlistResult.status === 'rejected' ? playlistResult.reason : null
            });
            throw new Error('Content not found or invalid format');
          }
        }
      }

      if (!contentData) {
        throw new Error('Content not found');
      }

      setContent(contentData);
      console.log('🔴 MEDIA_PLAYER: Content loaded successfully:', {
        type: contentData.type,
        name: contentData.type === 'media' ? (contentData.data as MediaFile).title : contentData.data.name,
        mediaFilesCount: contentData.mediaFiles.length
      });

    } catch (error) {
      console.error('🔴 MEDIA_PLAYER: Error loading content:', error);
      
      // Don't show error if we're redirecting to access page
      if (error instanceof Error && error.message === 'Redirect to access page') {
        return;
      }
      
      setError(error instanceof Error ? error.message : 'Failed to load content');
      Alert.alert('Error', 'Failed to load content. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const trySlideshow = async (contentId: string): Promise<ContentData | null> => {
    try {
      console.log('🔴 MEDIA_PLAYER: Attempting to fetch slideshow via slideshowAPI.getById:', contentId);
      const slideshow = await slideshowAPI.getById(contentId);
      console.log('🔴 MEDIA_PLAYER: Successfully fetched slideshow:', slideshow);
      return await processSlideshowData(slideshow);
    } catch (error) {
      console.log('🔴 MEDIA_PLAYER: Direct slideshow API failed, trying access API:', error);
      
      try {
        // Try slideshow access API
        const slideshowData = await slideshowAPI.getByIdForAccess(contentId);
        console.log('🔴 MEDIA_PLAYER: Successfully fetched slideshow via access API:', slideshowData);
        
        if (slideshowData.accessRestricted) {
          console.log('🔴 MEDIA_PLAYER: Slideshow requires activation code, redirecting to access page');
          router.replace(`/slideshow-access/${contentId}`);
          throw new Error('Redirect to access page');
        }
        
        return await processSlideshowData(slideshowData);
      } catch (accessError: any) {
        console.log('🔴 MEDIA_PLAYER: Access API also failed:', accessError);
        
        // Handle 403 errors specifically - redirect to slideshow access screen
        if (accessError.response?.status === 403) {
          console.log('🔴 MEDIA_PLAYER: 403 Access Denied - redirecting to slideshow access screen');
          router.replace(`/slideshow-access/${contentId}`);
          throw new Error('Access denied - redirect to access page');
        }
        
        // For other errors, throw the original error
        throw accessError;
      }
    }
  };

  const processSlideshowData = async (slideshow: any): Promise<ContentData> => {
    console.log('🔴 MEDIA_PLAYER: Processing slideshow data:', {
      slideshow,
      hasImages: !!slideshow.images,
      imagesLength: slideshow.images?.length,
      images: slideshow.images
    });

    if (!slideshow.images || slideshow.images.length === 0) {
      console.error('🔴 MEDIA_PLAYER: No images found in slideshow data');
      return {
        type: 'slideshow',
        data: slideshow,
        mediaFiles: [],
        backgroundAudioUrl: null,
        productLinks: []
      };
    }

    const formattedFiles: MediaFile[] = slideshow.images.map((image: any, index: number) => {
      console.log('🔴 MEDIA_PLAYER: Processing image:', { image, index });
      
      const mediaFile = {
        id: `image-${image.id}`,
        url: image.imageUrl.includes('amazonaws.com')
          ? `${backendOrigin}/api/slideshow-images/${image.id}/stream`
          : image.imageUrl,
        type: 'image',
        title: image.caption || `Image ${index + 1}`,
        caption: image.caption,
        duration: slideshow.autoplayInterval || 5000,
      };
      
      console.log('🔴 MEDIA_PLAYER: Created media file:', mediaFile);
      return mediaFile;
    });

    console.log('🔴 MEDIA_PLAYER: Final formatted files:', formattedFiles);

    let backgroundAudioUrl: string | null = null;
    if (slideshow.audioUrl) {
      backgroundAudioUrl = slideshow.audioUrl.includes('amazonaws.com')
        ? `${backendOrigin}/api/slideshow-audio/${slideshow.id}/stream`
        : slideshow.audioUrl;
    }

    const result = {
      type: 'slideshow',
      data: slideshow,
      mediaFiles: formattedFiles,
      backgroundAudioUrl,
      productLinks: [] // Slideshows don't have product links in the same way
    };

    console.log('🔴 MEDIA_PLAYER: Returning slideshow content data:', result);
    return result;
  };

  const processPlaylistData = async (playlist: any): Promise<ContentData> => {
    console.log('🔴 MEDIA_PLAYER: Processing playlist data:', {
      playlist,
      hasMediaFiles: !!playlist.mediaFiles,
      mediaFilesLength: playlist.mediaFiles?.length,
      mediaFiles: playlist.mediaFiles
    });

    const formattedFiles: MediaFile[] = playlist.mediaFiles.map((media: any) => ({
      id: media.id.toString(),
      url: media.url,
      type: determineMediaType(media.fileType, media.contentType),
      title: media.title || `Track ${media.id}`,
      caption: media.title,
      fileType: media.fileType,
      contentType: media.contentType,
    }));

    console.log('🔴 MEDIA_PLAYER: Formatted playlist files:', formattedFiles);

    const result = {
      type: 'playlist',
      data: playlist,
      mediaFiles: formattedFiles,
      backgroundAudioUrl: null, // Playlists don't have background audio
      productLinks: playlist.productLinks || []
    };

    console.log('🔴 MEDIA_PLAYER: Returning playlist content data:', result);
    return result;
  };

  const tryMediaFile = async (mediaId: string): Promise<ContentData | null> => {
    try {
      console.log('🔴 MEDIA_PLAYER: Attempting to fetch media file via mediaAPI.getById:', mediaId);
      const mediaFile = await mediaAPI.getById(mediaId);
      console.log('🔴 MEDIA_PLAYER: Successfully fetched media file:', mediaFile);
      
      // Ensure the media file has the proper type field
      const processedMediaFile = {
        ...mediaFile,
        type: mediaFile.type || mediaFile.fileType || 'audio', // Fallback to audio if no type
        id: mediaFile.id?.toString() || mediaId // Ensure ID is string
      };
      
      return {
        type: 'media',
        data: processedMediaFile,
        mediaFiles: [processedMediaFile],
        backgroundAudioUrl: null,
        productLinks: []
      };
    } catch (error) {
      console.log('🔴 MEDIA_PLAYER: Media file API failed:', error);
      throw error;
    }
  };

  const determineMediaType = (fileType?: string, contentType?: string): 'image' | 'audio' | 'video' => {
    if (contentType) {
      if (contentType.startsWith('image/')) return 'image';
      if (contentType.startsWith('audio/')) return 'audio';
      if (contentType.startsWith('video/')) return 'video';
    }
    
    if (fileType) {
      const type = fileType.toLowerCase();
      if (type.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)) return 'image';
      if (type.includes('audio') || ['mp3', 'wav', 'ogg', 'm4a'].includes(type)) return 'audio';
      if (type.includes('video') || ['mp4', 'webm', 'mov', 'avi'].includes(type)) return 'video';
    }
    
    return 'audio'; // Default fallback
  };

  const getContentIcon = () => {
    if (!content) return 'play-circle';
    if (content.type === 'slideshow') return 'photo-album';
    if (content.type === 'playlist') return 'queue-music';
    if (content.type === 'media') {
      const mediaFile = content.data as MediaFile;
      if (mediaFile.type === 'video' || mediaFile.fileType === 'video') return 'videocam';
      if (mediaFile.type === 'audio' || mediaFile.fileType === 'audio') return 'music-note';
      if (mediaFile.type === 'image' || mediaFile.fileType === 'image') return 'image';
    }
    return 'play-circle';
  };

  const getContentTypeLabel = () => {
    if (!content) return 'Content';
    if (content.type === 'slideshow') return 'Slideshow';
    if (content.type === 'playlist') return 'Playlist';
    if (content.type === 'media') {
      const mediaFile = content.data as MediaFile;
      if (mediaFile.type === 'video' || mediaFile.fileType === 'video') return 'Video';
      if (mediaFile.type === 'audio' || mediaFile.fileType === 'audio') return 'Audio';
      if (mediaFile.type === 'image' || mediaFile.fileType === 'image') return 'Image';
      return 'Media File';
    }
    return 'Content';
  };

  const getContentName = () => {
    if (!content) return 'Loading...';
    if (content.type === 'media') {
      const mediaFile = content.data as MediaFile;
      return mediaFile.title || mediaFile.name || 'Media File';
    }
    return content.data.name;
  };

  const handleBackPress = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading Media...</ThemedText>
      </ThemedView>
    );
  }

  if (error || !content) {
    return (
      <ThemedView style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <ThemedText style={styles.errorTitle}>Content Not Found</ThemedText>
        <ThemedText style={styles.errorText}>
          {error || 'The requested content could not be loaded.'}
        </ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={() => detectAndLoadContent(id!)}>
          <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackButton}
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </TouchableOpacity>
        
        <View style={styles.headerRight}>
          <CartHeader color="#6b7280" size={24} />
        </View>
      </View>

      <View style={styles.mainContainer}>
        <View style={styles.mediaPlayerContainer}>
          <View style={styles.playlistHeader}>
            <View style={styles.playlistIcon}>
              <MaterialIcons name={getContentIcon()} size={24} color="#3b82f6" />
            </View>
            <View style={styles.playlistInfo}>
              <ThemedText style={styles.playlistTitle}>{getContentName()}</ThemedText>
              <View style={styles.contentTypeBadge}>
                <MaterialIcons name="info" size={16} color="#6b7280" />
                <ThemedText style={styles.contentTypeText}>{getContentTypeLabel()}</ThemedText>
              </View>
            </View>
          </View>
          
          <View style={styles.playerContainer}>
            <MediaPlayer
              playlist={content.type === 'playlist' ? content.data as Playlist : undefined}
              slideshow={content.type === 'slideshow' ? content.data as Slideshow : undefined}
              media={content.mediaFiles}
              onTrackChange={() => {}}
              autoPlay={content.type === 'slideshow'}
              showProductLinks={true}
              showChat={true}
            />
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f2f5',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    alignSelf: 'center',
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRight: {
    alignItems: 'center',
  },
  headerBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  mainContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mediaPlayerContainer: {
    width: '100%',
    maxWidth: 900,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  playlistIcon: {
    marginRight: 15,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  protectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  protectionText: {
    marginLeft: 5,
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '500',
  },
  playerContainer: {
    padding: 10,
  },
  contentTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  contentTypeText: {
    marginLeft: 5,
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '500',
  },
});