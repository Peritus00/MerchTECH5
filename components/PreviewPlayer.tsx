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
import { useCart } from '@/contexts/CartContext';
import { paymentAPI } from '@/services/api';
import * as WebBrowser from 'expo-web-browser';
import PlaylistChat from './PlaylistChat';

interface MediaFile {
  id: number;
  title: string;
  url: string;
  fileType: string;
  contentType: string;
  duration?: number; // For slideshow images
  type?: 'video' | 'audio' | 'image';
}

interface PreviewPlayerProps {
  mediaFiles: MediaFile[];
  playlistName: string;
  playlistId?: string;
  previewDuration?: number; // in seconds, default 25
  autoplay?: boolean;
  productLinks?: ProductLink[];
  onPreviewComplete?: () => void;
  backgroundAudioUrl?: string; // For slideshow background audio
}

export default function PreviewPlayer({
  mediaFiles,
  playlistName,
  playlistId,
  previewDuration = 25,
  autoplay = false,
  productLinks = [],
  onPreviewComplete,
  backgroundAudioUrl,
}: PreviewPlayerProps) {
  // DEBUG: Log what PreviewPlayer receives
  console.log('🐛 DEBUG: PreviewPlayer received props:', {
    mediaFiles: mediaFiles,
    mediaFilesLength: mediaFiles.length,
    playlistName: playlistName,
    autoplay: autoplay,
    backgroundAudioUrl: backgroundAudioUrl
  });
  
  console.log('🐛 DEBUG: PreviewPlayer mediaFiles detailed:', JSON.stringify(mediaFiles, null, 2));

  const [currentTrack, setCurrentTrack] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(previewDuration);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [productImageIndexes, setProductImageIndexes] = useState<{
    [key: string]: number;
  }>({});

  // Slideshow-specific state
  const [slideshowTimer, setSlideshowTimer] =
    useState<NodeJS.Timeout | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);

  // Web audio fallback
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);
  const [webAudioCurrentTime, setWebAudioCurrentTime] = useState(0);

  // Background audio for slideshows
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const [backgroundAudioPlaying, setBackgroundAudioPlaying] = useState(false);

  // Overall play state for UI
  const [isPlaying, setIsPlaying] = useState(false);

  const currentMedia = mediaFiles[currentTrack];
  
  console.log('🐛 DEBUG: currentMedia:', currentMedia);
  console.log('🐛 DEBUG: currentTrack:', currentTrack);

  // Determine if current media is video, audio, or image
  const isVideo =
    currentMedia?.fileType === 'video' ||
    currentMedia?.contentType?.startsWith('video/') ||
    currentMedia?.type === 'video';
  const isAudio =
    currentMedia?.fileType === 'audio' ||
    currentMedia?.contentType?.startsWith('audio/') ||
    currentMedia?.type === 'audio';
  const isImage =
    currentMedia?.fileType === 'image' ||
    currentMedia?.contentType?.startsWith('image/') ||
    currentMedia?.type === 'image';
  const isSlideshow =
    mediaFiles.length > 1 &&
    mediaFiles.some(
      (file) =>
        file.fileType === 'image' ||
        file.contentType?.startsWith('image/') ||
        file.type === 'image'
    );

  console.log('🐛 DEBUG: Media type flags:', {
    isVideo,
    isAudio,
    isImage,
    isSlideshow,
    mediaFilesLength: mediaFiles.length
  });

  // Use the new expo-audio hooks for audio
  const audioPlayer = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // Use the new expo-video hooks for video
  const videoPlayer = useVideoPlayer(
    currentMedia && isVideo ? currentMedia.url : null,
    (player) => {
      player.loop = false;
      player.muted = isMuted;
    }
  );

  // Use appropriate player and status based on media type and platform
  const player = isVideo
    ? videoPlayer
    : Platform.OS === 'web'
    ? webAudioRef.current
    : audioPlayer;
  const status = isVideo
    ? videoPlayer.status
    : Platform.OS === 'web'
    ? {
        isLoaded: webAudioLoaded,
        playing: webAudioPlaying,
        currentTime: webAudioCurrentTime,
        duration: webAudioRef.current?.duration || NaN,
        isBuffering: false,
      }
    : audioStatus;

  // Load track when current track changes
  useEffect(() => {
    if (currentMedia && currentMedia.url) {
      try {
        if (isImage) {
          // For images, we don't need to load anything special
        } else if (isVideo) {
          // Video player handles URL automatically through useVideoPlayer hook
        } else if (Platform.OS === 'web') {
          // Use HTML5 Audio for web
          if (webAudioRef.current) {
            webAudioRef.current.pause();
            webAudioRef.current.src = '';
          }
          const audio = new (window as any)[String.fromCharCode(65, 117, 100, 105, 111)](currentMedia.url);
          webAudioRef.current = audio;

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

          audio.addEventListener('error', (e: any) => {
            console.error('🔴 PREVIEW_PLAYER: Web audio error:', e);
            console.error('🔴 PREVIEW_PLAYER: Audio error details:', {
              error: audio.error,
              networkState: audio.networkState,
              readyState: audio.readyState,
              src: audio.src
            });
          });

          // Set crossOrigin before src to handle CORS
          audio.crossOrigin = 'anonymous';
          audio.preload = 'auto';

          // Set the source URL
          audio.src = currentMedia.url;

          // Start loading
          audio.load();

          console.log('🔴 PREVIEW_PLAYER: Web audio setup complete, loading started');
        } else {
          // Load audio track with expo-audio for mobile
          audioPlayer.replace(currentMedia.url);
          console.log('🔴 PREVIEW_PLAYER: Audio track replaced on mobile');
        }
      } catch (error) {
        console.error('🔴 PREVIEW_PLAYER: Error loading media:', error);
      }
    }
  }, [currentMedia, isVideo, isAudio, isImage, audioPlayer]);

  // Slideshow auto-advance logic
  useEffect(() => {
    if (slideshowPlaying && isSlideshow && !previewEnded && mediaFiles.length > 0) {
      const currentMediaFile = mediaFiles[currentTrack];
      const duration = currentMediaFile?.duration || 5000; // Use the actual duration from the media file, default 5 seconds

      console.log(`🔄 SLIDESHOW_CYCLE: Setting timer for ${duration}ms for image "${currentMediaFile?.title}", current track: ${currentTrack}/${mediaFiles.length}`);
      console.log(`🔄 SLIDESHOW_CYCLE: Media file duration setting:`, {
        id: currentMediaFile?.id,
        title: currentMediaFile?.title,
        duration: currentMediaFile?.duration,
        usingDuration: duration
      });

      const timer = setTimeout(() => {
        console.log(`🔄 SLIDESHOW_CYCLE: Timer fired after ${duration}ms, advancing from track ${currentTrack}`);
        if (currentTrack < mediaFiles.length - 1) {
          const nextTrack = currentTrack + 1;
          console.log(`🔄 SLIDESHOW_CYCLE: Advancing to track ${nextTrack}`);
          setCurrentTrack(nextTrack);
        } else {
          // Loop back to first image
          console.log(`🔄 SLIDESHOW_CYCLE: Looping back to track 0`);
          setCurrentTrack(0);
        }
      }, duration);

      setSlideshowTimer(timer);

      return () => {
        if (timer) {
          console.log(`🔄 SLIDESHOW_CYCLE: Clearing timer for track ${currentTrack}`);
          clearTimeout(timer);
        }
      };
    } else {
      // Clear timer if not playing
      if (slideshowTimer) {
        console.log(`🔄 SLIDESHOW_CYCLE: Clearing timer - slideshow not playing`);
        clearTimeout(slideshowTimer);
        setSlideshowTimer(null);
      }
    }
  }, [slideshowPlaying, currentTrack, mediaFiles.length, currentMedia, isSlideshow, previewEnded]);

  // Track preview time and end after duration
  useEffect(() => {
    if (isImage || isSlideshow) {
      // For images/slideshows, use different timing logic
      if (slideshowPlaying) {
        const timer = setInterval(() => {
          setCurrentTime(prev => {
            const newTime = prev + 1;
            setTimeLeft(Math.max(0, previewDuration - newTime));

            if (newTime >= previewDuration) {
              console.log('🔴 PREVIEW_PLAYER: Preview duration reached, ending slideshow');
              setSlideshowPlaying(false);
              setIsPlaying(false);
              setPreviewEnded(true);

              // Stop background audio
              if (backgroundAudioRef.current) {
                backgroundAudioRef.current.pause();
              }

              if (onPreviewComplete) {
                onPreviewComplete();
              }
            }

            return newTime;
          });
        }, 1000);

        return () => clearInterval(timer);
      }
    } else {
      // Original audio/video timing logic
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
    }
  }, [isImage, isSlideshow, slideshowPlaying, isVideo, videoPlayer.playing, videoPlayer.currentTime, webAudioPlaying, webAudioCurrentTime, audioStatus.playing, audioStatus.currentTime, previewDuration, onPreviewComplete]);

  // Load initial track
  useEffect(() => {
    if (mediaFiles.length > 0) {
      loadTrack(0);
    }
  }, [mediaFiles]);

  // Auto-play if enabled
  useEffect(() => {
    // Remove autoplay functionality - user must click play button
    console.log('🔴 PREVIEW_PLAYER: Autoplay disabled - user must click play button');
  }, [autoplay, (status as any)?.isLoaded, previewEnded, hasUserInteracted, isImage, isSlideshow, mediaFiles.length]);

  // Background audio setup for slideshows
  useEffect(() => {
    console.log('🎵 PREVIEW_PLAYER: Background audio effect triggered with:', {
      backgroundAudioUrl: !!backgroundAudioUrl,
      backgroundAudioUrlValue: backgroundAudioUrl,
      isSlideshow,
      platformOS: Platform.OS,
      mediaFilesLength: mediaFiles.length,
      shouldSetupAudio: backgroundAudioUrl && Platform.OS === 'web'
    });

    // Setup audio if we have a background audio URL and we're on web platform
    // Don't wait for isSlideshow to be true, as it might have timing issues
    if (backgroundAudioUrl && Platform.OS === 'web') {
      console.log('🎵 PREVIEW_PLAYER: Setting up background audio:', backgroundAudioUrl);

      // Test if the audio URL is accessible
      fetch(backgroundAudioUrl, { method: 'HEAD' })
        .then(response => {
          console.log('🎵 PREVIEW_PLAYER: Background audio URL test response:', {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            url: backgroundAudioUrl
          });
        })
        .catch(error => {
          console.error('🎵 PREVIEW_PLAYER: Background audio URL test failed:', error);
        });

      const audio = new (window as any)[String.fromCharCode(65, 117, 100, 105, 111)](backgroundAudioUrl);
      backgroundAudioRef.current = audio;

      audio.addEventListener('loadstart', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio load started');
      });

      audio.addEventListener('loadeddata', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio loaded');
      });

      audio.addEventListener('canplaythrough', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio can play through');
      });

      audio.addEventListener('play', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio started');
        setBackgroundAudioPlaying(true);
      });

      audio.addEventListener('pause', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio paused');
        setBackgroundAudioPlaying(false);
      });

      audio.addEventListener('ended', () => {
        console.log('🎵 PREVIEW_PLAYER: Background audio ended');
        setBackgroundAudioPlaying(false);
      });

      audio.addEventListener('error', (e) => {
        console.error('🎵 PREVIEW_PLAYER: Background audio error:', e);
        console.error('🎵 PREVIEW_PLAYER: Background audio error details:', {
          error: audio.error,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src
        });
      });

      audio.crossOrigin = 'anonymous';
      audio.loop = true;
      audio.volume = 0.5;
      audio.src = backgroundAudioUrl;
      audio.load();

      console.log('🎵 PREVIEW_PLAYER: Background audio setup complete, loading started');

      return () => {
        console.log('🎵 PREVIEW_PLAYER: Cleaning up background audio');
        if (backgroundAudioRef.current) {
          backgroundAudioRef.current.pause();
          backgroundAudioRef.current.src = '';
          backgroundAudioRef.current = null;
        }
      };
    } else {
      console.log('🎵 PREVIEW_PLAYER: Skipping background audio setup because:', {
        hasBackgroundAudioUrl: !!backgroundAudioUrl,
        isSlideshow,
        isWeb: Platform.OS === 'web',
        mediaFilesLength: mediaFiles.length
      });
    }
  }, [backgroundAudioUrl]);

  // Cleanup effect - stop audio when component unmounts
  useEffect(() => {
    return () => {
      console.log('🔴 PREVIEW_PLAYER: Component unmounting, cleaning up');
      if (slideshowTimer) {
        clearTimeout(slideshowTimer);
      }
      if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.src = '';
        webAudioRef.current = null;
      } else if (audioPlayer) {
        audioPlayer.pause();
      }
      if (backgroundAudioRef.current) {
        backgroundAudioRef.current.pause();
        backgroundAudioRef.current.src = '';
        backgroundAudioRef.current = null;
      }
    };
  }, [audioPlayer, slideshowTimer]);

  // Load track function
  const loadTrack = (index: number) => {
    if (index >= 0 && index < mediaFiles.length) {
      setCurrentTrack(index);
      setCurrentTime(0);
      setTimeLeft(previewDuration);
      setPreviewEnded(false);

      // Clear any existing slideshow timer
      if (slideshowTimer) {
        clearTimeout(slideshowTimer);
        setSlideshowTimer(null);
      }
    }
  };

  // Handle play
  const handlePlay = async () => {
    setHasUserInteracted(true);
    setShowPlayOverlay(false);

    try {
      if (isImage || isSlideshow) {
        console.log('🔴 PREVIEW_PLAYER: Starting slideshow playback...');
        console.log('🔴 PREVIEW_PLAYER: Current track:', currentTrack, 'Media files length:', mediaFiles.length);

        const currentMediaFile = mediaFiles[currentTrack];
        console.log('🔴 PREVIEW_PLAYER: Current media file:', {
          id: currentMediaFile?.id,
          title: currentMediaFile?.title,
          duration: currentMediaFile?.duration,
          url: currentMediaFile?.url
        });

        // Set playing states to start image rotation - THIS IS THE KEY!
        setIsPlaying(true);
        setSlideshowPlaying(true);

        // If background audio is provided, play it
        if (backgroundAudioRef.current) {
          console.log('🔴 PREVIEW_PLAYER: Playing background audio for slideshow');
          backgroundAudioRef.current.play();
          setBackgroundAudioPlaying(true);
        }

        console.log('🔴 PREVIEW_PLAYER: ✅ Slideshow rotation started - images will rotate based on duration settings');
      } else if (isVideo) {
        console.log('🔴 PREVIEW_PLAYER: Playing video...');
        if (!player) {
          console.log('🔴 PREVIEW_PLAYER: No video player available');
          Alert.alert('Error', 'Video player not initialized');
          return;
        }
        videoPlayer.play();
        setIsPlaying(true);
        console.log('🔴 PREVIEW_PLAYER: Video playback started successfully');
      } else if (Platform.OS === 'web' && webAudioRef.current) {
        console.log('🔴 PREVIEW_PLAYER: Starting web audio playback...');
        if (webAudioLoaded) {
          await webAudioRef.current.play();
          setIsPlaying(true);
          console.log('🔴 PREVIEW_PLAYER: Web audio playback started successfully');
        } else {
          console.log('🔴 PREVIEW_PLAYER: Web audio not loaded yet, waiting...');
          Alert.alert('Loading', 'Audio track is still loading. Please wait a moment and try again...');
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
          setIsPlaying(true);
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
      if (isImage || isSlideshow) {
        console.log('🔴 PREVIEW_PLAYER: Pausing slideshow...');

        // Set paused states to stop image rotation - THIS IS THE KEY!
        setIsPlaying(false);
        setSlideshowPlaying(false);

        if (slideshowTimer) {
          clearTimeout(slideshowTimer);
          setSlideshowTimer(null);
        }

        // Pause background audio (like MediaPlayer does)
        if (isSlideshow && backgroundAudioUrl) {
          if (Platform.OS === 'web' && backgroundAudioRef.current) {
            console.log('🎵 PREVIEW_PLAYER: Pausing background audio with slideshow...');
            backgroundAudioRef.current.pause();
            console.log('🎵 PREVIEW_PLAYER: ✅ Background audio paused with slideshow');
          }
        }
      } else if (isVideo) {
        videoPlayer.pause();
        setIsPlaying(false);
      } else if (Platform.OS === 'web' && webAudioRef.current) {
        webAudioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioPlayer.pause();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('🔴 PREVIEW_PLAYER: Error pausing:', error);
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
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      // Handle mobile navigation
      console.log('Opening product link:', url);
    }
  };

  const { addToCart, getTotalItems } = useCart();

  const handleAddToCart = (productLink: ProductLink) => {
    try {
      // Convert ProductLink to Product format for cart
      const product = {
        id: productLink.id,
        name: productLink.title,
        description: productLink.description || '',
        price: parseFloat(productLink.price?.replace('$', '') || '0') * 100, // Convert to cents
        imageUrl: productLink.imageUrl || '',
        images: productLink.images || [],
        category: '',
        inStock: true,
        in_stock: true,
        slug: '',
        hasSizes: false,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        userId: 0,
        metadata: {},
      };

      addToCart(product);

      Alert.alert(
        'Added to Cart',
        `${product.name} has been added to your cart!`,
        [
          { text: 'Continue', style: 'cancel' },
          { text: 'View Cart', onPress: () => console.log('Navigate to cart') }
        ]
      );
    } catch (error) {
      console.error('Add to cart error:', error);
      Alert.alert('Error', 'Failed to add item to cart');
    }
  };

  const handleBuyNow = async (productLink: ProductLink) => {
    try {
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = base;

      const items = [{ productId: productLink.id, quantity: 1 }];
      const { url } = await paymentAPI.createSession(items, successUrl, cancelUrl);

      // Always use WebBrowser to keep app running in background
      await WebBrowser.openBrowserAsync(url);
      console.log('🔗 PAYMENT: Opened Stripe checkout for Buy Now from PreviewPlayer');
    } catch (error) {
      console.error('Buy now error:', error);
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
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

  // Format price to ensure it displays correctly
  const formatPrice = (price: string | number | null): string => {
    if (!price) return '';

    // If price is already a formatted string (e.g., "$10.00"), return as is
    if (typeof price === 'string' && price.startsWith('$')) {
      return price;
    }

    // If price is a number or string number, format it
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '';

    return `$${numPrice.toFixed(2)}`;
  };

  const handleCartPress = () => {
    // Navigate to cart - you can implement this based on your navigation setup
    console.log('Navigate to cart');
    // For web, you might want to use window.location or router
    if (Platform.OS === 'web') {
      window.location.href = '/store/cart';
    }
    // For mobile, you would use navigation
    // navigation.navigate('Cart');
  };

  const nextTrack = () => {
    if (currentTrack < mediaFiles.length - 1) {
      setCurrentTrack(currentTrack + 1);
    } else {
      setCurrentTrack(0); // loop back to start
    }
  };

  // AUTO-ADVANCE FOR WEB AUDIO (ended event)
  useEffect(() => {
    if (Platform.OS === 'web' && webAudioRef.current) {
      const audio = webAudioRef.current;
      const onEnded = () => {
        console.log('🔄 PREVIEW_PLAYER: Web audio ended – advancing to next track');
        nextTrack();
      };
      audio.addEventListener('ended', onEnded);
      return () => audio.removeEventListener('ended', onEnded);
    }
  }, [currentTrack, mediaFiles.length]);

  // AUTO-ADVANCE FOR EXPO-VIDEO
  useEffect(() => {
    if (isVideo && videoPlayer && videoPlayer.duration) {
      if (!videoPlayer.playing && videoPlayer.currentTime >= videoPlayer.duration - 0.3) {
        console.log('🔄 PREVIEW_PLAYER: Video ended – advancing to next track');
        nextTrack();
      }
    }
  }, [isVideo, videoPlayer.playing, videoPlayer.currentTime, videoPlayer.duration]);

  // AUTO-ADVANCE FOR EXPO-AUDIO (mobile)
  useEffect(() => {
    if (!isVideo && !isImage && Platform.OS !== 'web' && audioStatus.isLoaded) {
      if (!audioStatus.playing && audioStatus.currentTime >= (audioStatus.duration || 0) - 0.3) {
        console.log('🔄 PREVIEW_PLAYER: Mobile audio ended – advancing to next track');
        nextTrack();
      }
    }
  }, [audioStatus.playing, audioStatus.currentTime, audioStatus.duration, isVideo, isImage]);

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
              <Text style={styles.playOverlayTitle}>
                {isSlideshow ? 'Slideshow Preview' : '25-Second Preview'}
              </Text>
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
                  <Text style={styles.bigPlayButtonText}>
                    {isSlideshow ? 'START SLIDESHOW' : 'START PREVIEW'}
                  </Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.playOverlayNote}>
                {isSlideshow ? '🖼️ Experience this slideshow preview' : '🎵 Experience a 25-second preview of this playlist'}
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
              <MaterialIcons name={isSlideshow ? "slideshow" : "preview"} size={24} color="#f59e0b" />
            </View>
            <View style={styles.playlistInfo}>
              <Text style={styles.playlistTitle}>{playlistName}</Text>
              <View style={styles.previewBadge}>
                <MaterialIcons name="access-time" size={16} color="#f59e0b" />
                <Text style={styles.previewText}>
                  {isSlideshow ? 'Slideshow Preview' : '25-Second Preview'}
                </Text>
              </View>
            </View>

            {/* Cart Icon */}
            <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
              <MaterialIcons name="shopping-cart" size={24} color="#374151" />
              {getTotalItems() > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{getTotalItems()}</Text>
                </View>
              )}
            </TouchableOpacity>

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
                  allowsFullscreen={true}
                  allowsPictureInPicture={true}
                  contentFit="contain"
                />

                {/* Custom fullscreen button */}
                <TouchableOpacity
                  style={styles.fullscreenButton}
                  onPress={() => {
                    // VideoView handles fullscreen automatically on mobile
                    // For web, we can add custom fullscreen logic
                    if (Platform.OS === 'web') {
                      const videoElement = document.querySelector('video');
                      if (videoElement) {
                        if (!document.fullscreenElement) {
                          if (videoElement.requestFullscreen) {
                            videoElement.requestFullscreen().catch((err) => {
                              console.warn('Fullscreen request failed:', err);
                            });
                          } else {
                            // Fallback for older browsers
                            (videoElement as any).webkitRequestFullscreen?.() ||
                            (videoElement as any).mozRequestFullScreen?.() ||
                            (videoElement as any).msRequestFullscreen?.();
                          }
                        } else {
                          if (document.exitFullscreen) {
                            document.exitFullscreen().catch((err) => {
                              console.warn('Exit fullscreen failed:', err);
                            });
                          } else {
                            // Fallback for older browsers
                            (document as any).webkitExitFullscreen?.() ||
                            (document as any).mozCancelFullScreen?.() ||
                            (document as any).msExitFullscreen?.();
                          }
                        }
                      }
                    }
                  }}
                >
                  <Ionicons
                    name="expand"
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Image Display - For slideshow images */}
            {(isImage || isSlideshow) && currentMedia && (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: currentMedia.url }}
                  style={styles.slideshowImage as any}
                  resizeMode="contain"
                />

                {/* Image navigation for slideshows */}
                {isSlideshow && mediaFiles.length > 1 && (
                  <>
                    <TouchableOpacity
                      style={[styles.imageNavButton, styles.imageNavLeft]}
                      onPress={handlePrevious}
                    >
                      <Ionicons name="chevron-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.imageNavButton, styles.imageNavRight]}
                      onPress={handleNext}
                    >
                      <Ionicons name="chevron-forward" size={24} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}

                {/* Image info overlay */}
                <View style={styles.imageInfoOverlay}>
                  <Text style={styles.imageTitle}>{currentMedia.title}</Text>
                  {isSlideshow && (
                    <Text style={styles.imageCounter}>
                      {currentTrack + 1} / {mediaFiles.length}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Current Track Info */}
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentMedia.title}
              </Text>
              <Text style={styles.trackCounter}>
                {isSlideshow ? `Image ${currentTrack + 1} of ${mediaFiles.length}` : `Track ${currentTrack + 1} of ${mediaFiles.length}`}
              </Text>
              <Text style={styles.mediaType}>
                {isVideo ? '🎥 Video' : isImage || isSlideshow ? '🖼️ Image' : '🎵 Audio'} Preview
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
                onPress={isPlaying ? handlePause : handlePlay}
                disabled={previewEnded || (!isImage && !isSlideshow && !isVideo && Platform.OS !== 'web' && !audioStatus.isLoaded)}
                style={[
                  styles.playButtonControl,
                  (previewEnded || (!isImage && !isSlideshow && !isVideo && Platform.OS !== 'web' && !audioStatus.isLoaded)) && styles.disabledControl,
                  hasUserInteracted && styles.enhancedPlayButton
                ]}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
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

            {/* Volume - Only show for audio/video */}
            {(isAudio || isVideo) && (
              <TouchableOpacity onPress={toggleMute} style={styles.volumeButton}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={24}
                  color="#374151"
                />
              </TouchableOpacity>
            )}

            {/* Preview End Message */}
            {previewEnded && (
              <View style={styles.endMessage}>
                <Text style={styles.endText}>Preview completed!</Text>
                <Text style={styles.endSubtext}>
                  {isSlideshow ? 'Enter activation code for full slideshow access' : 'Scan QR code for full access'}
                </Text>
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
            showsVerticalScrollIndicator={true}
            bounces={Platform.OS === 'ios'} // iOS-specific bounce behavior
            overScrollMode={Platform.OS === 'android' ? 'always' : 'auto'} // Android-specific over-scroll
            contentContainerStyle={styles.productsListContent}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            {...(Platform.OS === 'web' && {
              // Web-specific scroll optimizations
              scrollEnabled: true,
              showsVerticalScrollIndicator: true,
            })}
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
                                                             style={styles.enhancedProductImage as any}
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
                            <Text style={styles.currentPrice}>{formatPrice(link.price)}</Text>
                            {link.originalPrice && link.originalPrice !== link.price && (
                              <Text style={styles.originalPrice}>{formatPrice(link.originalPrice)}</Text>
                            )}
                          </View>
                        )}

                        {/* Description */}
                        {link.description && (
                          <Text style={styles.enhancedProductDescription} numberOfLines={2}>
                            {link.description}
                          </Text>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.productActionButtons}>
                          <TouchableOpacity
                            style={styles.buyNowButton}
                            onPress={() => handleBuyNow(link)}
                          >
                            <MaterialIcons name="flash-on" size={16} color="#fff" />
                            <Text style={styles.buyNowButtonText}>Buy Now</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.addToCartButton}
                            onPress={() => handleAddToCart(link)}
                          >
                            <MaterialIcons name="add-shopping-cart" size={16} color="#3b82f6" />
                            <Text style={styles.addToCartButtonText}>Add to Cart</Text>
                          </TouchableOpacity>
                        </View>
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
    backgroundColor: '#000',
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    minHeight: '100%' as any, // Ensure full viewport height on web
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      height: '100%' as any,
    }),
  } as any,
  leftPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    minHeight: '100%',
  },
  rightPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 20,
    minHeight: '100%',
    maxHeight: '100%' as any, // Constrain to viewport height
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
  // Video Container Styles
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  fullscreenButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  // Image Container Styles for Slideshows
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideshowImage: {
    width: '100%',
    height: '100%',
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
  imageInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  imageTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  imageCounter: {
    fontSize: 12,
    color: '#e5e7eb',
  },
  // Track Info Styles
  trackInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  trackCounter: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  mediaType: {
    fontSize: 12,
    color: '#9ca3af',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  // Progress Styles
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 2,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  timeLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Control Styles
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  controlButton: {
    padding: 12,
    marginHorizontal: 8,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  playButtonControl: {
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 32,
    backgroundColor: '#f59e0b',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  enhancedPlayButton: {
    backgroundColor: '#d97706',
    transform: [{ scale: 1.1 }],
  },
  disabledControl: {
    backgroundColor: '#f9fafb',
    opacity: 0.5,
  },
  volumeButton: {
    alignSelf: 'center',
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  // End Message Styles
  endMessage: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginTop: 10,
  },
  endText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  endSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Chat Section Styles
  chatSection: {
    marginTop: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  // Products Panel Styles
  productsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  productsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginLeft: 8,
  },
  productsList: {
    flex: 1,
    height: 0, // Force the ScrollView to take remaining space
    ...(Platform.OS === 'web' && {
      // Web-specific styles for better scrolling
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'thin',
      maxHeight: 'calc(100% - 200px)' as any, // Account for header and padding
    }),
  } as any,
  productsListContent: {
    paddingBottom: 20, // Add padding at the bottom for better scrolling
    flexGrow: 1,
    ...(Platform.OS === 'web' && {
      // Ensure content takes full width on web
      minHeight: '100%',
    }),
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
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 400,
    width: '90%',
  },
  playOverlayContent: {
    alignItems: 'center',
  },
  playOverlayTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  playOverlaySubtitle: {
    fontSize: 16,
    color: '#d1d5db',
    marginBottom: 24,
    textAlign: 'center',
  },
  bigPlayButton: {
    marginBottom: 16,
  },
  bigPlayButtonGradient: {
    backgroundColor: '#f59e0b',
    borderRadius: 32,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  bigPlayButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  playOverlayNote: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Product Card Styles
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    marginBottom: 16,
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
    width: '25%', // Reduce width to another half (from 50% to 25%)
    aspectRatio: 1, // Keep it square (1:1 ratio)
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignSelf: 'center', // Center the smaller image container
    marginBottom: 8,
  },
  enhancedProductImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // Use cover instead of contain to fill the square nicely
  },
  enhancedProductPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 2,
  },
  activeImageIndicator: {
    backgroundColor: '#ffffff',
  },
  enhancedProductContent: {
    padding: 12,
  },
  enhancedProductTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
    lineHeight: 18,
  },
  enhancedProductDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginBottom: 8,
  },
  enhancedProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  enhancedProductButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
  },
  // Product Action Buttons
  productActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  buyNowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buyNowButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 4,
  },
  addToCartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  addToCartButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
  },
  // Rating Styles
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 10,
    color: '#6b7280',
  },
  // Price Styles
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
    marginRight: 6,
  },
  originalPrice: {
    fontSize: 12,
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  // Cart Button Styles
  cartButton: {
    position: 'relative',
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cartBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
});