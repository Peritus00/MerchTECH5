import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { Audio } from 'expo-audio';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ProductLink } from '@/shared/media-schema';

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
  productLinks?: ProductLink[];
}

// Global audio instance manager to prevent multiple players
let globalAudioInstance: Audio.Sound | null = null;
let activePlayerId: string | null = null;

export default function PreviewPlayer({
  mediaFiles,
  playlistName,
  previewDuration = 25,
  autoplay = false,
  productLinks = [],
}: PreviewPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(previewDuration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);
  // Create unique instance ID
  const [playerId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [isInstanceActive, setIsInstanceActive] = useState(false);

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
      // Clean up this instance
      if (sound) {
        sound.unloadAsync();
      }
      
      // Clean up global instance if it's ours
      if (globalAudioInstance && activePlayerId === playerId) {
        globalAudioInstance.unloadAsync();
        globalAudioInstance = null;
        activePlayerId = null;
      }
      
      setIsInstanceActive(false);
    };
  }, []);

  // Load track with global instance management
  const loadTrack = async (index: number) => {
    // Stop any existing global audio instance
    if (globalAudioInstance && activePlayerId !== playerId) {
      try {
        await globalAudioInstance.unloadAsync();
      } catch (error) {
        console.log('Error stopping previous audio instance:', error);
      }
      globalAudioInstance = null;
    }

    if (sound) {
      await sound.unloadAsync();
      setSound(null);
    }

    setCurrentTrack(index);
    setIsPlaying(false);
    setCurrentTime(0);
    setTimeLeft(previewDuration);
    setIsInstanceActive(true);
    activePlayerId = playerId;

    const media = mediaFiles[index];
    if (!media) return;

    try {
      // For demo purposes, we'll create a silent sound to prevent errors
      // In production, you'd use the actual media.url
      const demoAudio = Audio.Sound.createAsync(
        { uri: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' },
        {
          shouldPlay: false,
          isLooping: false,
          volume: isMuted ? 0 : volume,
        }
      );

      const { sound: newSound } = await demoAudio;
      setSound(newSound);
      globalAudioInstance = newSound;

      // Set up status update listener with instance check
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!isInstanceActive || activePlayerId !== playerId) return; // Prevent updates from inactive instances

        if (status.isLoaded && status.positionMillis !== undefined) {
          const currentTimeSeconds = Math.floor(status.positionMillis / 1000);
          setCurrentTime(currentTimeSeconds);
          setTimeLeft(Math.max(0, previewDuration - currentTimeSeconds));

          // Stop at preview duration
          if (currentTimeSeconds >= previewDuration) {
            newSound.pauseAsync();
            setIsPlaying(false);
            setPreviewEnded(true);
          }
        }
      });
    } catch (error) {
      console.error('Error loading track:', error);
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

  // Auto-play with instance management
  useEffect(() => {
    if (autoplay && sound && !previewEnded) {
      // Add a small delay to prevent multiple instances from starting simultaneously
      const timer = setTimeout(() => {
        handlePlay();
      }, 100);
      return () => clearTimeout(timer);
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

  // Handle product link press
  const handleProductLinkPress = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this URL');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
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
    <View style={styles.container}>
      <LinearGradient
        colors={['#7c3aed', '#3b82f6']}
        style={styles.playerContainer}
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

      {/* Product Links Section */}
      {productLinks.length > 0 && (
        <View style={styles.productLinksContainer}>
          <Text style={styles.productLinksTitle}>Featured Products</Text>
          <ScrollView 
            style={styles.productLinksList}
            showsVerticalScrollIndicator={false}
          >
            {productLinks
              .filter(link => link.isActive)
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((link) => (
                <TouchableOpacity
                  key={link.id}
                  style={styles.productLinkCard}
                  onPress={() => handleProductLinkPress(link.url)}
                >
                  {link.imageUrl ? (
                    <Image
                      source={{ uri: link.imageUrl }}
                      style={styles.productLinkImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.productLinkPlaceholder}>
                      <MaterialIcons name="shopping-bag" size={24} color="#9ca3af" />
                    </View>
                  )}
                  <View style={styles.productLinkContent}>
                    <Text style={styles.productLinkTitle} numberOfLines={2}>
                      {link.title}
                    </Text>
                    {link.description && (
                      <Text style={styles.productLinkDescription} numberOfLines={2}>
                        {link.description}
                      </Text>
                    )}
                    <View style={styles.productLinkAction}>
                      <MaterialIcons name="open-in-new" size={16} color="#3b82f6" />
                      <Text style={styles.productLinkActionText}>View Product</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 400,
  },
  playerContainer: {
    flex: 2,
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
  productLinksContainer: {
    flex: 1,
    minWidth: 200,
    maxWidth: 300,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  productLinksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  productLinksList: {
    flex: 1,
  },
  productLinkCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  productLinkImage: {
    width: '100%',
    height: 80,
    borderRadius: 6,
    marginBottom: 8,
  },
  productLinkPlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  productLinkContent: {
    flex: 1,
  },
  productLinkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  productLinkDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginBottom: 8,
  },
  productLinkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productLinkActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3b82f6',
  },
});