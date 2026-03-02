import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Text,
  SafeAreaView,
  Platform,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
  Ionicons,
} from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import createAudioPlayer, {
  IAudioPlayer,
} from '../services/audio/AudioService';
import { api, paymentAPI } from '../services/api';
import { ProductLink } from '@/shared/media-schema';
import { useCart } from '@/contexts/CartContext';
import * as WebBrowser from 'expo-web-browser';
import PlaylistChat from './PlaylistChat';
import { Alert } from 'react-native';
import { MobileCompatibleImage } from '@/components/MobileCompatibleImage';
import { analyticsService } from '@/services/analyticsService';
import { getSessionId } from '@/utils/sessionTracking';
import { useAuth } from '@/contexts/AuthContext';
import { getAgeForTracking } from '@/utils/ageStorage';
import { getUserGender } from '@/utils/genderStorage';
import { getDemographicsForTracking } from '@/utils/demographicsHelper';

const { width } = Dimensions.get('window');

interface MediaItem {
  id: string | number;
  title?: string;
  s3_key?: string;
  url?: string;
  media_type?: 'image' | 'audio' | 'video';
  type?: string;
  fileType?: string;
  contentType?: string;
  caption?: string;
  displayOrder?: number;
  productLinks?: ProductLink[];
}

interface PlaylistPlayerProps {
  playlistId?: string;
  playlist?: any;
  media?: MediaItem[];
  autoPlay?: boolean;
}

