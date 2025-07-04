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
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
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
  images?: string[]; // Multiple images for carousel
  description?: string;
  displayOrder: number;
  isActive: boolean;
  price?: string;
  originalPrice?: string;
  rating?: number; // 1-5 star rating
  reviewCount?: number;
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
    productLinksCount: productLinks.length,
    mediaFiles: mediaFiles
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [productImageIndexes, setProductImageIndexes] = useState<{[key: string]: number}>({});

  // Web audio fallback
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);
  const [webAudioCurrentTime, setWebAudioCurrentTime] = useState(0);

  // Get current track
  const currentTrack = mediaFiles[currentTrackIndex];
  console.log('🔴 MEDIA_PLAYER: Current track set to:', currentTrack);
  
  // Determine if current media is video or audio
  const isVideo = currentTrack?.fileType === 'video' || currentTrack?.contentType?.startsWith('video/');
  
  // Use the new expo-audio hooks - create player without initial source
  const player = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(player);
  
  // Use the new expo-video hooks for video
  const videoPlayer = useVideoPlayer(currentTrack && isVideo ? currentTrack.url : null, (player) => {
    player.loop = false;
    player.muted = false;
  });
  
  // Use web audio status when on web, expo-audio status otherwise
  const status = isVideo ? videoPlayer.status : (Platform.OS === 'web' ? {
    isLoaded: webAudioLoaded,
    playing: webAudioPlaying,
    currentTime: webAudioCurrentTime,
    duration: webAudioRef.current?.duration || NaN,
    isBuffering: false,
    didJustFinish: false
  } : audioStatus);
  
  console.log('🔴 MEDIA_PLAYER: Audio player created, status:', {
    isLoaded: status.isLoaded,
    playing: status.playing,
    duration: status.duration,
    currentTime: status.currentTime
  });

  // Load track when current track changes
  useEffect(() => {
    if (currentTrack && currentTrack.url) {
      console.log('🔴 MEDIA_PLAYER: Loading track:', currentTrack.title, 'Type:', isVideo ? 'video' : 'audio', 'URL:', currentTrack.url);
      console.log('🔴 MEDIA_PLAYER: Track details:', {
        id: currentTrack.id,
        title: currentTrack.title,
        url: currentTrack.url,
        fileType: currentTrack.fileType,
        contentType: currentTrack.contentType,
        isVideo: isVideo
      });
      
      try {
        if (isVideo) {
          // Video player handles URL automatically through useVideoPlayer hook
          console.log('🔴 MEDIA_PLAYER: Video player will handle URL automatically');
        } else if (Platform.OS === 'web') {
          // Use HTML5 Audio for web
          console.log('🔴 MEDIA_PLAYER: Using HTML5 Audio for web');
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
            console.log('🔴 MEDIA_PLAYER: Web audio loaded successfully');
            setWebAudioLoaded(true);
          });
          
          audio.addEventListener('canplaythrough', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio can play through');
            setWebAudioLoaded(true);
          });
          
          audio.addEventListener('timeupdate', () => {
            setWebAudioCurrentTime(audio.currentTime);
          });
          
          audio.addEventListener('play', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio started playing');
            setWebAudioPlaying(true);
          });
          
          audio.addEventListener('pause', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio paused');
            setWebAudioPlaying(false);
          });
          
          audio.addEventListener('ended', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio ended - auto-playing next track');
            setWebAudioPlaying(false);
            playNextTrack(true); // Auto-play next track
          });
          
          audio.addEventListener('error', (e) => {
            console.error('🔴 MEDIA_PLAYER: Web audio error:', e);
            console.error('🔴 MEDIA_PLAYER: Audio error details:', {
              error: audio.error,
              networkState: audio.networkState,
              readyState: audio.readyState,
              src: audio.src
            });
          });
          
          audio.addEventListener('loadstart', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio load started');
          });
          
          audio.addEventListener('progress', () => {
            console.log('🔴 MEDIA_PLAYER: Web audio loading progress');
          });
          
          // Set crossOrigin before src to handle CORS
          audio.crossOrigin = 'anonymous';
          audio.preload = 'auto';
          
          // Set the source URL
          audio.src = currentTrack.url;
          
          // Start loading
          audio.load();
          
          console.log('🔴 MEDIA_PLAYER: Web audio setup complete, loading started');
        } else {
          // Use expo-audio for mobile
          player.replace(currentTrack.url);
        }
        console.log('🔴 MEDIA_PLAYER: Track loading initiated successfully');
      } catch (error) {
        console.error('🔴 MEDIA_PLAYER: Error loading track:', error);
        console.error('🔴 MEDIA_PLAYER: Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
    } else {
      console.log('🔴 MEDIA_PLAYER: Not loading track because:', {
        hasCurrentTrack: !!currentTrack,
        hasUrl: !!currentTrack?.url,
        currentTrack: currentTrack
      });
    }
  }, [currentTrack, player, videoPlayer, isVideo, shouldAutoplay]);

  // Track navigation functions (defined before useEffects that use them)
  const playNextTrack = useCallback((autoplay = true) => {
    console.log('🎵 Playing next track, autoplay:', autoplay);
    const wasPlaying = status.playing;
    
    if (currentTrackIndex < mediaFiles.length - 1) {
      setCurrentTrackIndex(currentTrackIndex + 1);
    } else {
      setCurrentTrackIndex(0); // Loop back to first track
    }
    
    // If music was playing or we want autoplay, continue playing the next track
    if (autoplay || wasPlaying) {
      // Small delay to allow track to load before playing
      setTimeout(() => {
        if (isVideo) {
          videoPlayer.play();
        } else if (Platform.OS === 'web' && webAudioRef.current) {
          webAudioRef.current.play().catch(error => {
            console.error('🎵 Auto-play next track failed on web:', error);
          });
        } else if (player) {
          player.play().catch(error => {
            console.error('🎵 Auto-play next track failed on mobile:', error);
          });
        }
      }, 500);
    }
  }, [currentTrackIndex, mediaFiles.length, status.playing, player, videoPlayer, isVideo, webAudioRef]);

  const playPreviousTrack = useCallback((autoplay = true) => {
    console.log('🎵 Playing previous track, autoplay:', autoplay);
    const wasPlaying = status.playing;
    
    if (currentTrackIndex > 0) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    } else {
      setCurrentTrackIndex(mediaFiles.length - 1); // Loop to last track
    }
    
    // If music was playing or we want autoplay, continue playing the previous track
    if (autoplay || wasPlaying) {
      // Small delay to allow track to load before playing
      setTimeout(() => {
        if (isVideo) {
          videoPlayer.play();
        } else if (Platform.OS === 'web' && webAudioRef.current) {
          webAudioRef.current.play().catch(error => {
            console.error('🎵 Auto-play previous track failed on web:', error);
          });
        } else if (player) {
          player.play().catch(error => {
            console.error('🎵 Auto-play previous track failed on mobile:', error);
          });
        }
      }, 500);
    }
  }, [currentTrackIndex, mediaFiles.length, status.playing, player, videoPlayer, isVideo, webAudioRef]);

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
    if (Platform.OS === 'web') {
      // Web audio ended event is handled in the event listener
      return;
    } else if (isVideo && videoPlayer.status.didJustFinish) {
      console.log('🔴 MEDIA_PLAYER: Video finished - auto-playing next track');
      playNextTrack(true); // Auto-play next track
    } else if (!isVideo && audioStatus.didJustFinish) {
      console.log('🔴 MEDIA_PLAYER: Mobile audio finished - auto-playing next track');
      playNextTrack(true); // Auto-play next track
    }
  }, [isVideo, videoPlayer.status.didJustFinish, audioStatus.didJustFinish, playNextTrack]);

  // Cleanup effect - stop audio/video when component unmounts
  useEffect(() => {
    return () => {
      console.log('🔴 MEDIA_PLAYER: Component unmounting, cleaning up media');
      if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
        webAudioRef.current = null;
      } else if (isVideo && videoPlayer) {
        videoPlayer.pause();
      } else if (player) {
        player.pause();
      }
    };
  }, [player, videoPlayer, isVideo]);

  // Play/Pause toggle
  const togglePlayPause = () => {
    console.log('🔴 MEDIA_PLAYER: Play button clicked!');
    console.log('🔴 MEDIA_PLAYER: Player status:', { 
      isLoaded: status.isLoaded, 
      isBuffering: status.isBuffering,
      duration: status.duration,
      currentTime: status.currentTime,
      playing: status.playing,
      isVideo: isVideo
    });
    console.log('🔴 MEDIA_PLAYER: Current track:', {
      title: currentTrack?.title,
      url: currentTrack?.url,
      fileType: currentTrack?.fileType,
      contentType: currentTrack?.contentType,
      isVideo: isVideo
    });
    
    if (showPlayOverlay) {
      setShowPlayOverlay(false);
    }
    
    setHasUserInteracted(true);
    
    if (!currentTrack || !currentTrack.url) {
      console.log('🔴 MEDIA_PLAYER: No current track or URL available');
      Alert.alert('Error', 'No media file selected');
      return;
    }
    
    try {
      if (isVideo) {
        console.log('🔴 MEDIA_PLAYER: Handling video playback...');
        if (status.playing) {
          console.log('🔴 MEDIA_PLAYER: Pausing video...');
          videoPlayer.pause();
        } else {
          console.log('🔴 MEDIA_PLAYER: Playing video...');
          videoPlayer.play();
        }
      } else if (Platform.OS === 'web' && webAudioRef.current) {
        const audio = webAudioRef.current;
        console.log('🔴 MEDIA_PLAYER: Web audio ready state:', audio.readyState);
        console.log('🔴 MEDIA_PLAYER: Web audio network state:', audio.networkState);
        
        if (webAudioPlaying) {
          console.log('🔴 MEDIA_PLAYER: Pausing web audio...');
          audio.pause();
          console.log('🔴 MEDIA_PLAYER: Web audio pause command sent');
        } else {
          console.log('🔴 MEDIA_PLAYER: Attempting to play web audio...');
          
          // Check if audio is ready to play
          if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
            console.log('🔴 MEDIA_PLAYER: Audio ready, playing now');
            audio.play().then(() => {
              console.log('🔴 MEDIA_PLAYER: Web audio play successful');
            }).catch(error => {
              console.error('🔴 MEDIA_PLAYER: Web audio play failed:', error);
              Alert.alert('Playback Error', 'Failed to start audio playback. Please try again.');
            });
          } else {
            console.log('🔴 MEDIA_PLAYER: Web audio track not loaded yet, waiting...');
            Alert.alert('Loading...', 'Audio is still loading. Please wait a moment and try again.');
            
            // Set up a one-time listener to auto-play when ready
            const handleCanPlay = () => {
              console.log('🔴 MEDIA_PLAYER: Audio became ready, auto-playing');
              audio.removeEventListener('canplaythrough', handleCanPlay);
              audio.play().then(() => {
                console.log('🔴 MEDIA_PLAYER: Delayed web audio play successful');
              }).catch(error => {
                console.error('🔴 MEDIA_PLAYER: Delayed web audio play failed:', error);
              });
            };
            audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
          }
        }
      } else if (Platform.OS !== 'web') {
        if (!player) {
          console.log('🔴 MEDIA_PLAYER: No player available');
          Alert.alert('Error', 'Media player not initialized');
          return;
        }
        
        if (!status.isLoaded) {
          console.log('🔴 MEDIA_PLAYER: Track not loaded yet');
          Alert.alert('Error', 'Media file is still loading. Please wait...');
          return;
        }
        
        if (status.playing) {
          console.log('🔴 MEDIA_PLAYER: Pausing expo audio...');
          player.pause();
          console.log('🔴 MEDIA_PLAYER: Expo audio pause command sent');
        } else {
          console.log('🔴 MEDIA_PLAYER: Playing expo audio...');
          player.play();
          console.log('🔴 MEDIA_PLAYER: Expo audio play command sent');
        }
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
      {/* Initial Play Overlay - Prominent and hard to miss */}
      {showPlayOverlay && (
        <View style={styles.playOverlay}>
          <View style={styles.playOverlayBackground}>
            <View style={styles.playOverlayContent}>
              <Text style={styles.playOverlayTitle}>Ready to Play</Text>
              <Text style={styles.playOverlaySubtitle}>
                {currentTrack?.title}
              </Text>
              <TouchableOpacity
                style={styles.bigPlayButton}
                onPress={togglePlayPause}
                activeOpacity={0.8}
              >
                <View style={styles.bigPlayButtonGradient}>
                  <Ionicons name="play" size={48} color="#fff" />
                  <Text style={styles.bigPlayButtonText}>CLICK TO PLAY</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.playOverlayNote}>
                {isVideo ? '🎥 Click the button above to start the video' : '🎵 Click the button above to start the music'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Two-Panel Layout: Media Player + Product Advertising */}
      <View style={styles.mainContent}>
        {/* Left Panel - Media Player */}
        <View style={styles.playerPanel}>
          {/* Video Display - Only show for video files */}
          {isVideo && currentTrack && (
            <View style={styles.videoContainer}>
              <VideoView
                style={styles.video}
                player={videoPlayer}
                allowsFullscreen
                allowsPictureInPicture
              />
            </View>
          )}

          {/* Track Info */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle}>{currentTrack.title}</Text>
            <Text style={styles.trackCount}>
              {currentTrackIndex + 1} of {mediaFiles.length}
            </Text>
            <Text style={styles.mediaType}>
              {isVideo ? '🎥 Video' : '🎵 Audio'}
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
              onPress={() => playPreviousTrack(true)}
              disabled={mediaFiles.length <= 1}
            >
              <Ionicons name="play-skip-back" size={24} color="#333" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.playButton, 
                status.isBuffering && styles.loadingButton,
                hasUserInteracted && styles.enhancedPlayButton
              ]}
              onPress={togglePlayPause}
              disabled={!status.isLoaded || status.isBuffering}
            >
              {status.isBuffering ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons
                  name={status.playing ? "pause" : "play"}
                  size={hasUserInteracted ? 40 : 32}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => playNextTrack(true)}
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

          {/* App Download Reminder for Web Users */}
          {Platform.OS === 'web' && (
            <View style={styles.appReminderContainer}>
              <View style={styles.appReminderCard}>
                <MaterialIcons name="phone-android" size={24} color="#10b981" />
                <View style={styles.appReminderContent}>
                  <Text style={styles.appReminderTitle}>Get the Mobile App!</Text>
                  <Text style={styles.appReminderText}>
                    Download our app for offline listening and better experience
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.appReminderButton}
                  onPress={() => {
                    Alert.alert(
                      'Download MerchTech App',
                      'Your profile and access codes are already saved. Sign in to the app with your email to access all your content!',
                      [
                        {
                          text: 'iOS App Store',
                          onPress: () => Linking.openURL('https://apps.apple.com/app/your-app'),
                        },
                        {
                          text: 'Google Play',
                          onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=your.app'),
                        },
                        { text: 'Later', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  <MaterialIcons name="download" size={16} color="#10b981" />
                  <Text style={styles.appReminderButtonText}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Right Panel - Product Advertising */}
        {productLinks.length > 0 && (
          <View style={styles.advertisingPanel}>
            <Text style={styles.advertisingTitle}>Featured Products</Text>
            <ScrollView 
              style={styles.productLinksList}
              showsVerticalScrollIndicator={false}
            >
              {productLinks
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
                                  onPress={() => handleImageNavigation(link.id, 'prev', images.length)}
                                >
                                  <Ionicons name="chevron-back" size={20} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.imageNavButton, styles.imageNavRight]}
                                  onPress={() => handleImageNavigation(link.id, 'next', images.length)}
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
                })}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  noMediaText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 50,
  },
  mainContent: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 400,
  },
  playerPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    margin: 10,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    }),
    elevation: 3,
  },
  advertisingPanel: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    margin: 10,
    padding: 16,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    }),
    elevation: 3,
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
  advertisingTitle: {
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 15,
    textAlign: 'center',
  },
  playOverlaySubtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 24,
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
    backgroundColor: '#3b82f6',
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
  enhancedPlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appReminderContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  appReminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  appReminderContent: {
    flex: 1,
  },
  appReminderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065f46',
    marginBottom: 4,
  },
  appReminderText: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 16,
  },
  appReminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  appReminderButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  videoContainer: {
    position: 'relative',
    height: 200,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  mediaType: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 5,
  },
}); 