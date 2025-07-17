import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { MediaFile } from '@/shared/media-schema';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';

interface InlineMediaPlayerProps {
  file: MediaFile;
  size?: number;
  color?: string;
}

// Separate component for the Audio Player to ensure hooks are not conditional
const AudioPlayer: React.FC<InlineMediaPlayerProps> = ({ file, size, color }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const player = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(player);
  
  // Web audio fallback
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);

  const status = Platform.OS === 'web' ? {
    isLoaded: webAudioLoaded,
    playing: webAudioPlaying,
    isBuffering: false
  } : audioStatus;

  useEffect(() => {
    if (!isInitialized && file.id) {
      initializeAudio();
      setIsInitialized(true);
    }
  }, [file.id, isInitialized]);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
        webAudioRef.current = null;
      } else if (player) {
        player.pause();
      }
    };
  }, []);

  const initializeAudio = async () => {
    try {
      const baseUrl = api.defaults.baseURL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app';
      const streamingUrl = `${baseUrl}/api/media/${file.id}/stream`;
      
      if (Platform.OS === 'web') {
        const audio = new (window as any)[String.fromCharCode(65, 117, 100, 105, 111)]();
        webAudioRef.current = audio;
        
        audio.addEventListener('loadeddata', () => setWebAudioLoaded(true));
        audio.addEventListener('canplaythrough', () => setWebAudioLoaded(true));
        audio.addEventListener('play', () => setWebAudioPlaying(true));
        audio.addEventListener('pause', () => setWebAudioPlaying(false));
        audio.addEventListener('ended', () => setWebAudioPlaying(false));
        audio.addEventListener('error', (e) => {
          console.error('🔴 INLINE_PLAYER: Web audio error:', e);
          Alert.alert('Playback Error', 'Failed to load audio file');
        });
        
        audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata';
        audio.src = streamingUrl;
        audio.load();
      } else {
        await player.replace(streamingUrl);
      }
    } catch (error) {
      console.error('🔴 INLINE_PLAYER: Error initializing audio:', error);
      Alert.alert('Error', 'Failed to initialize audio player');
    }
  };

  const togglePlayPause = async () => {
    try {
      if (Platform.OS === 'web' && webAudioRef.current) {
        const audio = webAudioRef.current;
        if (webAudioPlaying) {
          audio.pause();
        } else if (audio.readyState >= 3) {
          await audio.play();
        } else {
          Alert.alert('Loading...', 'Audio is still loading. Please wait a moment.');
        }
      } else if (player) {
        if (!status.isLoaded) {
          Alert.alert('Loading...', 'Audio is still loading. Please wait a moment.');
          return;
        }
        status.playing ? await player.pause() : await player.play();
      }
    } catch (error) {
      console.error('🔴 INLINE_PLAYER: Error toggling playback:', error);
      Alert.alert('Playback Error', 'Failed to control audio playback');
    }
  };

  const isPlaying = status.playing;
  const isLoading = !status.isLoaded;

  return (
    <TouchableOpacity
      style={[styles.button, { opacity: isLoading ? 0.6 : 1 }]}
      onPress={togglePlayPause}
      disabled={isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <MaterialIcons
          name={isPlaying ? "pause" : "play-arrow"}
          size={size}
          color={color}
        />
      )}
    </TouchableOpacity>
  );
};


const InlineMediaPlayer: React.FC<InlineMediaPlayerProps> = ({ 
  file, 
  size = 20, 
  color = '#3b82f6' 
}) => {
  const router = useRouter();
  const isVideo = file.type === 'video' || file.fileType === 'video' || file.contentType?.startsWith('video/');

  if (isVideo) {
    return (
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          console.log('🔴 INLINE_PLAYER: Video file clicked, navigating to media player:', file.id);
          router.push(`/media-player/${file.id}`);
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons
          name="videocam"
          size={size}
          color={color}
        />
      </TouchableOpacity>
    );
  }

  // Render the dedicated audio player component for audio files
  return <AudioPlayer file={file} size={size} color={color} />;
};

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
    minHeight: 36,
  },
});

export default InlineMediaPlayer; 