const PlaylistPlayer = ({ playlistId, playlist, media: externalMedia, autoPlay = false }: PlaylistPlayerProps) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlistData, setPlaylistData] = useState<any>(playlist);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [productImageIndexes, setProductImageIndexes] = useState<Record<string, number>>({});
  const [videoDimensions, setVideoDimensions] = useState<{width: number, height: number} | null>(null);
  const [zoomLevel, setZoomLevel] = useState(0.5); // 1 = normal, 0.5 = zoomed out, 2 = zoomed in
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitButton, setShowExitButton] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [audioIntensity, setAudioIntensity] = useState(0);
  const [animTick, setAnimTick] = useState(0);
  
  const videoRef = useRef<Video>(null);
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);
  const html5AudioRef = useRef<HTMLAudioElement | null>(null); // keep web audio ref for cleanup
  // When advancing (next/prev or track end), remember whether we should resume playback on the next item
  const resumeOnAdvanceRef = useRef<boolean>(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRetriesRef = useRef<number>(3);
  
  // Stall detection state (for HTML5 video on web)
  const [isStalled, setIsStalled] = useState(false);
  const stallStartTimeRef = useRef<number | null>(null);
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const STALL_THRESHOLD_MS = 10000; // 10 seconds of buffering = stall
  const html5VideoRef = useRef<HTMLVideoElement | null>(null);

  // Analytics tracking state
  const playDurationRef = useRef<number>(0); // Duration in seconds
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTrackedPlayRef = useRef<boolean>(false); // Tracked 30-second milestone for unique plays
  const hasTrackedTotalPlayRef = useRef<boolean>(false); // Tracked initial play for total plays
  const currentMediaIdRef = useRef<number | null>(null);
  const currentMediaItemRef = useRef<MediaItem | null>(null); // Store current media item for ref callbacks
  const startPlayTrackingRef = useRef<((mediaItem: MediaItem) => Promise<void>) | null>(null); // Store tracking function

  const { addToCart, cart, getTotalItems } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  const isMobile = width < 768;

  // Used to size containers to content height to avoid large empty space
  const estimatedVideoHeight = useMemo(() => {
    return Math.max(200, Math.round(500 * zoomLevel));
  }, [zoomLevel]);

  // Audio-reactive intensity for Quick Pay button animation
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastIntensityUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 50;

  useEffect(() => {
    if (Platform.OS === 'web') {
      const video = html5VideoRef.current;
      const audio = html5AudioRef.current;
      const mediaEl = video || audio;
      if (!mediaEl || !mediaEl.src) {
        setAudioIntensity(0);
        return () => {};
      }
      try {
        const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current !== ctx) audioContextRef.current = ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const analyser = analyserRef.current || ctx.createAnalyser();
        if (analyserRef.current !== analyser) analyserRef.current = analyser;
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        let source = mediaSourceRef.current;
        if (!source || source.mediaElement !== mediaEl) {
          if (source) try { source.disconnect(); } catch (_) {}
          source = ctx.createMediaElementSource(mediaEl);
          mediaSourceRef.current = source;
          source.connect(analyser);
          analyser.connect(ctx.destination);
        }
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const sample = () => {
          if (!analyserRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length / 255;
          const now = Date.now();
          if (now - lastIntensityUpdateRef.current >= THROTTLE_MS) {
            lastIntensityUpdateRef.current = now;
            setAudioIntensity(Math.min(1, avg * 2));
          }
          rafRef.current = requestAnimationFrame(sample);
        };
        rafRef.current = requestAnimationFrame(sample);
        return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        };
      } catch (e) {
        setAudioIntensity(0);
        return () => {};
      }
    } else {
      // Native fallback: gentle pulse from playback state
      const id = setInterval(() => {
        setAudioIntensity(isPlaying ? 0.3 + Math.sin(Date.now() / 400) * 0.2 : 0.2);
      }, 100);
      return () => clearInterval(id);
    }
  }, [currentIndex, isPlaying, Platform.OS]);

  // Tick for Quick Pay button phase animation
  useEffect(() => {
    const id = setInterval(() => setAnimTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Disable right-click on web
    if (Platform.OS === 'web') {
      const handleContextMenu = (e: MouseEvent) => {
        // Allow context menu on inputs and text areas
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        // Prevent default context menu for other elements
        e.preventDefault();
      };

      document.addEventListener('contextmenu', handleContextMenu);
      
      return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
      };
    }
  }, []);

  const handleAddToCart = (productLink: ProductLink) => {
    try {
      const product = {
        id: productLink.id.toString(),
        name: productLink.title,
        description: productLink.description || '',
        price: parseFloat(productLink.price?.replace('$', '') || '0') * 100,
        imageUrl: productLink.imageUrl || '',
        images: productLink.images || [],
        category: '',
        in_stock: true,
        slug: '',
        hasSizes: false,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        userId: 0,
        metadata: {},
        prices: [{
          id: `price_${productLink.id}`,
          unit_amount: parseFloat(productLink.price?.replace('$', '') || '0') * 100,
          currency: 'usd',
          type: 'one_time' as const,
        }],
      };

      addToCart(product);
      Alert.alert('Added to Cart', `${product.name} has been added to your cart!`);
    } catch (error) {
      console.error('Add to cart error:', error);
      Alert.alert('Error', 'Failed to add item to cart');
    }
  };

  const handleBuyNow = async (productLink: ProductLink) => {
    if (isCheckoutLoading) return;
    setIsCheckoutLoading(true);
    try {
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = base;

      const items = [{ productId: productLink.id, quantity: 1 }];
      const { url } = await paymentAPI.createSession(items, successUrl, cancelUrl);

      if (Platform.OS === 'web') {
        // Direct redirect - no popups, works reliably on all devices
        console.log('🔗 PAYMENT: Redirecting to checkout:', url);
        window.location.href = url;
      } else if (Platform.OS === 'ios') {
        // iOS native: Try WebBrowser first, fallback to Linking if it fails
        try {
          const result = await WebBrowser.openBrowserAsync(url, {
            dismissButtonStyle: 'done',
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            controlsColor: '#3b82f6',
          });
          console.log('🔗 PAYMENT (iOS): Opened Stripe checkout from PlaylistPlayer, result:', result);
          
          if (result.type === 'cancel') {
            console.log('🔗 PAYMENT (iOS): User cancelled checkout');
          }
        } catch (webBrowserError) {
          console.warn('🔗 PAYMENT (iOS): WebBrowser failed, trying Linking API:', webBrowserError);
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            console.log('🔗 PAYMENT (iOS): Opened with Linking API');
          } else {
            throw new Error('Cannot open checkout URL on this device');
          }
        }
      } else {
        // Android: Use WebBrowser
        const result = await WebBrowser.openBrowserAsync(url);
        console.log('🔗 PAYMENT: Opened Stripe checkout from PlaylistPlayer, result:', result);
      }
    } catch (error) {
      console.error('Buy now error:', error);
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleImageNavigation = (productId: string, direction: 'prev' | 'next', imageCount: number) => {
    setProductImageIndexes(prev => {
      const currentIndex = prev[productId] || 0;
      const newIndex = direction === 'next' 
        ? (currentIndex + 1) % imageCount
        : (currentIndex - 1 + imageCount) % imageCount;
      
      return { ...prev, [productId]: newIndex };
    });
  };

  const formatPrice = (price: string | number): string => {
    if (typeof price === 'number') {
      return `$${price.toFixed(2)}`;
    }
    return price.toString();
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Ionicons key={i} name="star" size={12} color="#f59e0b" />);
    }
    
    if (hasHalfStar) {
      stars.push(<Ionicons key="half" name="star-half" size={12} color="#f59e0b" />);
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Ionicons key={`empty-${i}`} name="star-outline" size={12} color="#d1d5db" />);
    }
    
    return stars;
  };

  const fetchPlaylist = useCallback(async () => {
    if (externalMedia || playlist) {
      if (externalMedia) {
        setMedia(externalMedia);
        setPlaylistTitle(playlist?.name || 'Playlist');
        setPlaylistData(playlist);
      } else if (playlist) {
        setMedia(playlist.mediaFiles || []);
        setPlaylistTitle(playlist.name || 'Playlist');
        setPlaylistData(playlist);
      }
      setLoading(false);
      return;
    }

    if (!playlistId) {
      setError('No playlist data available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/playlist-access/${playlistId}`);

      // Normalize server casing to ensure creator userId is available for store routing
      const data = response.data;
      const mappedData = data ? { ...data, userId: data.user_id || data.userId } : null;

      if (mappedData) {
        setPlaylistData(mappedData);
        setMedia(mappedData.mediaFiles || []);
        setPlaylistTitle(mappedData.name || 'Playlist');
      } else {
        setError('No media found for this playlist. Please check the link and try again.');
      }
    } catch (err: any) {
      console.error('Failed to fetch playlist:', err);
      const errorMessage = err.response?.data?.message || 'Could not load playlist. The content may be private or no longer available.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [playlistId, externalMedia, playlist]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  const currentMediaItem = useMemo(() => {
    return media.length > 0 ? media[currentIndex] : null;
  }, [media, currentIndex]);

  // Update refs when values change
  useEffect(() => {
    currentMediaItemRef.current = currentMediaItem;
  }, [currentMediaItem]);

  // Analytics: Track ALL plays (no duration restriction)
  // Also track 30-second milestone for unique plays
  const startPlayTracking = useCallback(async (mediaItem: MediaItem) => {
    // Only track audio/video, not images
    // Check both media_type (legacy) and fileType/type (current API format)
    const mediaType = mediaItem.media_type || mediaItem.fileType || mediaItem.type;
    if (!mediaItem || (mediaType !== 'audio' && mediaType !== 'video')) {
      console.log('📊 TRACKING: Skipping tracking - not audio/video:', {
        id: mediaItem?.id,
        media_type: mediaItem?.media_type,
        fileType: mediaItem?.fileType,
        type: mediaItem?.type,
        mediaType
      });
      return;
    }
    console.log('📊 TRACKING: Starting play tracking for media:', {
      id: mediaItem.id,
      title: mediaItem.title,
      mediaType
    });

    // Reset tracking for new media
    if (currentMediaIdRef.current !== mediaItem.id) {
      playDurationRef.current = 0;
      hasTrackedPlayRef.current = false;
      hasTrackedTotalPlayRef.current = false;
      currentMediaIdRef.current = mediaItem.id;
    }

    // Clear any existing timer
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }

    // Track initial play start (for Total Plays - all durations)
    const trackPlay = async (duration: number, isUniqueMilestone: boolean = false) => {
      try {
        const sessionId = await getSessionId();
        
        // Get demographics for tracking
        let ageRange: string | undefined;
        let gender: string | undefined;
        let location: { city: string; state: string; zip?: string } | undefined;
        let locationSource: string | undefined;

        // Get age and gender data
        if (user) {
          // For authenticated users, get from demographics helper
          const demographics = getDemographicsForTracking(true, { ageRange: user.ageRange || null, gender: user.gender || null });
          ageRange = demographics?.ageRange;
          gender = demographics?.gender;
        } else {
          // For anonymous users, get from localStorage
          const age = getAgeForTracking();
          ageRange = age?.ageRange;
          // Get gender from localStorage if available
          const userGender = getUserGender();
          gender = userGender?.gender;
        }

        // Get location data (if available in localStorage)
        if (typeof window !== 'undefined') {
          try {
            const locationStr = localStorage.getItem('user_location_preference');
            if (locationStr) {
              const locationData = JSON.parse(locationStr);
              if (locationData.city && locationData.state) {
                location = {
                  city: locationData.city,
                  state: locationData.state,
                  zip: locationData.zip,
                };
                locationSource = 'user';
              }
            }
          } catch (e) {
            // Location not available, will use null
          }
        }
        
        // Track individual media play (all durations are tracked)
        if (mediaItem.id) {
          const mediaIdNum = typeof mediaItem.id === 'string' ? parseInt(mediaItem.id, 10) : Number(mediaItem.id);
          if (isNaN(mediaIdNum)) {
            console.error('📊 TRACKING: Invalid media ID:', mediaItem.id, 'Type:', typeof mediaItem.id);
            return;
          }
          console.log('📊 TRACKING: Calling trackMediaPlay with:', {
            mediaId: mediaIdNum,
            duration,
            sessionId: sessionId?.substring(0, 20) + '...',
            userId: user?.id,
            mediaItemId: mediaItem.id,
            mediaItemType: typeof mediaItem.id
          });
          try {
            await analyticsService.trackMediaPlay(
              mediaIdNum,
              duration,
              sessionId,
              user?.id,
              ageRange,
              gender,
              location,
              locationSource
            );
            console.log('📊 TRACKING: Successfully called trackMediaPlay');
          } catch (error) {
            console.error('📊 TRACKING: Error calling trackMediaPlay:', error);
            // Don't throw - we don't want tracking errors to break playback
          }
        } else {
          console.warn('📊 TRACKING: Media item has no ID:', mediaItem);
        }

        // Track playlist play if applicable (only >= 30s for these)
        if (isUniqueMilestone && playlistData?.id) {
          await analyticsService.trackPlaylistPlay(
            playlistData.id,
            duration,
            sessionId,
            user?.id,
            ageRange,
            gender,
            location,
            locationSource
          );
        }

        console.log(`📊 ANALYTICS: Play tracked - Media: ${mediaItem.id}, Duration: ${duration}s, Age: ${ageRange || 'none'}, Gender: ${gender || 'none'}, Location: ${location ? `${location.city}, ${location.state}` : 'none'}`);
      } catch (error) {
        console.error('Error tracking play:', error);
      }
    };

    // Track initial play (for Total Plays - tracks all plays)
    if (!hasTrackedTotalPlayRef.current) {
      hasTrackedTotalPlayRef.current = true;
      await trackPlay(1, false);
    }

    // Start timer to track playback duration
    playTimerRef.current = setInterval(async () => {
      playDurationRef.current += 1;

      // Track when we hit 30 seconds (for Unique Plays milestone)
      if (playDurationRef.current === 30 && !hasTrackedPlayRef.current) {
        hasTrackedPlayRef.current = true;
        await trackPlay(playDurationRef.current, true);
      }
    }, 1000); // Update every second
  }, [playlistData, user]);

  // Store tracking function in ref for use in event listeners
  useEffect(() => {
    startPlayTrackingRef.current = startPlayTracking;
  }, [startPlayTracking]);

  const stopPlayTracking = useCallback(() => {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  // Effect to manage play tracking based on isPlaying state
  useEffect(() => {
    console.log('📊 TRACKING: Effect triggered', { 
      isPlaying, 
      hasMediaItem: !!currentMediaItem, 
      mediaId: currentMediaItem?.id,
      mediaType: currentMediaItem?.media_type 
    });
    
    if (isPlaying && currentMediaItem) {
      // Only track audio/video, not images
      const currentMediaType = currentMediaItem.media_type || currentMediaItem.fileType || currentMediaItem.type;
      if (currentMediaType === 'audio' || currentMediaType === 'video') {
        console.log('📊 TRACKING: Starting play tracking for media:', currentMediaItem.id);
        startPlayTracking(currentMediaItem);
      } else {
        console.log('📊 TRACKING: Skipping tracking for non-audio/video media');
      }
    } else {
      console.log('📊 TRACKING: Stopping play tracking');
      stopPlayTracking();
    }

    // Cleanup on unmount or media change
    return () => {
      stopPlayTracking();
    };
  }, [isPlaying, currentMediaItem, startPlayTracking, stopPlayTracking]);

  // Reset tracking when media changes
  useEffect(() => {
    playDurationRef.current = 0;
    hasTrackedPlayRef.current = false;
    hasTrackedTotalPlayRef.current = false;
    currentMediaIdRef.current = null;
    stopPlayTracking();
  }, [currentIndex, stopPlayTracking]);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };
  }, []);

  // For playlists, we don't use background audio - each track plays individually
  // This is different from slideshows where we want continuous background music
  const backgroundAudioUrl = null;

  // Audio player lifecycle - disabled for playlists since we handle each track individually
  useEffect(() => {
    // Clean up any existing audio player
    if (audioPlayerRef.current) {
      audioPlayerRef.current?.unload();
      audioPlayerRef.current = null;
    }
  }, []);

  // Stop any currently playing media before switching tracks to avoid overlap
  const stopCurrentMedia = useCallback(() => {
    // Pause HTML5 video if present
    if (html5VideoRef.current) {
      try {
        html5VideoRef.current.pause();
        html5VideoRef.current.currentTime = 0;
        html5VideoRef.current.removeAttribute('src'); // fully unload
        html5VideoRef.current.load();
      } catch (e) {
        console.warn('Stop media: error stopping html5 video', e);
      }
    }

    // Pause HTML5 audio if present
    if (html5AudioRef.current) {
      try {
        html5AudioRef.current.pause();
        html5AudioRef.current.currentTime = 0;
        html5AudioRef.current.removeAttribute('src');
        html5AudioRef.current.load();
      } catch (e) {
        console.warn('Stop media: error stopping html5 audio', e);
      }
    }

    // Pause expo-av player (mobile) or shimmed web audio
    if (Platform.OS !== 'web' && (videoRef.current as any)?.stopAsync) {
      try {
        (videoRef.current as any).stopAsync().catch(() => {});
      } catch (e) {
        console.warn('Stop media: error calling stopAsync', e);
      }
    } else if ((videoRef.current as any)?.pauseAsync) {
      try {
        const pauseResult = (videoRef.current as any).pauseAsync();
        if (pauseResult && typeof pauseResult.catch === 'function') {
          pauseResult.catch(() => {});
        }
      } catch (e) {
        console.warn('Stop media: error calling pauseAsync', e);
      }
    }

    setIsPlaying(false);
  }, []);

  // Play/pause synchronization - only handle the current track's Video component
  useEffect(() => {
    // Only attempt programmatic play after user has interacted
    if (!userHasInteracted) {
      return;
    }

    if (isPlaying) {
      videoRef.current?.playAsync()?.catch((err) => {
        console.warn('Play failed:', err);
        // If play fails, retry once after short delay
        setTimeout(() => {
          videoRef.current?.playAsync()?.catch(() => {});
        }, 100);
      });
    } else {
      videoRef.current?.pauseAsync()?.catch((err) => {
        console.warn('Pause failed:', err);
      });
    }
  }, [isPlaying, userHasInteracted]);

  const goToNextVideo = useCallback(() => {
    // Stop current media first
    stopCurrentMedia();
    
    // Small delay to let cleanup complete before switching
    setTimeout(() => {
      if (currentIndex < media.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(0);
      }
    }, 100); // 100ms for cleanup
  }, [currentIndex, media.length, stopCurrentMedia]);

  const handleVideoError = useCallback((error: any) => {
    console.error('🎵 VIDEO_ERROR: Media playback failed:', error);
    console.log('🎵 VIDEO_ERROR: Current media item:', currentMediaItem);
    
    // Clear any existing retry/stall timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
    setIsStalled(false);
    stallStartTimeRef.current = null;
    
    // Check if we should retry automatically
    if (retryAttempt < maxRetriesRef.current) {
      const nextAttempt = retryAttempt + 1;
      const backoffDelay = Math.min(1000 * Math.pow(2, retryAttempt), 10000); // Exponential backoff, max 10s
      
      console.log(`🔄 RETRY: Attempting retry ${nextAttempt}/${maxRetriesRef.current} after ${backoffDelay}ms`);
      setIsReconnecting(true);
      setRetryAttempt(nextAttempt);
      
      // Log retry attempt to analytics (fire and forget)
      getSessionId().then(sessionId => {
        analyticsService.trackMediaPlay(
          typeof currentMediaItem?.id === 'string' ? parseInt(currentMediaItem.id, 10) : Number(currentMediaItem?.id) || 0,
          0, // Duration 0 for retry events
          sessionId,
          user?.id,
          undefined,
          undefined,
          undefined,
          'retry_attempt'
        ).catch(() => {}); // Don't let analytics errors break retry logic
      }).catch(() => {}); // Ignore session ID errors
      
      retryTimeoutRef.current = setTimeout(() => {
        console.log(`🔄 RETRY: Retrying playback (attempt ${nextAttempt})`);
        setIsReconnecting(false);
        // Force re-render by updating currentIndex (triggers video reload)
        stopCurrentMedia();
        setCurrentIndex(currentIndex);
      }, backoffDelay);
      
      return; // Don't skip yet, let retry happen
    }
    
    // Max retries reached - auto-skip to next track (non-blocking)
    console.warn(`🎵 VIDEO_ERROR: Max retries reached for "${currentMediaItem?.title || 'media file'}". Auto-skipping to next track.`);
    setIsReconnecting(false);
    setRetryAttempt(0); // Reset for next media item
    
    // Automatically skip to next track without blocking UI
    goToNextVideo();
  }, [currentMediaItem, goToNextVideo, currentIndex, retryAttempt, user, stopCurrentMedia]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      // Capture video dimensions when loaded - naturalSize is not available in current expo-av version
      // Use fallback dimensions for now
      if (!videoDimensions) {
        setVideoDimensions({
          width: 1920,
          height: 1080
        });
      }
      
      // Track when video/audio starts playing (for mobile expo-av)
      if (status.isPlaying && !status.didJustFinish) {
        console.log('📊 TRACKING: expo-av playback started, ensuring tracking');
        setIsPlaying(true);
        // Ensure tracking starts for mobile playback
        const mediaItem = currentMediaItemRef.current;
        const trackFn = startPlayTrackingRef.current;
        const itemMediaType = mediaItem?.media_type || mediaItem?.fileType || mediaItem?.type;
        if (mediaItem && trackFn && (itemMediaType === 'audio' || itemMediaType === 'video')) {
          console.log('📊 TRACKING: Starting tracking from expo-av playback status for media:', mediaItem.id);
          trackFn(mediaItem);
        }
      } else if (!status.isPlaying && !status.didJustFinish) {
        setIsPlaying(false);
      }
      
      if (status.didJustFinish) {
        // Track finished - remember to resume on next item and advance
        resumeOnAdvanceRef.current = true;
        goToNextVideo();
      }
    }
  }, [goToNextVideo, videoDimensions]);

  // Reset video position, dimensions, zoom, and fullscreen when changing videos
  useEffect(() => {
    const currentItemMediaType = media[currentIndex]?.media_type || media[currentIndex]?.fileType || media[currentIndex]?.type;
    if (videoRef.current && currentItemMediaType === 'video') {
      videoRef.current.setPositionAsync(0);
      setVideoDimensions(null); // Reset dimensions for new video
      setZoomLevel(0.5); // Reset zoom level for new video
      setIsFullscreen(false); // Reset fullscreen state for new video
    }
    // Reset retry state when media changes
    setRetryAttempt(0);
    setIsReconnecting(false);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, [currentIndex]);

  // Cleanup media when track changes
  useEffect(() => {
    return () => {
      // Ensure old media stops when index changes
      if (html5VideoRef.current) {
        try {
          html5VideoRef.current.pause();
        } catch (e) {}
      }
      if (html5AudioRef.current) {
        try {
          html5AudioRef.current.pause();
        } catch (e) {}
      }
    };
  }, [currentIndex]);

  // If we advanced while playing, auto-resume playback on the new item
  useEffect(() => {
    if (resumeOnAdvanceRef.current) {
      setIsPlaying(true);
      resumeOnAdvanceRef.current = false;
    }
  }, [currentIndex]);

  const handlePlayPause = () => {
    // Mark that user has interacted
    if (!userHasInteracted) {
      setUserHasInteracted(true);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const handlePrevious = () => {
    // Preserve play state across manual navigation
    resumeOnAdvanceRef.current = isPlaying;
    stopCurrentMedia();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      // Go to last video
      setCurrentIndex(media.length - 1);
    }
  };

  const handleNext = () => {
    // Preserve play state across manual navigation
    resumeOnAdvanceRef.current = isPlaying;
    stopCurrentMedia();
    goToNextVideo();
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 2)); // Max zoom 2x
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5)); // Min zoom 0.5x
  };

  const handleZoomReset = () => {
    setZoomLevel(0.5);
  };

  // Handle touch to show/hide exit button in fullscreen
  const handleScreenTouch = () => {
    if (isFullscreen) {
      setShowExitButton(true);
      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowExitButton(false);
      }, 3000);
    }
  };

  // Handle exit fullscreen
  const handleExitFullscreen = () => {
    setIsFullscreen(false);
    setShowExitButton(false);
    
    if (Platform.OS === 'web' && document.exitFullscreen) {
      document.exitFullscreen().catch((error) => {
        console.warn('Exit fullscreen failed:', error);
      });
    }
  };

  const handleFullscreen = async () => {
    try {
      const currentItem = media[currentIndex];
      const itemType = currentItem?.media_type || currentItem?.fileType || currentItem?.type;
      const isVideo = itemType === 'video' ||
                     currentItem?.contentType?.startsWith('video/');
      
      if (Platform.OS === 'web') {
        // For web platform, use native fullscreen API
        if (!document.fullscreenElement) {
          // Enter fullscreen - fullscreen the entire player container
          const playerContainer = document.querySelector('[data-playlist-player]') || 
                                 document.querySelector('.slideshowContainer') ||
                                 document.body;
          
          if (playerContainer) {
            // Try different fullscreen methods for better iOS Safari compatibility
            const requestFullscreen = playerContainer.requestFullscreen ||
                                     (playerContainer as any).webkitRequestFullscreen ||
                                     (playerContainer as any).mozRequestFullScreen ||
                                     (playerContainer as any).msRequestFullscreen;
            
            if (requestFullscreen) {
              try {
                await requestFullscreen.call(playerContainer);
                setIsFullscreen(true);
                console.log('🖥️ FULLSCREEN: Entered fullscreen mode on web');
              } catch (fsError) {
                console.warn('🖥️ FULLSCREEN: Native fullscreen failed, using fallback:', fsError);
                // Fallback to state-only fullscreen for iOS Safari
                setIsFullscreen(true);
              }
            } else {
              console.warn('🖥️ FULLSCREEN: Fullscreen API not available, using fallback');
              // Fallback to state-only fullscreen
              setIsFullscreen(true);
            }
          } else {
            console.warn('🖥️ FULLSCREEN: Container not found, using fallback');
            setIsFullscreen(true);
          }
        } else {
          // Exit fullscreen
          const exitFullscreen = document.exitFullscreen ||
                                (document as any).webkitExitFullscreen ||
                                (document as any).mozCancelFullScreen ||
                                (document as any).msExitFullscreen;
          
          if (exitFullscreen) {
            try {
              await exitFullscreen.call(document);
              setIsFullscreen(false);
              console.log('🖥️ FULLSCREEN: Exited fullscreen mode on web');
            } catch (fsError) {
              console.warn('🖥️ FULLSCREEN: Native exit fullscreen failed:', fsError);
              setIsFullscreen(false);
            }
          } else {
            setIsFullscreen(false);
          }
        }
      } else {
        // For mobile platform, use expo-av Video component fullscreen (only works for video)
        if (isVideo && videoRef.current) {
        if (!isFullscreen) {
          // Enter fullscreen
          await videoRef.current.presentFullscreenPlayer();
            console.log('📱 FULLSCREEN: Entered fullscreen mode on mobile (video)');
        } else {
          // Exit fullscreen
          await videoRef.current.dismissFullscreenPlayer();
            console.log('📱 FULLSCREEN: Exited fullscreen mode on mobile (video)');
          }
        } else {
          console.log('📱 FULLSCREEN: Audio files don\'t support native fullscreen on mobile');
          // For audio on mobile, we could expand the UI instead
          setIsFullscreen(!isFullscreen);
        }
      }
    } catch (error) {
      console.error('🖥️ FULLSCREEN: Error:', error);
      // Fallback: toggle state manually if API fails
      setIsFullscreen(!isFullscreen);
    }
  };

  const renderCurrentMedia = () => {
    const currentItem = media[currentIndex];
    if (!currentItem) return null;
    
    // Enhanced media type detection
    const itemType = currentItem.media_type || currentItem.fileType || currentItem.type;
    const isVideo = itemType === 'video' ||
                   currentItem.contentType?.startsWith('video/');
    
    const isAudio = itemType === 'audio' ||
                   currentItem.contentType?.startsWith('audio/');
    
    const isImage = !isVideo && !isAudio; // Default to image if not video or audio
    
    // Use streaming endpoint URLs as provided by the server
    // For web platform, use a proxy approach to avoid CORS issues with HTML5 media elements
    let itemUri = currentItem.url?.startsWith('http') 
      ? currentItem.url 
      : `${api.defaults.baseURL?.replace('/api', '') || 'https://merchtech5-production.up.railway.app'}/api/media/${currentItem.id}/stream`;
    
    // For web platform, if the URL is cross-origin, try to use same-origin proxy if available
    if (Platform.OS === 'web' && itemUri.includes('merchtech5-production.up.railway.app')) {
      // Try to use the current domain as a proxy to avoid CORS issues
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      if (currentOrigin && !currentOrigin.includes('merchtech5-production.up.railway.app')) {
        console.log('🎵 CORS_WORKAROUND: Attempting same-origin proxy for media:', currentItem.id);
        // Keep the original URL but add a flag for debugging
        console.log('🎵 CORS_WORKAROUND: Original URL:', itemUri);
        console.log('🎵 CORS_WORKAROUND: Current origin:', currentOrigin);
      }
    }

    console.log('🎵 MEDIA_DETECTION:', {
      title: currentItem.title,
      media_type: currentItem.media_type,
      fileType: currentItem.fileType,
      type: currentItem.type,
      contentType: currentItem.contentType,
      isVideo,
      isAudio,
      isImage,
      originalUrl: currentItem.url,
      generatedUri: itemUri,
      mediaId: currentItem.id,
      apiBaseUrl: api.defaults.baseURL,
      s3_key: currentItem.s3_key,
      fullMediaObject: currentItem
    });

    // Calculate dynamic video style based on actual video dimensions and zoom level
    const getVideoStyle = () => {
      const screenWidth = Dimensions.get('window').width;
      const screenHeight = Dimensions.get('window').height;
      
      if (videoDimensions) {
        let baseWidth, baseHeight;
        
        if (isFullscreen) {
          // In fullscreen mode, use the entire screen dimensions
          if (Platform.OS === 'web') {
            // For web, use full viewport dimensions
            baseWidth = screenWidth;
            baseHeight = screenHeight;
          } else {
            // For mobile, account for status bar and navigation
            baseWidth = screenWidth;
            baseHeight = screenHeight * 0.95; // Leave 5% for system UI
          }
        } else {
          // Normal mode: use container-appropriate dimensions
          const baseHeightNormal = 500; // Conservative height that should fit in most containers
        const videoAspectRatio = videoDimensions.width / videoDimensions.height;
          baseWidth = (baseHeightNormal * videoAspectRatio) * 1.25; // Widen by 25%
          baseHeight = baseHeightNormal;
        }
        
        // Apply zoom level
        const zoomedWidth = baseWidth * zoomLevel;
        const zoomedHeight = baseHeight * zoomLevel;
        
        return {
          width: zoomedWidth,
          height: zoomedHeight,
          alignSelf: 'center' as const,
          borderRadius: isFullscreen ? 0 : 8, // No border radius in fullscreen
          transform: [{ scale: 1 }], // Keep scale at 1, we're changing dimensions instead
        };
      }
      
      // Fallback style while dimensions are loading
      if (isFullscreen) {
        return {
          width: screenWidth,
          height: screenHeight * 0.9,
          alignSelf: 'center' as const,
          borderRadius: 0,
          transform: [{ scale: 1 }],
        };
      } else {
      return {
        width: width * 0.9, // Use 90% of screen width instead of string percentage
        height: 500 * zoomLevel,
        alignSelf: 'center' as const,
        borderRadius: 8,
        transform: [{ scale: 1 }],
      };
      }
    };

    if (isVideo) {
      console.log('🎵 VIDEO_COMPONENT: Rendering video with URI:', itemUri);
      
      // Use native HTML5 video for web, expo-av Video for mobile
      if (Platform.OS === 'web') {
        console.log('🎵 HTML5_VIDEO: About to render video element with:', {
          src: itemUri,
          isPlaying,
          isMuted,
          currentItem: currentItem.title
        });
        
        return (
          <video
            key={`video-${currentIndex}-${currentItem.id}`}
            ref={(ref) => {
              console.log('🎵 HTML5_VIDEO: Video ref callback called:', !!ref);
              // Store the native HTML5 video element ref
              html5VideoRef.current = ref;
              if (ref) {
                // Store reference for play/pause control
                (videoRef as any).current = {
                  playAsync: () => {
                    console.log('🎵 HTML5_VIDEO: playAsync called');
                    return ref.play();
                  },
                  pauseAsync: () => {
                    console.log('🎵 HTML5_VIDEO: pauseAsync called');
                    ref.pause();
                    return Promise.resolve(); // Return resolved promise
                  },
                  setPositionAsync: (position: number) => { 
                    console.log('🎵 HTML5_VIDEO: setPositionAsync called:', position);
                    ref.currentTime = position / 1000; 
                  },
                };
                
                // Add comprehensive event listeners
                ref.addEventListener('loadstart', () => {
                  console.log('🎵 HTML5_VIDEO: loadstart - browser started loading');
                });
                
                ref.addEventListener('durationchange', () => {
                  console.log('🎵 HTML5_VIDEO: durationchange - duration:', ref.duration);
                });
                
                ref.addEventListener('loadedmetadata', () => {
                  console.log('🎵 HTML5_VIDEO: loadedmetadata - metadata loaded');
                });
                
                ref.addEventListener('loadeddata', () => {
                  console.log('🎵 HTML5_VIDEO: loadeddata - first frame loaded');
                });
                
                ref.addEventListener('progress', () => {
                  console.log('🎵 HTML5_VIDEO: progress - downloading');
                });
                
                ref.addEventListener('canplay', () => {
                  console.log('🎵 HTML5_VIDEO: canplay - can start playing');
                });
                
                  ref.addEventListener('canplaythrough', () => {
                    console.log('🎵 HTML5_VIDEO: canplaythrough - can play without stopping');
                  });
                  
                  // Track when video actually starts playing (native event)
                  ref.addEventListener('playing', () => {
                    console.log('🎵 HTML5_VIDEO: Native playing event - video is playing');
                    console.log('📊 TRACKING: Native playing event, ensuring tracking starts');
                    setIsPlaying(true);
                    // Ensure tracking starts even if state wasn't updated
                    const mediaItem = currentMediaItemRef.current;
                    const trackFn = startPlayTrackingRef.current;
      const mediaType = mediaItem?.media_type || mediaItem?.fileType || mediaItem?.type;
      if (mediaItem && trackFn && (mediaType === 'audio' || mediaType === 'video')) {
        console.log('📊 TRACKING: Starting tracking from native playing event for media:', mediaItem.id);
        trackFn(mediaItem);
      } else {
        console.log('📊 TRACKING: Cannot start tracking - missing media item or tracking function', {
          hasMediaItem: !!mediaItem,
          hasTrackFn: !!trackFn,
          mediaType: mediaType
        });
      }
                  });
                  
                  ref.addEventListener('pause', () => {
                    console.log('🎵 HTML5_VIDEO: Native pause event - video paused');
                    setIsPlaying(false);
                  });
                  
                  ref.addEventListener('error', (e) => {
                    console.error('🎵 HTML5_VIDEO: Native error event:', {
                      error: ref.error,
                      networkState: ref.networkState,
                      readyState: ref.readyState,
                      src: ref.src,
                      currentSrc: ref.currentSrc
                    });
                  });
              }
            }}
            src={itemUri}
            style={{
              width: videoDimensions ? (videoDimensions.width / videoDimensions.height) * (500 * zoomLevel) : width * 0.9,
              height: 500 * zoomLevel,
              alignSelf: 'center',
              borderRadius: 8,
              objectFit: 'contain'
            } as React.CSSProperties}
            controls={false}
            playsInline
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            muted={isMuted}
            onError={(e) => {
              const video = e.target as HTMLVideoElement;
              const errorCode = video.error?.code;
              const errorCodeMeaning = errorCode === 1 ? 'MEDIA_ERR_ABORTED' :
                                       errorCode === 2 ? 'MEDIA_ERR_NETWORK' :
                                       errorCode === 3 ? 'MEDIA_ERR_DECODE' :
                                       errorCode === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' : 'UNKNOWN';
              
              console.error('🎵 HTML5_VIDEO_ERROR:', {
                error: video.error,
                networkState: video.networkState,
                readyState: video.readyState,
                src: video.src,
                currentSrc: video.currentSrc,
                errorCode: errorCode,
                errorMessage: video.error?.message,
                errorCodeMeaning: errorCodeMeaning
              });
              
              // For MEDIA_ERR_SRC_NOT_SUPPORTED (code 4), skip immediately without retries
              // This error indicates format incompatibility that won't be fixed by retrying
              if (errorCode === 4) {
                console.warn('🎵 VIDEO_ERROR: Format not supported (MEDIA_ERR_SRC_NOT_SUPPORTED). Skipping immediately.');
                setRetryAttempt(maxRetriesRef.current); // Set to max to bypass retry logic
                resumeOnAdvanceRef.current = true;
                goToNextVideo();
                return;
              }
              
              handleVideoError(e);
            }}
            onEnded={() => {
              console.log('🎵 HTML5_VIDEO: Video ended, going to next');
              // Preserve play state across auto-advance
              resumeOnAdvanceRef.current = true;
              goToNextVideo();
            }}
            onLoadStart={() => {
              console.log('🎵 HTML5_VIDEO: onLoadStart - React event');
            }}
            onLoadedData={() => {
              console.log('🎵 HTML5_VIDEO: onLoadedData - React event');
            }}
            onCanPlay={() => {
              console.log('🎵 HTML5_VIDEO: onCanPlay - React event');
            }}
            onCanPlayThrough={() => {
              console.log('🎵 HTML5_VIDEO: onCanPlayThrough - React event');
              // Auto-play when media is ready and user has interacted
              if (userHasInteracted && isPlaying && html5VideoRef.current) {
                console.log('🎵 HTML5_VIDEO: Auto-playing on canplaythrough');
                html5VideoRef.current.play().catch((err) => {
                  console.warn('🎵 HTML5_VIDEO: Auto-play on canplaythrough failed:', err);
                });
              }
            }}
            onWaiting={() => {
              console.log('🎵 HTML5_VIDEO: onWaiting - React event');
              // Stall detection: track when video is waiting/buffering
              if (!stallStartTimeRef.current) {
                // Buffering just started
                stallStartTimeRef.current = Date.now();
                setIsStalled(false);
                
                // Set timeout to detect stall
                if (stallTimeoutRef.current) {
                  clearTimeout(stallTimeoutRef.current);
                }
                stallTimeoutRef.current = setTimeout(() => {
                  const currentMediaItem = media[currentIndex];
                  console.warn(`⏸️ STALL_DETECTED: Media "${currentMediaItem?.title || 'media file'}" stalled for ${STALL_THRESHOLD_MS}ms. Attempting recovery.`);
                  setIsStalled(true);
                  
                  // Try to recover: pause and resume
                  const video = html5VideoRef.current;
                  if (video) {
                    video.pause();
                    setTimeout(() => {
                      video.play().catch(() => {
                        // If resume fails, trigger retry logic
                        console.warn('⏸️ STALL_RECOVERY_FAILED: Triggering retry');
                        handleVideoError({ code: 2, message: 'Stall recovery failed' });
                      });
                    }, 500);
                  }
                  
                  // Clear stall tracking
                  if (stallTimeoutRef.current) {
                    clearTimeout(stallTimeoutRef.current);
                    stallTimeoutRef.current = null;
                  }
                  stallStartTimeRef.current = null;
                }, STALL_THRESHOLD_MS);
              }
            }}
            onPlaying={() => {
              console.log('🎵 HTML5_VIDEO: onPlaying - React event');
              console.log('📊 TRACKING: Video started playing, setting isPlaying to true');
              setIsPlaying(true);
              
              // Not buffering - clear stall tracking
              if (stallStartTimeRef.current) {
                const bufferingDuration = Date.now() - stallStartTimeRef.current;
                if (bufferingDuration > STALL_THRESHOLD_MS) {
                  console.log(`✅ STALL_RECOVERED: Buffering resolved after ${bufferingDuration}ms`);
                }
                stallStartTimeRef.current = null;
                setIsStalled(false);
              }
              if (stallTimeoutRef.current) {
                clearTimeout(stallTimeoutRef.current);
                stallTimeoutRef.current = null;
              }
            }}
            onPause={() => {
              console.log('🎵 HTML5_VIDEO: onPause - React event');
              setIsPlaying(false);
            }}
            onLoadedMetadata={(e) => {
              const video = e.target as HTMLVideoElement;
              console.log('🎵 HTML5_VIDEO: Loaded metadata, dimensions:', video.videoWidth, 'x', video.videoHeight);
              console.log('🎵 HTML5_VIDEO: Video element state:', {
                readyState: video.readyState,
                networkState: video.networkState,
                duration: video.duration,
                src: video.src,
                currentSrc: video.currentSrc
              });
              setVideoDimensions({
                width: video.videoWidth,
                height: video.videoHeight
              });
            }}
          />
        );
      } else {
        // Use expo-av Video for mobile
        return (
          <Video
            ref={videoRef}
            source={{ uri: itemUri }}
            rate={1.0}
            volume={1.0}
            isMuted={isMuted}
            shouldPlay={isPlaying}
            isLooping={false}
            resizeMode={ResizeMode.CONTAIN}
            style={getVideoStyle()}
            useNativeControls={true}
            // On iOS ensure controls show and video plays inline when available
            // Note: expo-av handles inline playback on iOS Safari when not fullscreen
            onPlaybackStatusUpdate={(status) => {
              onPlaybackStatusUpdate(status);
              if ((status as any).isLoaded) {
                const s = status as any;
                if (typeof s.isPlaying === 'boolean') {
                  setIsPlaying(s.isPlaying);
                }
              }
            }}
            onFullscreenUpdate={(status) => setIsFullscreen(status.fullscreenUpdate === 1)}
            onError={handleVideoError}
          />
        );
      }
    } else if (isAudio) {
      // Audio player interface
      console.log('🎵 AUDIO_COMPONENT: Rendering audio with URI:', itemUri);
      
      if (Platform.OS === 'web') {
        console.log('🎵 HTML5_AUDIO: About to render audio element with:', {
          src: itemUri,
          isPlaying,
          isMuted,
          currentItem: currentItem.title
        });
        
      return (
        <View style={styles.audioPlayerContainer}>
          <View style={styles.audioVisualization}>
            <View style={styles.audioWaveform}>
              {/* Audio waveform visualization */}
              {Array.from({ length: 20 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      height: Math.random() * 60 + 20,
                      backgroundColor: isPlaying ? '#3b82f6' : '#e5e7eb',
                      animationDelay: `${i * 0.1}s`,
                    },
                  ]}
                />
              ))}
            </View>
            
            {!isFullscreen && (
            <View style={styles.audioInfo}>
              <MaterialIcons name="music-note" size={48} color="#3b82f6" />
              <Text style={styles.audioTitle}>{currentItem.title}</Text>
              <Text style={styles.audioSubtitle}>Audio Track</Text>
            </View>
            )}
          </View>
          
            {/* HTML5 audio element for web */}
            <audio
              key={`audio-${currentIndex}-${currentItem.id}`}
              crossOrigin="anonymous"
              ref={(ref) => {
                console.log('🎵 HTML5_AUDIO: Audio ref callback called:', !!ref);
                html5AudioRef.current = ref;
                if (ref) {
                  // Store reference for play/pause control
                  (videoRef as any).current = {
                    playAsync: () => {
                      console.log('🎵 HTML5_AUDIO: playAsync called');
                      return ref.play();
                    },
                    pauseAsync: () => {
                      console.log('🎵 HTML5_AUDIO: pauseAsync called');
                      ref.pause();
                      return Promise.resolve(); // Return resolved promise
                    },
                    setPositionAsync: (position: number) => { 
                      console.log('🎵 HTML5_AUDIO: setPositionAsync called:', position);
                      ref.currentTime = position / 1000; 
                    },
                  };
                  
                  // Add comprehensive event listeners
                  ref.addEventListener('loadstart', () => {
                    console.log('🎵 HTML5_AUDIO: loadstart - browser started loading');
                  });
                  
                  ref.addEventListener('durationchange', () => {
                    console.log('🎵 HTML5_AUDIO: durationchange - duration:', ref.duration);
                  });
                  
                  ref.addEventListener('loadedmetadata', () => {
                    console.log('🎵 HTML5_AUDIO: loadedmetadata - metadata loaded');
                  });
                  
                  ref.addEventListener('loadeddata', () => {
                    console.log('🎵 HTML5_AUDIO: loadeddata - first frame loaded');
                  });
                  
                  ref.addEventListener('progress', () => {
                    console.log('🎵 HTML5_AUDIO: progress - downloading');
                  });
                  
                  ref.addEventListener('canplay', () => {
                    console.log('🎵 HTML5_AUDIO: canplay - can start playing');
                  });
                  
                  ref.addEventListener('canplaythrough', () => {
                    console.log('🎵 HTML5_AUDIO: canplaythrough - can play without stopping');
                  });
                  
                  // Track when audio actually starts playing (native event)
                  ref.addEventListener('playing', () => {
                    console.log('🎵 HTML5_AUDIO: Native playing event - audio is playing');
                    console.log('📊 TRACKING: Native playing event, ensuring tracking starts');
                    setIsPlaying(true);
                    // Ensure tracking starts even if state wasn't updated
                    const mediaItem = currentMediaItemRef.current;
                    const trackFn = startPlayTrackingRef.current;
      const mediaType = mediaItem?.media_type || mediaItem?.fileType || mediaItem?.type;
      if (mediaItem && trackFn && (mediaType === 'audio' || mediaType === 'video')) {
        console.log('📊 TRACKING: Starting tracking from native playing event for media:', mediaItem.id);
        trackFn(mediaItem);
      } else {
        console.log('📊 TRACKING: Cannot start tracking - missing media item or tracking function', {
          hasMediaItem: !!mediaItem,
          hasTrackFn: !!trackFn,
          mediaType: mediaType
        });
      }
                  });
                  
                  ref.addEventListener('pause', () => {
                    console.log('🎵 HTML5_AUDIO: Native pause event - audio paused');
                    setIsPlaying(false);
                  });
                  
                  ref.addEventListener('error', (e) => {
                    console.error('🎵 HTML5_AUDIO: Native error event:', {
                      error: ref.error,
                      networkState: ref.networkState,
                      readyState: ref.readyState,
                      src: ref.src,
                      currentSrc: ref.currentSrc
                    });
                  });
                  
                  ref.addEventListener('ended', () => {
                    console.log('🎵 HTML5_AUDIO: Audio ended, going to next');
                    // Preserve play state across auto-advance
                    resumeOnAdvanceRef.current = true;
                    goToNextVideo();
                  });
                }
              }}
              src={itemUri}
              style={{ width: '100%', maxWidth: 600 } as React.CSSProperties}
              controls={false}
              controlsList="nodownload noplaybackrate noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              muted={isMuted}
              onError={(e) => {
                const audio = e.target as HTMLAudioElement;
                const errorCode = audio.error?.code;
                const errorCodeMeaning = errorCode === 1 ? 'MEDIA_ERR_ABORTED' :
                                         errorCode === 2 ? 'MEDIA_ERR_NETWORK' :
                                         errorCode === 3 ? 'MEDIA_ERR_DECODE' :
                                         errorCode === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' : 'UNKNOWN';
                
                console.error('🎵 HTML5_AUDIO_ERROR:', {
                  error: audio.error,
                  networkState: audio.networkState,
                  readyState: audio.readyState,
                  src: audio.src,
                  currentSrc: audio.currentSrc,
                  errorCode: errorCode,
                  errorMessage: audio.error?.message,
                  errorCodeMeaning: errorCodeMeaning
                });
                
                // For MEDIA_ERR_SRC_NOT_SUPPORTED (code 4), skip immediately without retries
                // This error indicates format incompatibility that won't be fixed by retrying
                if (errorCode === 4) {
                  console.warn('🎵 AUDIO_ERROR: Format not supported (MEDIA_ERR_SRC_NOT_SUPPORTED). Skipping immediately.');
                  setRetryAttempt(maxRetriesRef.current); // Set to max to bypass retry logic
                  resumeOnAdvanceRef.current = true;
                  goToNextVideo();
                  return;
                }
                
                handleVideoError(e);
              }}
              onLoadStart={() => {
                console.log('🎵 HTML5_AUDIO: onLoadStart - React event');
              }}
              onLoadedData={() => {
                console.log('🎵 HTML5_AUDIO: onLoadedData - React event');
              }}
              onCanPlay={() => {
                console.log('🎵 HTML5_AUDIO: onCanPlay - React event');
              }}
              onCanPlayThrough={() => {
                console.log('🎵 HTML5_AUDIO: onCanPlayThrough - React event');
                // Auto-play when media is ready and user has interacted
                if (userHasInteracted && isPlaying && html5AudioRef.current) {
                  console.log('🎵 HTML5_AUDIO: Auto-playing on canplaythrough');
                  html5AudioRef.current.play().catch((err) => {
                    console.warn('🎵 HTML5_AUDIO: Auto-play on canplaythrough failed:', err);
                  });
                }
              }}
              onWaiting={() => {
                console.log('🎵 HTML5_AUDIO: onWaiting - React event');
              }}
              onPlaying={() => {
                console.log('🎵 HTML5_AUDIO: onPlaying - React event');
                console.log('📊 TRACKING: Audio started playing, setting isPlaying to true');
                setIsPlaying(true);
              }}
              onPause={() => {
                console.log('🎵 HTML5_AUDIO: onPause - React event');
                setIsPlaying(false);
              }}
              onEnded={() => {
                console.log('🎵 HTML5_AUDIO: Audio ended, going to next');
                // Preserve play state across auto-advance
                resumeOnAdvanceRef.current = true;
                goToNextVideo();
              }}
            />
          </View>
        );
      } else {
        // Use expo-av Video for mobile (audio files)
        return (
          <View style={styles.audioPlayerContainer}>
            <View style={styles.audioVisualization}>
              <View style={styles.audioWaveform}>
                {/* Audio waveform visualization */}
                {Array.from({ length: 20 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.waveformBar,
                      {
                        height: Math.random() * 60 + 20,
                        backgroundColor: isPlaying ? '#3b82f6' : '#e5e7eb',
                        animationDelay: `${i * 0.1}s`,
                      },
                    ]}
                  />
                ))}
              </View>
              
              {!isFullscreen && (
                <View style={styles.audioInfo}>
                  <MaterialIcons name="music-note" size={48} color="#3b82f6" />
                  <Text style={styles.audioTitle}>{currentItem.title}</Text>
                  <Text style={styles.audioSubtitle}>Audio Track</Text>
                </View>
              )}
            </View>
            
            {/* Hidden expo-av Video element for mobile audio playback */}
          <Video
            ref={videoRef}
            source={{ uri: itemUri }}
            rate={1.0}
            volume={1.0}
            isMuted={isMuted}
            shouldPlay={isPlaying}
            isLooping={false}
            style={{ width: 0, height: 0, opacity: 0 }}
            useNativeControls={false}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            onError={handleVideoError}
          />
        </View>
      );
      }
    } else {
      // Image display
      return (
        <ExpoImage
          source={{ uri: itemUri }}
          style={getVideoStyle()}
          contentFit="contain"
          transition={300}
        />
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.infoText}>Loading Playlist...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={60} color="#ff5555" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (media.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="queue-music" size={60} color="#aaa" />
        <Text style={styles.infoText}>No media files found in playlist.</Text>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={handleScreenTouch}>
      <View style={[styles.slideshowContainer, isFullscreen && styles.fullscreenContainer]} data-playlist-player="true">
      {!isFullscreen && (
      <View style={styles.slideshowHeader}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.slideshowTitle}>{playlistTitle}</Text>
        <TouchableOpacity style={styles.cartButton} onPress={() => {
          console.log('Navigate to cart');
          if (Platform.OS === 'web') {
            window.location.href = '/store/cart';
          } else {
            router.push('/store/cart');
          }
        }}>
          <MaterialIcons name="shopping-cart" size={24} color="#374151" />
          {/* Cart item count badge */}
          {getTotalItems() > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{getTotalItems()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      )}
      
      {/* Scrollable Main Content */}
      <ScrollView 
        style={[styles.scrollContainer, isFullscreen && styles.fullscreenScrollContainer]}
        showsVerticalScrollIndicator={!isFullscreen}
        contentContainerStyle={[styles.scrollContent, isFullscreen && styles.fullscreenScrollContent]}
      >
        <View style={[styles.slideshowMainContent, isFullscreen && styles.fullscreenMainContent, isMobile && styles.mobileMainContent]}>
        <View style={[
            styles.slideshowLeftPanel,
            isFullscreen && styles.fullscreenLeftPanel,
            isMobile && styles.mobileLeftPanel,
            !isFullscreen && { minHeight: estimatedVideoHeight + 180 }
          ]}>
            <View style={[
              styles.videoContainer,
              isFullscreen && styles.fullscreenVideoContainer,
              !isFullscreen && { minHeight: estimatedVideoHeight }
            ]}>
                {renderCurrentMedia()}
                
                {/* Play Overlay - shown until first user interaction */}
                {!userHasInteracted && !isPlaying && (
                  <TouchableOpacity 
                    style={styles.playOverlay}
                    onPress={() => {
                      setUserHasInteracted(true);
                      setIsPlaying(true);
                      // Directly trigger play to avoid race condition with effect
                      // Use native element refs for more reliable playback
                      setTimeout(() => {
                        // Try HTML5 video first
                        if (html5VideoRef.current) {
                          console.log('🎵 OVERLAY: Playing via HTML5 video ref');
                          html5VideoRef.current.play().catch((err) => {
                            console.warn('Initial video play failed:', err);
                          });
                        } 
                        // Try HTML5 audio
                        else if (html5AudioRef.current) {
                          console.log('🎵 OVERLAY: Playing via HTML5 audio ref');
                          html5AudioRef.current.play().catch((err) => {
                            console.warn('Initial audio play failed:', err);
                          });
                        }
                        // Fallback to videoRef shim
                        else {
                          console.log('🎵 OVERLAY: Playing via videoRef shim');
                          videoRef.current?.playAsync()?.catch((err) => {
                            console.warn('Initial play failed:', err);
                          });
                        }
                      }, 100); // Increased delay to ensure refs are set
                    }}
                  >
                    <View style={styles.playOverlayButton}>
                      <FontAwesome5 name="play" size={48} color="#ffffff" />
                    </View>
                    <Text style={styles.playOverlayText}>
                      Tap to Start Playlist
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Reconnecting Overlay */}
                {isReconnecting && (
                  <View style={styles.reconnectingOverlay}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                    <Text style={styles.reconnectingText}>Reconnecting...</Text>
                    <Text style={styles.reconnectingSubtext}>Attempt {retryAttempt} of {maxRetriesRef.current}</Text>
                  </View>
                )}
            </View>
            
            {/* Quick Pay Overlay - visible in both standard and fullscreen when products exist.
                Validation: (1) Chips render and are tappable in standard mode.
                (2) Enter fullscreen and verify chips remain reachable and do not block controls.
                (3) Buy Now launches checkout from both standard and fullscreen.
                (4) No chips when no active playlist products. (5) Playback controls unchanged. */}
            {(() => {
              const activeProducts = playlistData?.productLinks
                ?.filter((link: ProductLink) => link.isActive)
                .sort((a: ProductLink, b: ProductLink) => a.displayOrder - b.displayOrder) ?? [];
              if (activeProducts.length === 0) return null;
              return (
                <View style={[
                  styles.quickPayOverlay,
                  isFullscreen && styles.quickPayOverlayFullscreen,
                ]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickPayScrollContent}
                  >
                    {activeProducts.map((link: ProductLink, idx: number) => {
                      const phase = (idx * 0.2) % 1;
                      const animScale = 1 + audioIntensity * 0.08 * Math.sin(animTick * 0.15 + phase * Math.PI * 2);
                      const animOpacity = 0.85 + audioIntensity * 0.15;
                      return (
                        <TouchableOpacity
                          key={link.id}
                          style={[
                            styles.quickPayButton,
                            {
                              opacity: animOpacity,
                              transform: [{ scale: animScale }],
                            },
                          ]}
                          onPress={() => handleBuyNow(link)}
                          disabled={isCheckoutLoading}
                          activeOpacity={0.8}
                        >
                          {isCheckoutLoading ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <MaterialIcons name="flash-on" size={14} color="#fff" />
                              <Text style={styles.quickPayButtonText} numberOfLines={1}>
                                {link.title}
                              </Text>
                              {link.price && (
                                <Text style={styles.quickPayPriceText}>{formatPrice(link.price)}</Text>
                              )}
                            </>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            {/* CONTROLS MOVED HERE */}
            <View style={styles.controls}>
                <TouchableOpacity onPress={handlePrevious} style={styles.controlButton}>
                <MaterialIcons
                    name="skip-previous"
                    size={30}
                    color="white"
                />
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
                <FontAwesome5
                    name={isPlaying ? 'pause' : 'play'}
                    size={28}
                    color="white"
                />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNext} style={styles.controlButton}>
                <MaterialIcons
                    name="skip-next"
                    size={30}
                    color="white"
                />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleMuteToggle} style={styles.controlButton}>
                <MaterialCommunityIcons
                    name={isMuted ? 'volume-off' : 'volume-high'}
                    size={30}
                    color="white"
                />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleFullscreen} style={styles.controlButton}>
                <MaterialIcons
                    name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
                    size={30}
                    color="white"
                />
                </TouchableOpacity>
                <View style={styles.zoomControls}>
                  <TouchableOpacity onPress={handleZoomOut} style={styles.zoomButton}>
                    <MaterialIcons name="zoom-out" size={24} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleZoomReset} style={styles.zoomButton}>
                    <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleZoomIn} style={styles.zoomButton}>
                    <MaterialIcons name="zoom-in" size={24} color="white" />
                  </TouchableOpacity>
                </View>
                <View style={styles.videoProgress}>
                  <Text style={styles.progressText}>
                    {currentIndex + 1} / {media.length}
                  </Text>
                </View>
            </View>
        </View>

        {!isFullscreen && (
        <View style={[styles.slideshowRightPanel, isMobile && styles.mobileRightPanel]}>
          <View style={styles.featuredProductsHeader}>
            <MaterialIcons name="storefront" size={24} color="#374151" />
            <Text style={styles.featuredProductsTitle}>Featured Products</Text>
          </View>
          <ScrollView
            style={styles.featuredProductsContent}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.productsListContent}
          >
            {playlistData?.productLinks && playlistData.productLinks.length > 0 ? (
              playlistData.productLinks
                .filter((link: ProductLink) => link.isActive)
                .sort((a: ProductLink, b: ProductLink) => a.displayOrder - b.displayOrder)
                .map((link: ProductLink) => {
                  const images = link.images && link.images.length > 0 ? link.images : [link.imageUrl].filter(Boolean);
                  const currentImageIndex = productImageIndexes[link.id] || 0;
                  const currentImage = images[currentImageIndex];

                  return (
                    <View key={link.id} style={styles.enhancedProductCard}>
                      <View style={styles.productImageContainer}>
                        {currentImage ? (
                          <>
                            <MobileCompatibleImage
                              uri={currentImage}
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
                                  {images.map((_: string | undefined, index: number) => (
                                    <View
                                      key={`image-indicator-${link.id}-${index}`}
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

                      <View style={styles.enhancedProductContent}>
                        <Text style={styles.enhancedProductTitle} numberOfLines={2}>
                          {link.title}
                        </Text>

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

                        {link.price && (
                          <View style={styles.priceContainer}>
                            <Text style={styles.currentPrice}>{formatPrice(link.price)}</Text>
                            {link.originalPrice && link.originalPrice !== link.price && (
                              <Text style={styles.originalPrice}>{formatPrice(link.originalPrice)}</Text>
                            )}
                          </View>
                        )}

                        {link.description && (
                          <Text style={styles.enhancedProductDescription} numberOfLines={2}>
                            {link.description}
                          </Text>
                        )}

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
        )}
      </View>

        {/* Visit Store link between Featured Products and Discussion */}
        {!isFullscreen && (
        <TouchableOpacity
          style={styles.storeLinkCard}
          onPress={() => {
            const storeUrl = playlistData?.userId ? `/store/user/${playlistData.userId}` : '/store/master';
            if (Platform.OS === 'web') {
              window.location.href = storeUrl;
            } else {
              router.push(storeUrl);
            }
          }}
          accessibilityRole="link"
          activeOpacity={0.8}
        >
          <MaterialIcons name="storefront" size={20} color="#3b82f6" />
          <Text style={styles.storeLinkText}>Visit Our Store</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#3b82f6" />
        </TouchableOpacity>
        )}

        {!isFullscreen && (
        <View style={styles.slideshowChatSection}>
          <PlaylistChat
            playlistId={playlistData?.id?.toString() || playlistId || ''}
            playlistName={playlistData?.name || playlistTitle || 'Playlist'}
          />
        </View>
        )}
      </ScrollView>
      
      {/* Fullscreen Exit Button Overlay */}
      {isFullscreen && showExitButton && (
        <TouchableOpacity 
          style={styles.exitButton}
          onPress={handleExitFullscreen}
          activeOpacity={0.8}
        >
          <Text style={styles.exitButtonText}>Exit</Text>
        </TouchableOpacity>
      )}
    </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
    slideshowContainer: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    slideshowHeader: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#f3f4f6',
        marginRight: 12,
    },
    slideshowTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        textAlign: 'center',
        flex: 1,
    },
    cartButton: {
        position: 'relative',
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#f3f4f6',
    },
    cartBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
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
        fontWeight: '600',
    },
    slideshowMainContent: {
        flexDirection: 'row',
        padding: 20,
        gap: 20,
        minHeight: 500, // Set minimum height for the main content
    },
    mobileMainContent: {
        flexDirection: 'column',
    },
    slideshowLeftPanel: {
        flex: 1.344, // Increased to give more space to video (44.8% of total)
        backgroundColor: '#000000',
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: 700, // Increased to accommodate larger video
    },
    mobileLeftPanel: {
        width: '100%',
        minHeight: 300,
    },
    slideshowRightPanel: {
        flex: 1.656, // Decreased by 20% from 2.07 to 1.656 (55.2% - 20% decrease for products)
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        minHeight: 500, // Set minimum height for the products panel
    },
    mobileRightPanel: {
        width: '100%',
    },
    featuredProductsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
      },
      featuredProductsTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1f2937',
        marginLeft: 8,
      },
      featuredProductsContent: {
        flex: 1,
      },
      productsListContent: {
        paddingBottom: 20,
      },
      noProductsContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
      },
      noProductsText: {
        color: '#6b7280',
        fontSize: 16,
        fontWeight: '500',
        marginTop: 12,
        textAlign: 'center',
      },
      enhancedProductCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
      productImageContainer: {
        position: 'relative',
        width: '100%',
        height: 200,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        overflow: 'hidden',
        borderRadius: 12,
      },
      enhancedProductImage: {
        width: '100%',
        height: '100%',
      },
      enhancedProductPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
      },
      imageNavButton: {
        position: 'absolute',
        top: '50%',
        transform: [{ translateY: -20 }],
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
        width: 40,
        height: 40,
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
        flexDirection: 'row',
        position: 'absolute',
        bottom: 10,
        alignSelf: 'center',
      },
      imageIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
        marginHorizontal: 4,
      },
      activeImageIndicator: {
        backgroundColor: 'white',
      },
      enhancedProductContent: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
      },
      enhancedProductTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: 8,
      },
      ratingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
      },
      starsContainer: {
        flexDirection: 'row',
        marginRight: 8,
      },
      ratingText: {
        fontSize: 14,
        color: '#f59e0b',
        fontWeight: '600',
      },
      reviewCount: {
        fontSize: 12,
        color: '#6b7280',
      },
      priceContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 8,
      },
      currentPrice: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
      },
      originalPrice: {
        fontSize: 14,
        color: '#6b7280',
        textDecorationLine: 'line-through',
        marginLeft: 8,
      },
      enhancedProductDescription: {
        fontSize: 14,
        color: '#4b5563',
        marginBottom: 16,
        lineHeight: 22,
      },
      productActionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
      },
      buyNowButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 15,
        gap: 5,
      },
      buyNowButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
      },
      addToCartButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 15,
        gap: 5,
      },
      addToCartButtonText: {
        color: '#3b82f6',
        fontSize: 14,
        fontWeight: '600',
      },
      slideshowChatSection: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        margin: 20,
        marginTop: 0,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        minHeight: 400, // Increased from maxHeight: 200 to minHeight: 400 for better visibility
      },
      chatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
      },
      chatTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
        marginLeft: 8,
        flex: 1,
      },
      chatBadge: {
        backgroundColor: '#3b82f6',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        minWidth: 24,
        alignItems: 'center',
      },
      chatBadgeText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
      },
      chatContent: {
        flex: 1,
      },
      chatEmptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
      },
      chatEmptyText: {
        color: '#6b7280',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
      },
      // Store link styles
      storeLinkCard: {
        marginHorizontal: 20,
        marginBottom: 12,
        backgroundColor: '#f0f9ff',
        borderWidth: 1,
        borderColor: '#bfdbfe',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      storeLinkText: {
        color: '#1d4ed8',
        fontSize: 16,
        fontWeight: '600',
      },
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    padding: 20,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 25 : 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'flex-start', // Changed from center to flex-start to avoid cropping
    alignItems: 'center',
    padding: 5, // Minimal padding to maximize video space
    minHeight: 550, // Adjusted to accommodate video + minimal padding
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 15,
  },
  controlButton: {
    padding: 10,
  },
  videoProgress: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  zoomButton: {
    padding: 4,
    marginHorizontal: 2,
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },

  errorText: {
    color: '#ff5555',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
  },
  infoText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  
  // Audio Player Styles
  audioPlayerContainer: {
    width: '100%',
    height: 500,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  audioVisualization: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  audioWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    height: 80,
  },
  waveformBar: {
    width: 4,
    marginHorizontal: 2,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
  },
  audioInfo: {
    alignItems: 'center',
  },
  audioTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  audioSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  currentTrackDisplay: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderRadius: 12,
    marginVertical: 12,
    alignItems: 'center',
  },
  currentTrackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  currentTrackInfo: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  quickPayOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 8,
    borderRadius: 12,
  },
  quickPayOverlayFullscreen: {
    marginVertical: 8,
    zIndex: 10,
  },
  quickPayScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  quickPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
    minWidth: 100,
    maxWidth: 180,
  },
  quickPayButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  quickPayPriceText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 12,
    fontWeight: '700',
  },
  
  // Fullscreen-specific styles
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'black',
  },
  fullscreenScrollContainer: {
    flex: 1,
  },
  fullscreenScrollContent: {
    flexGrow: 1,
  },
  fullscreenMainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 0,
    gap: 0,
    minHeight: '100%',
  },
  fullscreenLeftPanel: {
    flex: 1,
    backgroundColor: 'black',
    borderRadius: 0,
    minHeight: '100%',
  },
  fullscreenVideoContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    minHeight: '100%',
  },
  
  // Exit button styles
  exitButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 10000,
  },
  exitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Reconnecting overlay styles
  reconnectingOverlay: {
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
  reconnectingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  reconnectingSubtext: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  // Play overlay styles
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  playOverlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  playOverlayText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default PlaylistPlayer; 