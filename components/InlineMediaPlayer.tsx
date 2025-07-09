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

interface InlineMediaPlayerProps {
  file: MediaFile;
  size?: number;
  color?: string;
}

const InlineMediaPlayer: React.FC<InlineMediaPlayerProps> = ({ 
  file, 
  size = 20, 
  color = '#3b82f6' 
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Web audio fallback
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);
  
  // Use the new expo-audio hooks for mobile
  const player = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(player);
  
  // Use appropriate status based on platform
  const status = Platform.OS === 'web' ? {
    isLoaded: webAudioLoaded,
    playing: webAudioPlaying,
    isBuffering: false
  } : audioStatus;

  // Initialize audio when component mounts
  useEffect(() => {
    if (!isInitialized && file.id) {
      initializeAudio();
      setIsInitialized(true);
    }
  }, [file.id, isInitialized]);

  // Cleanup on unmount
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
      // Use the simple streaming endpoint (no authentication required)
      const streamingUrl = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://192.168.1.70:5001'}/api/media/${file.id}/stream`;
      
      if (Platform.OS === 'web') {
        // Use HTML5 Audio for web
        const audio = new Audio();
        webAudioRef.current = audio;
        
        audio.addEventListener('loadeddata', () => {
          setWebAudioLoaded(true);
        });
        
        audio.addEventListener('canplaythrough', () => {
          setWebAudioLoaded(true);
        });
        
        audio.addEventListener('play', () => {
          setWebAudioPlaying(true);
        });
        
        audio.addEventListener('pause', () => {
          setWebAudioPlaying(false);
        });
        
        audio.addEventListener('ended', () => {
          setWebAudioPlaying(false);
        });
        
        audio.addEventListener('error', (e) => {
          console.error('🔴 INLINE_PLAYER: Web audio error:', e);
          Alert.alert('Playback Error', 'Failed to load audio file');
        });
        
        audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata';
        audio.src = streamingUrl;
        audio.load();
      } else {
        // Use expo-audio for mobile
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
        } else {
          if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
            await audio.play();
          } else {
            Alert.alert('Loading...', 'Audio is still loading. Please wait a moment.');
          }
        }
      } else if (player) {
        if (!status.isLoaded) {
          Alert.alert('Loading...', 'Audio is still loading. Please wait a moment.');
          return;
        }
        
        if (status.playing) {
          await player.pause();
        } else {
          await player.play();
        }
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

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
    minHeight: 36,
  },
});

export default InlineMediaPlayer; 