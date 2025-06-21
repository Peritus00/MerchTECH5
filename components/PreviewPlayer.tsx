
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface MediaFile {
  id: number;
  title: string;
  url: string;
  fileType: string;
  contentType: string;
}

interface PreviewPlayerProps {
  mediaFiles: MediaFile[];
  playlistName: string;
  previewDuration?: number; // in seconds, default 25
  autoplay?: boolean;
}

export default function PreviewPlayer({
  mediaFiles,
  playlistName,
  previewDuration = 25,
  autoplay = false,
}: PreviewPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(previewDuration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);

  const currentMedia = mediaFiles[currentTrack];

  // Initialize audio
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
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

  // Load track
  const loadTrack = async (trackIndex: number) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }

      const track = mediaFiles[trackIndex];
      if (!track) return;

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: track.url },
        {
          shouldPlay: false,
          volume: isMuted ? 0 : volume,
          isLooping: false,
        },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrentTrack(trackIndex);
    } catch (error) {
      console.error('Error loading track:', error);
      Alert.alert('Error', 'Failed to load audio track');
    }
  };

  // Playback status update
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      const currentSeconds = Math.floor(status.positionMillis / 1000);
      setCurrentTime(currentSeconds);
      setTimeLeft(Math.max(0, previewDuration - currentSeconds));

      // End preview after duration
      if (currentSeconds >= previewDuration) {
        handlePause();
        setPreviewEnded(true);
      }
    }
  };

  // Load initial track
  useEffect(() => {
    if (mediaFiles.length > 0) {
      loadTrack(0);
    }
  }, [mediaFiles]);

  // Auto-play
  useEffect(() => {
    if (autoplay && sound && !previewEnded) {
      handlePlay();
    }
  }, [sound, autoplay]);

  // Handle play
  const handlePlay = async () => {
    if (!sound || previewEnded) return;

    try {
      await sound.playAsync();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing:', error);
    }
  };

  // Handle pause
  const handlePause = async () => {
    if (!sound) return;

    try {
      await sound.pauseAsync();
      setIsPlaying(false);
    } catch (error) {
      console.error('Error pausing:', error);
    }
  };

  // Handle next
  const handleNext = () => {
    if (mediaFiles.length <= 1) return;
    
    const nextIndex = currentTrack < mediaFiles.length - 1 ? currentTrack + 1 : 0;
    loadTrack(nextIndex);
    setCurrentTime(0);
    setTimeLeft(previewDuration);
    setPreviewEnded(false);
  };

  // Handle previous
  const handlePrevious = () => {
    if (mediaFiles.length <= 1) return;
    
    const prevIndex = currentTrack > 0 ? currentTrack - 1 : mediaFiles.length - 1;
    loadTrack(prevIndex);
    setCurrentTime(0);
    setTimeLeft(previewDuration);
    setPreviewEnded(false);
  };

  // Toggle mute
  const toggleMute = async () => {
    if (!sound) return;
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    
    try {
      await sound.setVolumeAsync(newMuteState ? 0 : volume);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  if (!currentMedia) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No media available for preview</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#7c3aed', '#3b82f6']}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.playlistName}>{playlistName}</Text>
          <Text style={styles.subtitle}>25-Second Preview</Text>
        </View>

        {/* Current Track Info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentMedia.title}
          </Text>
          <Text style={styles.trackCounter}>
            Track {currentTrack + 1} of {mediaFiles.length}
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(currentTime / previewDuration) * 100}%` }
              ]} 
            />
          </View>
          <View style={styles.timeDisplay}>
            <Text style={styles.timeText}>{currentTime}s</Text>
            <View style={styles.timeLeftContainer}>
              <Ionicons name="time-outline" size={16} color="#e0e7ff" />
              <Text style={styles.timeText}>{timeLeft}s left</Text>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={handlePrevious}
            disabled={mediaFiles.length <= 1}
            style={[styles.controlButton, mediaFiles.length <= 1 && styles.disabledControl]}
          >
            <Ionicons name="play-skip-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isPlaying ? handlePause : handlePlay}
            disabled={previewEnded}
            style={[styles.playButton, previewEnded && styles.disabledControl]}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={32}
              color="#ffffff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            disabled={mediaFiles.length <= 1}
            style={[styles.controlButton, mediaFiles.length <= 1 && styles.disabledControl]}
          >
            <Ionicons name="play-skip-forward" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Volume */}
        <TouchableOpacity onPress={toggleMute} style={styles.volumeButton}>
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={24}
            color="#ffffff"
          />
        </TouchableOpacity>

        {/* Preview End Message */}
        {previewEnded && (
          <View style={styles.endMessage}>
            <Text style={styles.endText}>Preview completed!</Text>
            <Text style={styles.endSubtext}>Scan QR code for full access</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 400,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  playlistName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#e0e7ff',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  trackCounter: {
    fontSize: 14,
    color: '#e0e7ff',
  },
  progressContainer: {
    marginBottom: 32,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    color: '#e0e7ff',
  },
  timeLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 16,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
  },
  disabledControl: {
    opacity: 0.5,
  },
  volumeButton: {
    alignSelf: 'center',
    padding: 12,
  },
  endMessage: {
    alignItems: 'center',
    marginTop: 24,
  },
  endText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  endSubtext: {
    fontSize: 14,
    color: '#e0e7ff',
  },
});
