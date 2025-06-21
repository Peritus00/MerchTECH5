
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

interface MediaFile {
  id: number;
  title: string;
  url: string;
  fileType: string;
  contentType: string;
}

interface MediaPlayerProps {
  mediaFiles: MediaFile[];
  playlistId?: string;
  shouldAutoplay?: boolean;
  onSetPlaybackState?: (isPlaying: boolean, trackIndex: number) => void;
  qrCodeId?: string;
}

export default function MediaPlayer({
  mediaFiles,
  shouldAutoplay = false,
  onSetPlaybackState,
  playlistId,
  qrCodeId,
}: MediaPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isLoading, setIsLoading] = useState(false);

  const currentTrack = mediaFiles[currentTrackIndex];

  // Initialize audio session
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error('Failed to initialize audio:', error);
      }
    };

    initializeAudio();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  // Load and play track
  const loadTrack = useCallback(async (trackIndex: number, autoplay: boolean = false) => {
    try {
      setIsLoading(true);
      if (sound) {
        await sound.unloadAsync();
      }

      const track = mediaFiles[trackIndex];
      if (!track) return;

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: track.url },
        {
          shouldPlay: autoplay,
          volume: volume,
          isLooping: false,
        },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrentTrackIndex(trackIndex);

      if (autoplay) {
        setIsPlaying(true);
        if (onSetPlaybackState) {
          onSetPlaybackState(true, trackIndex);
        }
      }
    } catch (error) {
      console.error('Error loading track:', error);
      Alert.alert('Error', 'Failed to load audio track');
    } finally {
      setIsLoading(false);
    }
  }, [sound, mediaFiles, volume, onSetPlaybackState]);

  // Playback status update
  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setProgress(status.durationMillis ? (status.positionMillis / status.durationMillis) * 100 : 0);

      if (status.didJustFinish) {
        playNextTrack();
      }
    }
  }, []);

  // Load initial track
  useEffect(() => {
    if (mediaFiles.length > 0) {
      loadTrack(0, shouldAutoplay);
    }
  }, [mediaFiles, shouldAutoplay]);

  // Play/Pause toggle
  const togglePlayPause = async () => {
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        if (onSetPlaybackState) {
          onSetPlaybackState(false, currentTrackIndex);
        }
      } else {
        await sound.playAsync();
        setIsPlaying(true);
        if (onSetPlaybackState) {
          onSetPlaybackState(true, currentTrackIndex);
        }
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  // Play next track
  const playNextTrack = () => {
    const nextIndex = currentTrackIndex < mediaFiles.length - 1 ? currentTrackIndex + 1 : 0;
    loadTrack(nextIndex, isPlaying);
  };

  // Play previous track
  const playPreviousTrack = () => {
    const prevIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : mediaFiles.length - 1;
    loadTrack(prevIndex, isPlaying);
  };

  // Seek to position
  const seekToPosition = async (value: number) => {
    if (!sound || !duration) return;
    const newPosition = (value / 100) * duration;
    try {
      await sound.setPositionAsync(newPosition);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  // Format time
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No tracks available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {currentTrack.title}
        </Text>
        <Text style={styles.trackCounter}>
          Track {currentTrackIndex + 1} of {mediaFiles.length}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Slider
          style={styles.progressSlider}
          value={progress}
          minimumValue={0}
          maximumValue={100}
          onValueChange={seekToPosition}
          minimumTrackTintColor="#3b82f6"
          maximumTrackTintColor="#e5e7eb"
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>-{formatTime(duration - position)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.playbackControls}>
          <TouchableOpacity
            onPress={playPreviousTrack}
            disabled={mediaFiles.length <= 1}
            style={[styles.controlButton, mediaFiles.length <= 1 && styles.disabledButton]}
          >
            <Ionicons name="play-skip-back" size={24} color="#374151" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlayPause}
            disabled={!currentTrack || isLoading}
            style={[styles.playButton, (!currentTrack || isLoading) && styles.disabledButton]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={28}
                color="#ffffff"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={playNextTrack}
            disabled={mediaFiles.length <= 1}
            style={[styles.controlButton, mediaFiles.length <= 1 && styles.disabledButton]}
          >
            <Ionicons name="play-skip-forward" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Volume Control */}
        <View style={styles.volumeContainer}>
          <Ionicons name="volume-medium" size={20} color="#6b7280" />
          <Slider
            style={styles.volumeSlider}
            value={volume}
            minimumValue={0}
            maximumValue={1}
            onValueChange={setVolume}
            minimumTrackTintColor="#3b82f6"
            maximumTrackTintColor="#e5e7eb"
          />
        </View>
      </View>

      {/* Playlist */}
      <View style={styles.playlistContainer}>
        <Text style={styles.playlistTitle}>Playlist ({mediaFiles.length} tracks):</Text>
        {mediaFiles.map((track, index) => (
          <TouchableOpacity
            key={track.id}
            onPress={() => loadTrack(index, isPlaying)}
            style={[
              styles.playlistItem,
              currentTrackIndex === index && styles.activePlaylistItem,
            ]}
          >
            <Text
              style={[
                styles.playlistItemText,
                currentTrackIndex === index && styles.activePlaylistItemText,
              ]}
              numberOfLines={1}
            >
              {track.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    margin: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  trackInfo: {
    marginBottom: 16,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  trackCounter: {
    fontSize: 14,
    color: '#6b7280',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressSlider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  controlsContainer: {
    marginBottom: 16,
  },
  playbackControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 8,
  },
  playButton: {
    backgroundColor: '#3b82f6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  volumeSlider: {
    flex: 1,
    marginLeft: 8,
    height: 40,
  },
  playlistContainer: {
    marginTop: 8,
  },
  playlistTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  playlistItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  activePlaylistItem: {
    backgroundColor: '#eff6ff',
  },
  playlistItemText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activePlaylistItemText: {
    color: '#3b82f6',
    fontWeight: '500',
  },
});
