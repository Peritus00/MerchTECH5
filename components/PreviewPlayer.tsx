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
  Platform,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ProductLink } from '@/shared/media-schema';
import PlaylistChat from './PlaylistChat';

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
  playlistId?: string;
  previewDuration?: number; // in seconds, default 25
  autoplay?: boolean;
  productLinks?: ProductLink[];
  onPreviewComplete?: () => void;
}

export default function PreviewPlayer({
  mediaFiles,
  playlistName,
  playlistId,
  previewDuration = 25,
  autoplay = false,
  productLinks = [],
  onPreviewComplete,
}: PreviewPlayerProps) {
  const [currentTrack, setCurrentTrack] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(previewDuration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [productImageIndexes, setProductImageIndexes] = useState<{[key: string]: number}>({});

  // Web audio fallback
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);
  const [webAudioCurrentTime, setWebAudioCurrentTime] = useState(0);

  const currentMedia = mediaFiles[currentTrack];
  
  // Determine if current media is video or audio
  const isVideo = currentMedia?.fileType === 'video' || currentMedia?.contentType?.startsWith('video/');
  
  // Use the new expo-audio hooks for audio
  const audioPlayer = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  
  // Use the new expo-video hooks for video
  const videoPlayer = useVideoPlayer(currentMedia && isVideo ? currentMedia.url : null, (player) => {
    player.loop = false;
    player.muted = isMuted;
  });
  
  // Use appropriate player and status based on media type and platform
  const player = isVideo ? videoPlayer : (Platform.OS === 'web' ? webAudioRef.current : audioPlayer);
  const status = isVideo ? videoPlayer.status : (Platform.OS === 'web' ? {
    isLoaded: webAudioLoaded,
    playing: webAudioPlaying,
    currentTime: webAudioCurrentTime,
    duration: webAudioRef.current?.duration || NaN,
    isBuffering: false
  } : audioStatus);

  // Load track when current track changes
  useEffect(() => {
    if (currentMedia && currentMedia.url) {
      console.log('🔴 PREVIEW_PLAYER: Loading media:', currentMedia.title, 'Type:', isVideo ? 'video' : 'audio', 'URL:', currentMedia.url);
      console.log('🔴 PREVIEW_PLAYER: API URL check:', {
        EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
        Platform: Platform.OS,
        isLocalhost: currentMedia.url.includes('localhost')
      });
      console.log('🔴 PREVIEW_PLAYER: Media details:', {
        id: currentMedia.id,
        title: currentMedia.title,
        url: currentMedia.url,
        fileType: currentMedia.fileType,
        contentType: currentMedia.contentType,
        isVideo: isVideo
      });
      
      try {
        // Use the URL provided by the server (should already be the streaming URL)
        const streamingUrl = currentMedia.url;
        console.log('🔴 PREVIEW_PLAYER: Using streaming URL:', streamingUrl);
        
        if (isVideo) {
          // Video player handles URL automatically through useVideoPlayer hook
          console.log('🔴 PREVIEW_PLAYER: Video player will handle URL automatically');
        } else if (Platform.OS === 'web') {
          // Use HTML5 Audio for web
          console.log('🔴 PREVIEW_PLAYER: Using HTML5 Audio for web');
          if (webAudioRef.current) {
            webAudioRef.current.pause();
            webAudioRef.current.removeEventListener('loadeddata', () => {});
            webAudioRef.current.removeEventListener('timeupdate', () => {});
            webAudioRef.current.removeEventListener('play', () => {});
            webAudioRef.current.removeEventListener('pause', () => {});
            webAudioRef.current.removeEventListener('ended', () => {});
            webAudioRef.current.removeEventListener('error', () => {});
            webAudioRef.current.src = '';
          }
          
          const audio = new Audio();
          webAudioRef.current = audio;
          setWebAudioLoaded(false);
          setWebAudioPlaying(false);
          setWebAudioCurrentTime(0);
          
          // Set up event listeners before setting src
          audio.addEventListener('loadeddata', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio loaded successfully');
            setWebAudioLoaded(true);
          });
          
          audio.addEventListener('canplaythrough', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio can play through');
            setWebAudioLoaded(true);
          });
          
          audio.addEventListener('timeupdate', () => {
            setWebAudioCurrentTime(audio.currentTime);
          });
          
          audio.addEventListener('play', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio started playing');
            setWebAudioPlaying(true);
          });
          
          audio.addEventListener('pause', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio paused');
            setWebAudioPlaying(false);
          });
          
          audio.addEventListener('ended', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio ended');
            setWebAudioPlaying(false);
          });
          
          audio.addEventListener('error', (e) => {
            console.error('🔴 PREVIEW_PLAYER: Web audio error:', e);
            console.error('🔴 PREVIEW_PLAYER: Audio error details:', {
              error: audio.error,
              networkState: audio.networkState,
              readyState: audio.readyState,
              src: audio.src
            });
          });
          
          audio.addEventListener('loadstart', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio load started');
          });
          
          audio.addEventListener('progress', () => {
            console.log('🔴 PREVIEW_PLAYER: Web audio loading progress');
          });
          
          // Set crossOrigin before src to handle CORS
          audio.crossOrigin = 'anonymous';
          audio.preload = 'auto';
          
          // Set the source URL
          audio.src = streamingUrl;
          
          // Start loading
          audio.load();
          
          console.log('🔴 PREVIEW_PLAYER: Web audio setup complete, loading started');
        } else {
          // Load audio track with expo-audio for mobile
          console.log('🔴 PREVIEW_PLAYER: Loading audio with expo-audio for mobile');
          console.log('🔴 PREVIEW_PLAYER: Streaming URL:', streamingUrl);
          
          audioPlayer.replace(streamingUrl).then(() => {
            console.log('🔴 PREVIEW_PLAYER: Audio loaded successfully on mobile');
          }).catch((audioError) => {
            console.error('🔴 PREVIEW_PLAYER: Failed to load audio on mobile:', audioError);
          });
        }
        console.log('🔴 PREVIEW_PLAYER: Media loading initiated successfully');
      } catch (error) {
        console.error('🔴 PREVIEW_PLAYER: Error loading media:', error);
        console.error('🔴 PREVIEW_PLAYER: Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
    }
  }, [currentMedia, audioPlayer, isVideo]);

  // Load track
  const loadTrack = (index: number) => {
    setCurrentTrack(index);
    setCurrentTime(0);
    setTimeLeft(previewDuration);
    setPreviewEnded(false);
  };

  // Track preview time and end after duration
  useEffect(() => {
    const currentPlayTime = isVideo ? videoPlayer.currentTime : 
                           (Platform.OS === 'web' ? webAudioCurrentTime : audioStatus.currentTime);
    const isPlaying = isVideo ? videoPlayer.playing : 
                     (Platform.OS === 'web' ? webAudioPlaying : audioStatus.playing);
    
    if (isPlaying && currentPlayTime) {
      const currentSeconds = Math.floor(currentPlayTime);
      setCurrentTime(currentSeconds);
      setTimeLeft(Math.max(0, previewDuration - currentSeconds));

      // End preview after duration
      if (currentSeconds >= previewDuration) {
        handlePause();
        setPreviewEnded(true);
        if (onPreviewComplete) {
          onPreviewComplete();
        }
      }
    }
  }, [isVideo, videoPlayer.playing, videoPlayer.currentTime, webAudioPlaying, webAudioCurrentTime, audioStatus.playing, audioStatus.currentTime, previewDuration, onPreviewComplete]);

  // Load initial track
  useEffect(() => {
    if (mediaFiles.length > 0) {
      loadTrack(0);
    }
  }, [mediaFiles]);

  // Auto-play if enabled
  useEffect(() => {
    if (autoplay && status.isLoaded && !previewEnded && !hasUserInteracted) {
      const timer = setTimeout(() => {
        handlePlay();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoplay, status.isLoaded, previewEnded, hasUserInteracted]);

  // Cleanup effect - stop audio when component unmounts
  useEffect(() => {
    return () => {
      console.log('🔴 PREVIEW_PLAYER: Component unmounting, cleaning up audio');
      if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
        webAudioRef.current = null;
      } else if (audioPlayer) {
        audioPlayer.pause();
      }
    };
  }, [audioPlayer]);

  // Handle play
  const handlePlay = async () => {
    if (previewEnded) return;

    console.log('🔴 PREVIEW_PLAYER: Play button clicked!');
    console.log('🔴 PREVIEW_PLAYER: Player status:', { 
      isLoaded: status.isLoaded, 
      isBuffering: status.isBuffering,
      duration: status.duration,
      currentTime: status.currentTime,
      playing: status.playing
    });

    // Hide overlay on first interaction
    if (showPlayOverlay) {
      setShowPlayOverlay(false);
    }
    setHasUserInteracted(true);

    if (!currentMedia || !currentMedia.url) {
      console.log('🔴 PREVIEW_PLAYER: No current media or URL available');
      Alert.alert('Error', 'No audio track selected');
      return;
    }

    try {
      if (isVideo) {
        console.log('🔴 PREVIEW_PLAYER: Starting video playback...');
        if (!player) {
          console.log('🔴 PREVIEW_PLAYER: No video player available');
          Alert.alert('Error', 'Video player not initialized');
          return;
        }
        videoPlayer.play();
        console.log('🔴 PREVIEW_PLAYER: Video playback started successfully');
      } else if (Platform.OS === 'web' && webAudioRef.current) {
        // Check if it's an audio file
        const isAudioFile = currentMedia.fileType === 'audio' || 
                           currentMedia.contentType?.startsWith('audio/') ||
                           currentMedia.fileType?.includes('audio');
        
        if (!isAudioFile) {
          console.log('🔴 PREVIEW_PLAYER: Current track is not an audio file');
          Alert.alert('Error', 'This file is not an audio file and cannot be played.');
          return;
        }

        console.log('🔴 PREVIEW_PLAYER: Web audio details:', {
          loaded: webAudioLoaded,
          readyState: webAudioRef.current.readyState,
          networkState: webAudioRef.current.networkState,
          src: webAudioRef.current.src,
          duration: webAudioRef.current.duration
        });

        if (webAudioLoaded || webAudioRef.current.readyState >= 3) { // HAVE_FUTURE_DATA or higher
          console.log('🔴 PREVIEW_PLAYER: Starting web audio playback...');
          await webAudioRef.current.play();
          console.log('🔴 PREVIEW_PLAYER: Web audio playback started successfully');
        } else if (webAudioRef.current.readyState >= 1) { // HAVE_METADATA
          console.log('🔴 PREVIEW_PLAYER: Audio metadata loaded, attempting to play...');
          try {
            await webAudioRef.current.play();
            console.log('🔴 PREVIEW_PLAYER: Web audio playback started successfully');
          } catch (playError) {
            console.log('🔴 PREVIEW_PLAYER: Play failed, audio still loading. Waiting for more data...');
            Alert.alert('Loading', 'Audio is still loading. Please wait a moment and try again...');
          }
        } else {
          console.log('🔴 PREVIEW_PLAYER: Web audio track not loaded yet, checking loading state...');
          
          // Try to trigger loading if it hasn't started
          if (webAudioRef.current.networkState === 0) { // NETWORK_EMPTY
            console.log('🔴 PREVIEW_PLAYER: Network empty, reloading audio...');
            webAudioRef.current.load();
          }
          
          Alert.alert('Loading', 'Audio track is still loading. Please wait a moment and try again...');
          
          // Set up a one-time listener to auto-play when ready
          const autoPlayWhenReady = () => {
            if (webAudioRef.current && webAudioRef.current.readyState >= 3) {
              console.log('🔴 PREVIEW_PLAYER: Auto-playing when ready...');
              webAudioRef.current.play().catch(e => {
                console.error('🔴 PREVIEW_PLAYER: Auto-play failed:', e);
              });
              webAudioRef.current.removeEventListener('canplaythrough', autoPlayWhenReady);
            }
          };
          webAudioRef.current.addEventListener('canplaythrough', autoPlayWhenReady);
        }
      } else {
        // Check if it's an audio file
        const isAudioFile = currentMedia.fileType === 'audio' || 
                           currentMedia.contentType?.startsWith('audio/') ||
                           currentMedia.fileType?.includes('audio');
        
        if (!isAudioFile) {
          console.log('🔴 PREVIEW_PLAYER: Current track is not an audio file');
          Alert.alert('Error', 'This file is not an audio file and cannot be played.');
          return;
        }

        if (!player) {
          console.log('🔴 PREVIEW_PLAYER: No audio player available');
          Alert.alert('Error', 'Audio player not initialized');
          return;
        }

        if (audioStatus.isLoaded) {
          console.log('🔴 PREVIEW_PLAYER: Starting expo audio playback...');
          await audioPlayer.play();
          console.log('🔴 PREVIEW_PLAYER: Expo audio playback started successfully');
        } else {
          console.log('🔴 PREVIEW_PLAYER: Expo audio track not loaded yet, waiting...');
          Alert.alert('Loading', 'Audio track is still loading. Please wait a moment and try again...');
        }
      }
    } catch (error) {
      console.error('🔴 PREVIEW_PLAYER: Error playing:', error);
      Alert.alert('Playback Error', `Failed to start playback: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Handle pause
  const handlePause = async () => {
    try {
      if (isVideo) {
        videoPlayer.pause();
      } else if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
      } else {
        audioPlayer.pause();
      }
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
    
    // Auto-play the next track after a short delay
    setTimeout(() => {
      handlePlay();
    }, 300);
  };

  // Handle previous
  const handlePrevious = () => {
    if (mediaFiles.length <= 1) return;

    const prevIndex = currentTrack > 0 ? currentTrack - 1 : mediaFiles.length - 1;
    loadTrack(prevIndex);
    setCurrentTime(0);
    setTimeLeft(previewDuration);
    setPreviewEnded(false);
    
    // Auto-play the previous track after a short delay
    setTimeout(() => {
      handlePlay();
    }, 300);
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    // Note: Volume control would need player volume API when available
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

  const handleImageNavigation = (productId: string, direction: 'prev' | 'next', imageCount: number) => {
    setProductImageIndexes(prev => {
      const currentIndex = prev[productId] || 0;
      let newIndex;
      
      if (direction === 'next') {
        newIndex = currentIndex < imageCount - 1 ? currentIndex + 1 : 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : imageCount - 1;
      }
      
      return { ...prev, [productId]: newIndex };
    });
  };

  const renderStars = (rating: number = 0) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Ionicons key={i} name="star" size={16} color="#fbbf24" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <Ionicons key={i} name="star-half" size={16} color="#fbbf24" />
        );
      } else {
        stars.push(
          <Ionicons key={i} name="star-outline" size={16} color="#d1d5db" />
        );
      }
    }
    
    return stars;
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
      {/* Initial Play Overlay for Preview */}
      {showPlayOverlay && (
        <View style={styles.playOverlay}>
          <View style={styles.playOverlayBackground}>
            <View style={styles.playOverlayContent}>
              <Text style={styles.playOverlayTitle}>25-Second Preview</Text>
              <Text style={styles.playOverlaySubtitle}>
                {currentMedia?.title}
              </Text>
              <TouchableOpacity
                style={styles.bigPlayButton}
                onPress={handlePlay}
                activeOpacity={0.8}
              >
                <View style={styles.bigPlayButtonGradient}>
                  <Ionicons name="play" size={48} color="#fff" />
                  <Text style={styles.bigPlayButtonText}>START PREVIEW</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.playOverlayNote}>
                🎵 Experience a 25-second preview of this playlist
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Main Content - Horizontal Split Layout */}
      <View style={styles.mainContainer}>
        {/* Left Panel - Preview Player */}
        <View style={styles.leftPanel}>
          {/* Playlist Header */}
          <View style={styles.playlistHeader}>
            <View style={styles.playlistIcon}>
              <MaterialIcons name="preview" size={24} color="#f59e0b" />
            </View>
            <View style={styles.playlistInfo}>
              <Text style={styles.playlistTitle}>{playlistName}</Text>
              <View style={styles.previewBadge}>
                <MaterialIcons name="access-time" size={16} color="#f59e0b" />
                <Text style={styles.previewText}>25-Second Preview</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.playButton}>
              <MaterialIcons name="play-arrow" size={20} color="#fff" />
              <Text style={styles.playButtonText}>PREVIEW</Text>
            </TouchableOpacity>
          </View>

          {/* Player Container */}
          <View style={styles.playerContainer}>
            {/* Video Display - Only show for video files */}
            {isVideo && currentMedia && (
              <View style={styles.videoContainer}>
                <VideoView
                  style={styles.video}
                  player={videoPlayer}
                  allowsFullscreen
                  allowsPictureInPicture
                />
              </View>
            )}

            {/* Current Track Info */}
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentMedia.title}
              </Text>
              <Text style={styles.trackCounter}>
                Track {currentTrack + 1} of {mediaFiles.length}
              </Text>
              <Text style={styles.mediaType}>
                {isVideo ? '🎥 Video' : '🎵 Audio'} Preview
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
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
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
                <Ionicons name="play-skip-back" size={24} color="#374151" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(isVideo ? videoPlayer.playing : (Platform.OS === 'web' ? webAudioPlaying : audioStatus.playing)) ? handlePause : handlePlay}
                disabled={previewEnded || (!isVideo && Platform.OS !== 'web' && !audioStatus.isLoaded)}
                style={[
                  styles.playButtonControl, 
                  (previewEnded || (!isVideo && Platform.OS !== 'web' && !audioStatus.isLoaded)) && styles.disabledControl,
                  hasUserInteracted && styles.enhancedPlayButton
                ]}
              >
                <Ionicons
                  name={(isVideo ? videoPlayer.playing : (Platform.OS === 'web' ? webAudioPlaying : audioStatus.playing)) ? 'pause' : 'play'}
                  size={hasUserInteracted ? 40 : 32}
                  color="#ffffff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNext}
                disabled={mediaFiles.length <= 1}
                style={[styles.controlButton, mediaFiles.length <= 1 && styles.disabledControl]}
              >
                <Ionicons name="play-skip-forward" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Volume */}
            <TouchableOpacity onPress={toggleMute} style={styles.volumeButton}>
              <Ionicons
                name={isMuted ? 'volume-mute' : 'volume-high'}
                size={24}
                color="#374151"
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

          {/* Chat Section - Only show if playlistId is provided */}
          {playlistId && (
            <View style={styles.chatSection}>
              <PlaylistChat
                playlistId={playlistId}
                playlistName={playlistName}
              />
            </View>
          )}
        </View>

        {/* Right Panel - Featured Products */}
        <View style={styles.rightPanel}>
          <View style={styles.productsHeader}>
            <MaterialIcons name="storefront" size={24} color="#374151" />
            <Text style={styles.productsTitle}>Featured Products</Text>
          </View>
          <ScrollView 
            style={styles.productsList}
            showsVerticalScrollIndicator={false}
          >
            {productLinks.length > 0 ? (
              productLinks
                .filter(link => link.isActive)
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((link) => {
                  const images = link.images && link.images.length > 0 ? link.images : [link.imageUrl].filter(Boolean);
                  const currentImageIndex = productImageIndexes[link.id] || 0;
                  const currentImage = images[currentImageIndex];
                  
                  return (
                    <View key={link.id} style={styles.enhancedProductCard}>
                      {/* Image Carousel Section */}
                      <View style={styles.productImageContainer}>
                        {currentImage ? (
                          <>
                            <Image
                              source={{ uri: currentImage }}
                              style={styles.enhancedProductImage}
                              resizeMode="cover"
                            />
                            {images.length > 1 && (
                              <>
                                <TouchableOpacity
                                  style={[styles.imageNavButton, styles.imageNavLeft]}
                                  onPress={() => handleImageNavigation(link.id.toString(), 'prev', images.length)}
                                >
                                  <Ionicons name="chevron-back" size={20} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.imageNavButton, styles.imageNavRight]}
                                  onPress={() => handleImageNavigation(link.id.toString(), 'next', images.length)}
                                >
                                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                                </TouchableOpacity>
                                <View style={styles.imageIndicators}>
                                  {images.map((_, index) => (
                                    <View
                                      key={index}
                                      style={[
                                        styles.imageIndicator,
                                        index === currentImageIndex && styles.activeImageIndicator
                                      ]}
                                    />
                                  ))}
                                </View>
                              </>
                            )}
                          </>
                        ) : (
                          <View style={styles.enhancedProductPlaceholder}>
                            <MaterialIcons name="shopping-bag" size={40} color="#9ca3af" />
                          </View>
                        )}
                      </View>

                      {/* Product Info Section */}
                      <View style={styles.enhancedProductContent}>
                        <Text style={styles.enhancedProductTitle} numberOfLines={2}>
                          {link.title}
                        </Text>
                        
                        {/* Rating and Reviews */}
                        {link.rating && (
                          <View style={styles.ratingContainer}>
                            <View style={styles.starsContainer}>
                              {renderStars(link.rating)}
                            </View>
                            <Text style={styles.ratingText}>
                              {link.rating.toFixed(1)}
                            </Text>
                            {link.reviewCount && (
                              <Text style={styles.reviewCount}>
                                ({link.reviewCount} reviews)
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Price */}
                        {link.price && (
                          <View style={styles.priceContainer}>
                            <Text style={styles.currentPrice}>{link.price}</Text>
                            {link.originalPrice && link.originalPrice !== link.price && (
                              <Text style={styles.originalPrice}>{link.originalPrice}</Text>
                            )}
                          </View>
                        )}

                        {/* Description */}
                        {link.description && (
                          <Text style={styles.enhancedProductDescription} numberOfLines={3}>
                            {link.description}
                          </Text>
                        )}

                        {/* Action Button */}
                        <TouchableOpacity
                          style={styles.enhancedProductButton}
                          onPress={() => handleProductLinkPress(link.url)}
                        >
                          <MaterialIcons name="shopping-cart" size={18} color="#fff" />
                          <Text style={styles.enhancedProductButtonText}>View Product</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
            ) : (
              <View style={styles.noProductsContainer}>
                <MaterialIcons name="shopping-bag" size={48} color="#d1d5db" />
                <Text style={styles.noProductsText}>No products available</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    minHeight: 500,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    }),
  },
  leftPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
  },
  // Playlist Header Styles
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  playlistIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  previewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
    marginLeft: 4,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  playButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 4,
  },
  // Player Container Styles
  playerContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  videoContainer: {
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    height: 200,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    }),
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  chatSection: {
    marginTop: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  trackCounter: {
    fontSize: 14,
    color: '#6b7280',
  },
  mediaType: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
    marginTop: 4,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 3,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  timeLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  playButtonControl: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
    }),
  },
  enhancedPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 6px 16px rgba(245, 158, 11, 0.4)',
    }),
  },
  disabledControl: {
    opacity: 0.5,
  },
  volumeButton: {
    alignSelf: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  endMessage: {
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 8,
  },
  endText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 4,
  },
  endSubtext: {
    fontSize: 14,
    color: '#92400e',
  },
  // Right Panel - Products Styles
  productsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  productsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginLeft: 8,
  },
  productsList: {
    flex: 1,
  },
  productCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    }),
  },
  productImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  productPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  productContent: {
    flex: 1,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    lineHeight: 22,
  },
  productDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  productAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
  },
  noProductsContainer: {
    alignItems: 'center',
    padding: 32,
  },
  noProductsText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  // Enhanced Product Card Styles
  enhancedProductCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    }),
    elevation: 4,
  },
  productImageContainer: {
    position: 'relative',
    height: 200,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enhancedProductImage: {
    width: '42.5%',
    height: '100%',
    borderRadius: 8,
  },
  enhancedProductPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageNavButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageNavLeft: {
    left: 10,
  },
  imageNavRight: {
    right: 10,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 3,
  },
  activeImageIndicator: {
    backgroundColor: '#ffffff',
  },
  enhancedProductContent: {
    padding: 16,
  },
  enhancedProductTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
    lineHeight: 22,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 6,
  },
  reviewCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  currentPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#dc2626',
    marginRight: 8,
  },
  originalPrice: {
    fontSize: 14,
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  enhancedProductDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  enhancedProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
    } : {}),
  },
  enhancedProductButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
  },
  // Play Overlay Styles
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  playOverlayBackground: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 0,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 10px 20px rgba(0, 0, 0, 0.3)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
    }),
    elevation: 10,
  },
  playOverlayContent: {
    padding: 30,
    alignItems: 'center',
    minWidth: 300,
    maxWidth: 400,
  },
  playOverlayTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f59e0b',
    marginBottom: 15,
    textAlign: 'center',
  },
  playOverlaySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 25,
    textAlign: 'center',
    lineHeight: 22,
  },
  bigPlayButton: {
    borderRadius: 25,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 5px 10px rgba(0, 0, 0, 0.3)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
    }),
    elevation: 5,
    marginBottom: 20,
  },
  bigPlayButtonGradient: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 25,
    alignItems: 'center',
    flexDirection: 'column',
    minWidth: 200,
  },
  bigPlayButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 10,
    letterSpacing: 1,
  },
  playOverlayNote: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});