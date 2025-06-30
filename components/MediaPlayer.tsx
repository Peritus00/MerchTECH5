import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';

interface MediaFile {
  id: number;
  title: string;
  url: string;
  fileType: string;
  contentType: string;
}

interface ProductLink {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

interface MediaPlayerProps {
  mediaFiles: MediaFile[];
  playlistId?: string;
  shouldAutoplay?: boolean;
  onSetPlaybackState?: (isPlaying: boolean, trackIndex: number) => void;
  qrCodeId?: string;
  productLinks?: ProductLink[];
}

export default function MediaPlayer({
  mediaFiles,
  shouldAutoplay = false,
  onSetPlaybackState,
  playlistId,
  qrCodeId,
  productLinks = [],
}: MediaPlayerProps) {
  console.log('🔴 MEDIA_PLAYER: MediaPlayer component initialized with:', {
    mediaFilesCount: mediaFiles.length,
    shouldAutoplay,
    playlistId,
    mediaFiles: mediaFiles
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(0.8);

  // Get current track
  const currentTrack = mediaFiles[currentTrackIndex];
  console.log('🔴 MEDIA_PLAYER: Current track set to:', currentTrack);
  
  // Use the new expo-audio hooks - create player without initial source
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  
  console.log('🔴 MEDIA_PLAYER: Audio player created, status:', {
    isLoaded: status.isLoaded,
    playing: status.playing,
    duration: status.duration,
    currentTime: status.currentTime
  });

  // Load track when currentTrack changes
  useEffect(() => {
    if (currentTrack && player && currentTrack.url) {
      console.log('🔴 MEDIA_PLAYER: Loading new track:', {
        title: currentTrack.title,
        url: currentTrack.url,
        fileType: currentTrack.fileType,
        contentType: currentTrack.contentType,
        id: currentTrack.id
      });
      
      // Check if it's an audio file (be flexible with field names)
      const isAudioFile = currentTrack.fileType === 'audio' || 
                         currentTrack.contentType?.startsWith('audio/') ||
                         currentTrack.fileType?.includes('audio');
      
      console.log('🔴 MEDIA_PLAYER: Is audio file?', isAudioFile);
      
      if (!isAudioFile) {
        console.log('🔴 MEDIA_PLAYER: Skipping non-audio file');
        return;
      }
      
      try {
        console.log('🔴 MEDIA_PLAYER: Attempting to replace player source...');
        player.replace({ uri: currentTrack.url });
        console.log('🔴 MEDIA_PLAYER: Player source replaced successfully');
        
        // Auto-play if requested
        if (shouldAutoplay) {
          console.log('🔴 MEDIA_PLAYER: Auto-play requested, starting in 100ms...');
          // Small delay to ensure track is loaded
          setTimeout(() => {
            try {
              console.log('🔴 MEDIA_PLAYER: Starting auto-play');
              player.play();
            } catch (playError) {
              console.error('🔴 MEDIA_PLAYER: Error auto-playing:', playError);
            }
          }, 100);
        }
      } catch (error) {
        console.error('🔴 MEDIA_PLAYER: Error loading track:', error);
        console.error('🔴 MEDIA_PLAYER: Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
        Alert.alert('Error', `Failed to load audio track: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log('🔴 MEDIA_PLAYER: Not loading track because:', {
        hasCurrentTrack: !!currentTrack,
        hasPlayer: !!player,
        hasUrl: !!currentTrack?.url,
        currentTrack: currentTrack
      });
    }
  }, [currentTrack, player, shouldAutoplay]);

  // Track navigation functions (defined before useEffects that use them)
  const playNextTrack = useCallback(() => {
    console.log('🎵 Playing next track');
    if (currentTrackIndex < mediaFiles.length - 1) {
      setCurrentTrackIndex(currentTrackIndex + 1);
    } else {
      setCurrentTrackIndex(0); // Loop back to first track
    }
  }, [currentTrackIndex, mediaFiles.length]);

  const playPreviousTrack = useCallback(() => {
    console.log('🎵 Playing previous track');
    if (currentTrackIndex > 0) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    } else {
      setCurrentTrackIndex(mediaFiles.length - 1); // Loop to last track
    }
  }, [currentTrackIndex, mediaFiles.length]);

  // Initialize audio and load first track
  useEffect(() => {
    if (mediaFiles.length > 0 && shouldAutoplay && player && currentTrack) {
      setCurrentTrackIndex(0);
      setTimeout(() => {
        try {
          player.play();
        } catch (error) {
          console.error('🎵 Autoplay failed:', error);
        }
      }, 100); // Small delay to ensure player is ready
    }
  }, [mediaFiles, shouldAutoplay, player, currentTrack]);

  // Update playback state when status changes
  useEffect(() => {
    if (onSetPlaybackState) {
      onSetPlaybackState(status.playing, currentTrackIndex);
    }
  }, [status.playing, currentTrackIndex, onSetPlaybackState]);

  // Handle track completion
  useEffect(() => {
    if (status.didJustFinish) {
      playNextTrack();
    }
  }, [status.didJustFinish, playNextTrack]);

  // Play/Pause toggle
  const togglePlayPause = () => {
    console.log('🔴 MEDIA_PLAYER: Play button clicked!');
    console.log('🔴 MEDIA_PLAYER: Player status:', { 
      isLoaded: status.isLoaded, 
      isBuffering: status.isBuffering,
      duration: status.duration,
      currentTime: status.currentTime,
      playing: status.playing
    });
    console.log('🔴 MEDIA_PLAYER: Current track:', {
      title: currentTrack?.title,
      url: currentTrack?.url,
      fileType: currentTrack?.fileType,
      contentType: currentTrack?.contentType
    });
    
    if (!player) {
      console.log('🔴 MEDIA_PLAYER: No player available');
      Alert.alert('Error', 'Audio player not initialized');
      return;
    }
    
    if (!currentTrack || !currentTrack.url) {
      console.log('🔴 MEDIA_PLAYER: No current track or URL available');
      Alert.alert('Error', 'No audio track selected');
      return;
    }
    
    // Check if it's an audio file (be flexible with field names)
    const isAudioFile = currentTrack.fileType === 'audio' || 
                       currentTrack.contentType?.startsWith('audio/') ||
                       currentTrack.fileType?.includes('audio');
    
    if (!isAudioFile) {
      console.log('🔴 MEDIA_PLAYER: Current track is not an audio file');
      Alert.alert('Error', 'This file is not an audio file and cannot be played.');
      return;
    }
    
    if (!status.isLoaded) {
      console.log('🔴 MEDIA_PLAYER: Track not loaded yet');
      Alert.alert('Error', 'Audio track is still loading. Please wait...');
      return;
    }
    
    try {
      if (status.playing) {
        console.log('🔴 MEDIA_PLAYER: Pausing...');
        player.pause();
        console.log('🔴 MEDIA_PLAYER: Pause command sent');
      } else {
        console.log('🔴 MEDIA_PLAYER: Playing...');
        player.play();
        console.log('🔴 MEDIA_PLAYER: Play command sent');
      }
    } catch (error) {
      console.error('🔴 MEDIA_PLAYER: Error toggling playback:', error);
      console.error('🔴 MEDIA_PLAYER: Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      Alert.alert('Error', `Failed to control playback: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const seekToPosition = async (value: number) => {
    if (player && status.duration) {
      try {
        const seekTime = (value / 100) * status.duration;
        player.seekTo(seekTime);
      } catch (error) {
        console.error('Error seeking:', error);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProductLinkPress = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
  };

  if (!currentTrack) {
    return (
      <View style={styles.container}>
        <Text style={styles.noMediaText}>No media files available</Text>
      </View>
    );
  }

  const progress = status.duration ? (status.currentTime / status.duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle}>{currentTrack.title}</Text>
        <Text style={styles.trackCount}>
          {currentTrackIndex + 1} of {mediaFiles.length}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>
            {formatTime(status.currentTime || 0)}
          </Text>
          <Text style={styles.timeText}>
            {formatTime(status.duration || 0)}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={playPreviousTrack}
          disabled={mediaFiles.length <= 1}
        >
          <Ionicons name="play-skip-back" size={24} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, status.isBuffering && styles.loadingButton]}
          onPress={togglePlayPause}
          disabled={!status.isLoaded || status.isBuffering}
        >
          {status.isBuffering ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={32}
              color="#fff"
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={playNextTrack}
          disabled={mediaFiles.length <= 1}
        >
          <Ionicons name="play-skip-forward" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Volume Control */}
      <View style={styles.volumeContainer}>
        <Ionicons name="volume-low" size={20} color="#666" />
        <View style={styles.volumeSlider}>
          <View style={styles.volumeTrack}>
            <View style={[styles.volumeFill, { width: `${volume * 100}%` }]} />
          </View>
        </View>
        <Ionicons name="volume-high" size={20} color="#666" />
      </View>

      {/* Product Links */}
      {productLinks.length > 0 && (
        <View style={styles.productLinksContainer}>
          <Text style={styles.productLinksTitle}>Featured Products</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {productLinks
              .filter(link => link.isActive)
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((link) => (
                <TouchableOpacity
                  key={link.id}
                  style={styles.productLink}
                  onPress={() => handleProductLinkPress(link.url)}
                >
                  {link.imageUrl && (
                    <Image
                      source={{ uri: link.imageUrl }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle} numberOfLines={2}>
                      {link.title}
                    </Text>
                    {link.description && (
                      <Text style={styles.productDescription} numberOfLines={2}>
                        {link.description}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  noMediaText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 50,
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 30,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  trackCount: {
    fontSize: 14,
    color: '#666',
  },
  progressContainer: {
    marginBottom: 30,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#666',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  controlButton: {
    padding: 15,
    marginHorizontal: 20,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  loadingButton: {
    backgroundColor: '#999',
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  volumeSlider: {
    flex: 1,
    marginHorizontal: 15,
  },
  volumeTrack: {
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  productLinksContainer: {
    marginTop: 20,
  },
  productLinksTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  productLink: {
    width: width * 0.6,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginRight: 15,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  productImage: {
    width: '100%',
    height: 120,
  },
  productInfo: {
    padding: 12,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  productDescription: {
    fontSize: 12,
    color: '#666',
  },
}); 