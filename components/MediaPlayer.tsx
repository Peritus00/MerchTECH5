import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import Swiper from 'react-native-swiper';
import { Video } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import createAudioPlayer, {
  IAudioPlayer,
} from '../services/audio/AudioService';
import { Media } from '../types';
import { api } from '../services/api';

const { width } = Dimensions.get('window');

interface MediaPlayerProps {
  mediaId?: string;
  type?: string;
  media?: any[];
  playlist?: any;
  slideshow?: any;
  autoPlay?: boolean;
}

const MediaPlayer = ({ mediaId, type, media: externalMedia, playlist, slideshow, autoPlay = false }: MediaPlayerProps) => {
  const [media, setMedia] = useState<Media[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<Video>(null);
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);

  const blurhash =
    '|rF?hV%2WCj[ayj[a_jAdofQIUWVoffaRiWVoffaRiWV';

  const fetchMedia = useCallback(async () => {
    // If external data is provided, use it instead of fetching
    if (externalMedia || playlist || slideshow) {
      console.log('Using external data provided to MediaPlayer');
      
      if (externalMedia) {
        setMedia(externalMedia);
        setPlaylistTitle(playlist?.name || slideshow?.name || 'Media Player');
      } else if (playlist) {
        setMedia(playlist.mediaFiles || []);
        setPlaylistTitle(playlist.name || 'Playlist');
      } else if (slideshow) {
        setMedia(slideshow.images || []);
        setPlaylistTitle(slideshow.name || 'Slideshow');
      }
      
      setLoading(false);
      return;
    }

    // Fallback to fetching data if no external data provided
    if (!mediaId || !type) {
      console.error('MediaPlayer: No external data provided and no mediaId/type for fetching');
      setError('No media data available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log(
        `Fetching media for ID: ${mediaId}, Type: ${type}`
      );
      const response = await api.get(`/${type}-access/${mediaId}`);
      console.log('API Response:', response.data);

      if (response.data && response.data.media) {
        setMedia(response.data.media);
        setPlaylistTitle(
          response.data.title || response.data.name || 'Media Player'
        );
      } else {
        setError(
          'No media found for this content. Please check the link and try again.'
        );
      }
    } catch (err: any) {
      console.error('Failed to fetch media:', err);
      const errorMessage =
        err.response?.data?.message ||
        'Could not load media. The content may be private or no longer available.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [mediaId, type, externalMedia, playlist, slideshow]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const currentMediaItem = useMemo(() => {
    return media.length > 0 ? media[currentIndex] : null;
  }, [media, currentIndex]);

  const backgroundAudioUrl = useMemo(() => {
    return (
      media.find((item) => item.media_type === 'audio')?.s3_key || null
    );
  }, [media]);

  // This effect manages the lifecycle of the background audio player
  useEffect(() => {
    if (backgroundAudioUrl) {
      console.log('BACKGROUND_AUDIO: Setting up audio player.');
      // Unload any existing player first
      audioPlayerRef.current?.unload();

      const onEnded = () => {
        console.log('BACKGROUND_AUDIO: Playback finished.');
        setIsPlaying(false);
      };

      // Create a new player instance
      audioPlayerRef.current = createAudioPlayer(
        backgroundAudioUrl,
        onEnded,
        {
          shouldPlay: isPlaying,
          isLooping: true, // Typically background music should loop
        }
      );
    }

    // Cleanup function to unload the audio player when the component unmounts
    // or when the background audio URL changes.
    return () => {
      console.log('BACKGROUND_AUDIO: Unloading audio player.');
      audioPlayerRef.current?.unload();
    };
  }, [backgroundAudioUrl]); // Re-run only when the audio URL changes

  // This effect handles the play/pause state synchronization
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
    // If we swipe to a new slide that has a video, we might want to automatically
    // seek the video to the beginning.
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

  const renderMediaItem = (item: Media, index: number) => {
    const isActive = index === currentIndex;
    const isVideo = item.media_type === 'video';

    if (isVideo) {
      return (
        <Video
          ref={isActive ? videoRef : null}
          source={{ uri: item.s3_key }}
          rate={1.0}
          volume={1.0}
          isMuted={isMuted || !isActive}
          shouldPlay={isActive && isPlaying}
          isLooping
          resizeMode="contain"
          style={styles.media}
          useNativeControls={false}
        />
      );
    } else {
      return (
        <ExpoImage
          source={{ uri: item.s3_key }}
          style={styles.media}
          contentFit="contain"
          placeholder={{ blurhash }}
          transition={300}
        />
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.infoText}>Loading Media...</Text>
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
        <MaterialIcons name="cloud-off" size={60} color="#aaa" />
        <Text style={styles.infoText}>No media files found.</Text>
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
        {media.map(renderMediaItem)}
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

export default MediaPlayer; 