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
      // Construct streaming URL more reliably
      let baseUrl: string;
      if (api.defaults.baseURL) {
        // Remove trailing /api if present
        baseUrl = api.defaults.baseURL.replace(/\/api\/?$/, '');
      } else {
        // Fallback to production URL
        baseUrl = 'https://merchtech5-production.up.railway.app';
      }
      
      const streamingUrl = `${baseUrl}/api/media/${file.id}/stream`;
      
      if (Platform.OS === 'web') {
        const audio = new (window as any)[String.fromCharCode(65, 117, 100, 105, 111)]();
        webAudioRef.current = audio;
        
        // Log initialization for debugging
        console.log('🔴 INLINE_PLAYER: Initializing audio:', {
          fileId: file.id,
          fileName: file.filename || file.title,
          streamingUrl,
          fileType: file.type || file.fileType,
          contentType: file.contentType,
          apiBaseURL: api.defaults.baseURL,
          constructedBaseUrl: baseUrl
        });
        
        audio.addEventListener('loadeddata', () => {
          console.log('🔴 INLINE_PLAYER: Audio loaded data:', {
            fileId: file.id,
            readyState: audio.readyState,
            duration: audio.duration,
            src: audio.src
          });
          setWebAudioLoaded(true);
        });
        audio.addEventListener('canplaythrough', () => {
          console.log('🔴 INLINE_PLAYER: Audio can play through:', {
            fileId: file.id,
            readyState: audio.readyState,
            src: audio.src
          });
          setWebAudioLoaded(true);
        });
        audio.addEventListener('play', () => setWebAudioPlaying(true));
        audio.addEventListener('pause', () => setWebAudioPlaying(false));
        audio.addEventListener('ended', () => setWebAudioPlaying(false));
        audio.addEventListener('error', (e) => {
          const audioElement = e.target as HTMLAudioElement;
          const error = audioElement.error;
          let errorMessage = 'Unknown error';
          
          if (error) {
            // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
            switch (error.code) {
              case 1: // MEDIA_ERR_ABORTED
                errorMessage = 'Media loading aborted';
                break;
              case 2: // MEDIA_ERR_NETWORK
                errorMessage = 'Network error while loading media';
                break;
              case 3: // MEDIA_ERR_DECODE
                errorMessage = 'Media decoding error - file may be corrupted or unsupported format';
                break;
              case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                errorMessage = 'Media format not supported or source not found - check URL and CORS';
                break;
              default:
                errorMessage = `Media error code: ${error.code}`;
            }
          }
          
          const errorCodeMeaning = error?.code === 1 ? 'MEDIA_ERR_ABORTED' :
                                   error?.code === 2 ? 'MEDIA_ERR_NETWORK' :
                                   error?.code === 3 ? 'MEDIA_ERR_DECODE' :
                                   error?.code === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' : 'UNKNOWN';
          
          console.error('🔴 INLINE_PLAYER: Web audio error:', {
            error,
            errorCode: error?.code,
            errorCodeMeaning,
            errorMessage,
            readyState: audioElement.readyState,
            networkState: audioElement.networkState,
            src: audioElement.src,
            currentSrc: audioElement.currentSrc,
            streamingUrl,
            fileId: file.id,
            fileName: file.filename || file.title,
            fileType: file.type || file.fileType,
            contentType: file.contentType
          });
          
          // Only show alert for non-abort errors (abort is usually user-initiated)
          if (error && error.code !== 1) {
            Alert.alert('Playback Error', `Failed to load audio file: ${errorMessage}\n\nURL: ${streamingUrl}`);
          }
        });
        
        // Set crossOrigin for CORS support
        // Note: 'anonymous' works with Access-Control-Allow-Origin: *
        audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata';
        audio.src = streamingUrl;
        
        // Try to load the audio
        audio.load();
        
        // Verify the URL is accessible after a short delay
        const verifyTimeout = setTimeout(() => {
          if (audio.readyState === 0 && audio.networkState === 3 && !audio.error) {
            console.warn('🔴 INLINE_PLAYER: Audio may have failed to load - verifying URL...');
            
            // Try a fetch to see if the URL is accessible
            fetch(streamingUrl, { 
              method: 'HEAD', 
              mode: 'cors',
              credentials: 'omit' // Match crossOrigin='anonymous'
            })
              .then(response => {
                console.log('🔴 INLINE_PLAYER: URL accessibility check:', {
                  status: response.status,
                  statusText: response.statusText,
                  ok: response.ok,
                  headers: {
                    'content-type': response.headers.get('content-type'),
                    'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
                    'content-length': response.headers.get('content-length')
                  }
                });
                
                if (!response.ok) {
                  console.error('🔴 INLINE_PLAYER: URL returned non-OK status:', response.status);
                }
              })
              .catch(fetchError => {
                console.error('🔴 INLINE_PLAYER: URL accessibility check failed:', fetchError);
              });
          }
        }, 2000);
        
        // Clear timeout if audio loads successfully
        audio.addEventListener('loadeddata', () => {
          clearTimeout(verifyTimeout);
        }, { once: true });
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