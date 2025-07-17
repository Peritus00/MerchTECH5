import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import Swiper from 'react-native-swiper';
import { Video, ResizeMode } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import createAudioPlayer, {
  IAudioPlayer,
} from '../services/audio/AudioService';
import { api } from '../services/api';

const { width } = Dimensions.get('window');

interface MediaItem {
  id: string | number;
  title?: string;
  s3_key?: string;
  url?: string;
  media_type: 'image' | 'audio' | 'video';
  type?: string;
  fileType?: string;
  contentType?: string;
  caption?: string;
  displayOrder?: number;
}

interface PlaylistPlayerProps {
  playlistId?: string;
  playlist?: any;
  media?: MediaItem[];
  autoPlay?: boolean;
}

const PlaylistPlayer = ({ playlistId, playlist, media: externalMedia, autoPlay = false }: PlaylistPlayerProps) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  
  const videoRef = useRef<Video>(null);
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);

  const fetchPlaylist = useCallback(async () => {
    if (externalMedia || playlist) {
      if (externalMedia) {
        setMedia(externalMedia);
        setPlaylistTitle(playlist?.name || 'Playlist');
      } else if (playlist) {
        setMedia(playlist.mediaFiles || []);
        setPlaylistTitle(playlist.name || 'Playlist');
      }
      setLoading(false);
      return;
    }

    if (!playlistId) {
      setError('No playlist data available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/playlist-access/${playlistId}`);
      
      if (response.data && response.data.media) {
        setMedia(response.data.media);
        setPlaylistTitle(response.data.title || response.data.name || 'Playlist');
      } else {
        setError('No media found for this playlist. Please check the link and try again.');
      }
    } catch (err: any) {
      console.error('Failed to fetch playlist:', err);
      const errorMessage = err.response?.data?.message || 'Could not load playlist. The content may be private or no longer available.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [playlistId, externalMedia, playlist]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  const currentMediaItem = useMemo(() => {
    return media.length > 0 ? media[currentIndex] : null;
  }, [media, currentIndex]);

  const backgroundAudioUrl = useMemo(() => {
    return media.find((item) => item.media_type === 'audio')?.s3_key || null;
  }, [media]);

  // Audio player lifecycle
  useEffect(() => {
    if (backgroundAudioUrl) {
      audioPlayerRef.current?.unload();

      const onEnded = () => {
        setIsPlaying(false);
      };

      audioPlayerRef.current = createAudioPlayer(
        backgroundAudioUrl,
        onEnded,
        {
          shouldPlay: isPlaying,
          isLooping: true,
        }
      );
    }

    return () => {
      audioPlayerRef.current?.unload();
    };
  }, [backgroundAudioUrl]);

  // Play/pause synchronization
  useEffect(() => {
    if (isPlaying) {
      audioPlayerRef.current?.play();
      videoRef.current?.playAsync();
    } else {
      audioPlayerRef.current?.pause();
      videoRef.current?.pauseAsync();
    }
  }, [isPlaying]);

  const onIndexChanged = (index: number) => {
    setCurrentIndex(index);
    if (media[index]?.media_type === 'video') {
      videoRef.current?.setPositionAsync(0);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    const isActive = index === currentIndex;
    const isVideo = item.media_type === 'video';
    const itemUri = item.s3_key || item.url || 'https://placehold.co/400x300?text=No+Media';

    if (isVideo) {
      return (
        <Video
          ref={isActive ? videoRef : null}
          source={{ uri: itemUri }}
          rate={1.0}
          volume={1.0}
          isMuted={isMuted || !isActive}
          shouldPlay={isActive && isPlaying}
          isLooping
          resizeMode={ResizeMode.CONTAIN}
          style={styles.media}
          useNativeControls={false}
        />
      );
    } else {
      return (
        <ExpoImage
          source={{ uri: itemUri }}
          style={styles.media}
          contentFit="contain"
          transition={300}
        />
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.infoText}>Loading Playlist...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={60} color="#ff5555" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (media.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="queue-music" size={60} color="#aaa" />
        <Text style={styles.infoText}>No media files found in playlist.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {playlistTitle}
        </Text>
      </View>

      <Swiper
        style={styles.wrapper}
        showsButtons={false}
        loop={false}
        onIndexChanged={onIndexChanged}
        dotStyle={styles.dot}
        activeDotStyle={styles.activeDot}
        paginationStyle={styles.pagination}
      >
        {media.map((item, index) => (
          <View key={`media-${item.id}-${index}`}>
            {renderMediaItem(item, index)}
          </View>
        ))}
      </Swiper>

      <View style={styles.controls}>
        <TouchableOpacity onPress={handleMuteToggle} style={styles.controlButton}>
          <MaterialCommunityIcons
            name={isMuted ? 'volume-off' : 'volume-high'}
            size={30}
            color="white"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
          <FontAwesome5
            name={isPlaying ? 'pause' : 'play'}
            size={28}
            color="white"
          />
        </TouchableOpacity>
        <View style={styles.controlButton} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    padding: 20,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 25 : 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  wrapper: {},
  media: {
    width: width,
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 15,
  },
  controlButton: {
    padding: 10,
  },
  pagination: {
    bottom: 80,
  },
  dot: {
    backgroundColor: 'rgba(255,255,255,.3)',
    width: 8,
    height: 8,
    borderRadius: 4,
    margin: 3,
  },
  activeDot: {
    backgroundColor: 'white',
    width: 10,
    height: 10,
    borderRadius: 5,
    margin: 3,
  },
  errorText: {
    color: '#ff5555',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
  },
  infoText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default PlaylistPlayer; 