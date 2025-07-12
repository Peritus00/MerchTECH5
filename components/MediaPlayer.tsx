import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MediaFile } from '@/shared/media-schema';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { chatAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { productLinksAPI, universalChatAPI, usersAPI } from '@/services/api';
import { Playlist } from '@/shared/playlist-schema';
import { Slideshow } from '@/shared/slideshow-schema';
import ChatFilters from '@/components/ChatFilters';

interface ProductLink {
  id: number;
  slideshow_id?: number;
  playlist_id?: number;
  product_id: number;
  title: string;
  url: string;
  description?: string;
  image_url?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // From JOIN with products table
  product_name: string;
  price: string; // Already formatted as "9.00"
  product_images?: string[];
}

interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

interface MediaPlayerProps {
  playlist?: Playlist;
  slideshow?: Slideshow;
  media?: MediaFile[];
  onTrackChange?: (trackIndex: number) => void;
  autoPlay?: boolean;
  showProductLinks?: boolean;
  showChat?: boolean;
}

export default function MediaPlayer({
  playlist,
  slideshow,
  media = [],
  onTrackChange,
  autoPlay = false,
  showProductLinks = true,
  showChat = true,
}: MediaPlayerProps) {
  
  // DEBUG: Log the props being passed to MediaPlayer
  console.log('🔴 MEDIA_PLAYER_COMPONENT: Props received:', {
    playlist: playlist ? { id: playlist.id, name: playlist.name } : null,
    slideshow: slideshow ? { id: slideshow.id, name: slideshow.name } : null,
    mediaCount: media.length,
    media: media,
    autoPlay,
    showProductLinks,
    showChat
  });

  const { user } = useAuth();
  const router = useRouter();
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [productLinks, setProductLinks] = useState<ProductLink[]>([]);
  const [loadingProductLinks, setLoadingProductLinks] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<NodeJS.Timeout | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  
  // New state to track the initial load and trigger auto-play on subsequent tracks
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Media owner information
  const [mediaOwner, setMediaOwner] = useState<{ id: number; username: string } | null>(null);
  
  // New state for universal chat filters
  const [chatFilter, setChatFilter] = useState<{
    filterType: 'all' | 'user_store' | 'category';
    userId?: string;
    category?: string;
    messageType?: 'general' | 'store_promotion' | 'product_showcase';
  }>({ filterType: 'all' });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  // Slideshow specific state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [slideshowInterval, setSlideshowInterval] = useState<NodeJS.Timeout | null>(null);
  const [backgroundAudioPlayer, setBackgroundAudioPlayer] = useState<any>(null);
  
  // Slideshow settings with default values
  const slideshowSettings = {
    autoplayInterval: slideshow?.autoplayInterval || 5000, // Use slideshow's interval or 5 seconds default
  };

  // Web audio state for fallback
  const [webAudioLoaded, setWebAudioLoaded] = useState(false);
  const [webAudioPlaying, setWebAudioPlaying] = useState(false);
  const [webAudioCurrentTime, setWebAudioCurrentTime] = useState(0);
  const [webAudioDuration, setWebAudioDuration] = useState(0);

  // Auto-hide controls after 3 seconds of inactivity
  const resetControlsTimeout = () => {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    setShowControls(true);
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);
    setControlsTimeout(timeout);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  }, []);

  const currentMediaFile = media[currentTrack];
  const contentId = playlist?.id || slideshow?.id;
  const contentName = playlist?.name || slideshow?.name;
  
  useEffect(() => {
    if (showProductLinks) {
      // For playlists, use the product links that are already included in the playlist data
      if (playlist && playlist.productLinks) {
        console.log('🔗 PRODUCT_LINKS: Using playlist product links:', playlist.productLinks);
        // Convert playlist product links to MediaPlayer format and filter out invalid products
        const convertedLinks = playlist.productLinks
          .filter(link => link.isActive && link.id) // Only include active links with valid product IDs
          .map(link => ({
            id: parseInt(link.linkId || link.id),
            product_id: parseInt(link.id),
            title: link.title,
            url: link.url,
            description: link.description,
            image_url: link.imageUrl,
            display_order: link.displayOrder,
            is_active: link.isActive,
            created_at: '',
            updated_at: '',
            product_name: link.productName || link.title, // Use productName if available, fallback to title
            price: link.price?.replace('$', '') || '0',
            product_images: link.images || []
          }));
        setProductLinks(convertedLinks);
        console.log('🔗 PRODUCT_LINKS: Converted playlist links:', convertedLinks);
      } else if (contentId) {
        // For slideshows and other content, fetch via API
        fetchProductLinks();
      }
    }
  }, [contentId, showProductLinks, playlist]);
  
  useEffect(() => {
    if (showChat) {
      fetchChatMessages();
    }
  }, [showChat, chatFilter]);
  
  useEffect(() => {
    if (onTrackChange) {
      onTrackChange(currentTrack);
    }
  }, [currentTrack, onTrackChange]);
  
  useEffect(() => {
    if (autoPlay && currentMediaFile) {
      handlePlay();
    }
  }, [autoPlay, currentMediaFile]);
  
  // Fetch media owner information
  useEffect(() => {
    const fetchMediaOwner = async () => {
      try {
        const ownerId = playlist?.userId || slideshow?.userId;
        if (ownerId) {
          console.log('🔴 MEDIA_PLAYER: Fetching owner info for user ID:', ownerId);
          const ownerInfo = await usersAPI.getUserInfo(String(ownerId));
          const username = ownerInfo.username || ownerInfo.user?.username || `User ${ownerId}`;
          setMediaOwner({ id: ownerId, username });
          console.log('🔴 MEDIA_PLAYER: Owner info loaded:', { id: ownerId, username });
        }
      } catch (error) {
        console.error('🔴 MEDIA_PLAYER: Error fetching owner info:', error);
        // Fallback to generic name
        const ownerId = playlist?.userId || slideshow?.userId;
        if (ownerId) {
          setMediaOwner({ id: ownerId, username: `User ${ownerId}` });
        }
      }
    };
    
    fetchMediaOwner();
  }, [playlist?.userId, slideshow?.userId]);
  
  const fetchProductLinks = async () => {
    if (!contentId) return;
    
    setLoadingProductLinks(true);
    try {
      console.log('🔗 PRODUCT_LINKS: Fetching for content ID:', contentId);
      console.log('🔗 PRODUCT_LINKS: Content type:', playlist ? 'playlist' : 'slideshow');
      
      let response;
      if (playlist) {
        response = await productLinksAPI.getByPlaylistId(contentId);
        console.log('🔗 PRODUCT_LINKS: Playlist response:', response);
        // Filter out inactive or invalid product links
        const validLinks = (response.productLinks || []).filter(link => 
          link.is_active && link.product_id && link.product_name
        );
        setProductLinks(validLinks);
      } else if (slideshow) {
        response = await productLinksAPI.getBySlideshowId(contentId);
        console.log('🔗 PRODUCT_LINKS: Slideshow response:', response);
        // Filter out inactive or invalid product links
        const validLinks = (response || []).filter(link => 
          link.is_active && link.product_id && link.product_name
        );
        setProductLinks(validLinks); // Slideshow API returns array directly
      }
      
      const linksCount = playlist ? (response?.productLinks?.length || 0) : (response?.length || 0);
      console.log('🔗 PRODUCT_LINKS: Loaded', linksCount, 'links');
      console.log('🔗 PRODUCT_LINKS: Product links data:', playlist ? (response?.productLinks || []) : (response || []));
    } catch (error) {
      console.error('🔗 PRODUCT_LINKS: Error fetching:', error);
      setProductLinks([]);
    } finally {
      setLoadingProductLinks(false);
    }
  };
  
  const fetchChatMessages = async () => {
    setLoadingChat(true);
    try {
      console.log('🌍 UNIVERSAL_CHAT: Fetching messages with filter:', chatFilter);
      const response = await universalChatAPI.getMessages({
        limit: 50,
        ...chatFilter
      });
      setChatMessages(response.messages || []);
      console.log('🌍 UNIVERSAL_CHAT: Loaded', response.messages?.length || 0, 'messages');
      
      // Scroll to bottom after loading messages
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('🌍 UNIVERSAL_CHAT: Error fetching messages:', error);
      setChatMessages([]);
    } finally {
      setLoadingChat(false);
    }
  };
  
  const sendChatMessage = async () => {
    if (!newMessage.trim() || !user) return;
    
    setSendingMessage(true);
    try {
      console.log('🌍 UNIVERSAL_CHAT: Sending message:', newMessage.trim());
      const response = await universalChatAPI.postMessage({
        message: newMessage.trim(),
        messageType: 'general'
      });
      
      // Add the new message to the chat
      setChatMessages(prev => [...prev, response.message]);
      setNewMessage('');
      
      // Scroll to bottom
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      console.log('🌍 UNIVERSAL_CHAT: Message sent successfully');
    } catch (error) {
      console.error('🌍 UNIVERSAL_CHAT: Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };
  
  const handleChatFilterChange = (newFilter: typeof chatFilter) => {
    console.log('🌍 UNIVERSAL_CHAT: Filter changed:', newFilter);
    setChatFilter(newFilter);
  };
  
  // Helper function to get media URL
  const getMediaUrl = (mediaFile: any) => {
    return mediaFile.url || mediaFile.fileUrl || mediaFile.src || '';
  };

  // Helper function to get slideshow audio URL with streaming support
  const getSlideshowAudioUrl = (audioUrl: string) => {
    if (!audioUrl) return '';
    
    // Use streaming endpoint for S3 audio URLs
    if (audioUrl.includes('amazonaws.com') && slideshow?.id) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001';
      return `${baseUrl}/api/slideshow-audio/${slideshow.id}/stream`;
    }
    
    return audioUrl;
  };

  // Determine media type
  const isVideo = currentMediaFile?.type === 'video' || currentMediaFile?.fileType === 'video' || currentMediaFile?.contentType?.startsWith('video/');
  const isAudio = currentMediaFile?.type === 'audio' || currentMediaFile?.fileType === 'audio' || currentMediaFile?.contentType?.startsWith('audio/');
  const isImage = currentMediaFile?.type === 'image' || currentMediaFile?.fileType === 'image' || currentMediaFile?.contentType?.startsWith('image/');
  const isSlideshow = media.length > 1 && media.every(file => 
    file.type === 'image' || file.fileType === 'image' || file.contentType?.startsWith('image/')
  );

  // Use appropriate audio player based on platform
  const audioPlayer = useAudioPlayer();
  const audioStatus = useAudioPlayerStatus(audioPlayer);

  // Use video player for video content
  const videoPlayer = useVideoPlayer(currentMediaFile && isVideo ? currentMediaFile.url : null, (player) => {
    player.loop = false;
    player.muted = false; // Mute by default, unmute when playing
  });

  // AUTO-ADVANCE FOR MOBILE: Watch the expo-audio status
  useEffect(() => {
    // didJustFinish is the key for seamless mobile playback
    if (Platform.OS !== 'web' && audioStatus.didJustFinish) {
      console.log('🔴 MEDIA_PLAYER (Mobile): Track finished, advancing.');
      handleNext();
    }
  }, [audioStatus.didJustFinish]);

  // Load track when current track changes
  useEffect(() => {
    if (currentMediaFile) {
      loadTrack(currentTrack);
    }
  }, [currentTrack, currentMediaFile]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollToEnd({ animated: true });
    }
  }, [chatMessages]);

  // Background audio setup for both playlists and slideshows
  useEffect(() => {
    const rawAudioUrl = playlist?.backgroundAudioUrl || slideshow?.audioUrl;
    
    console.log('🎵 BACKGROUND_AUDIO: Effect triggered with:', {
      hasPlaylist: !!playlist,
      hasSlideshow: !!slideshow,
      playlistBgAudio: playlist?.backgroundAudioUrl,
      slideshowAudio: slideshow?.audioUrl,
      rawAudioUrl,
      autoPlay
    });
    
    if (rawAudioUrl) {
      // Use the helper function to get the proper streaming URL for slideshows
      const audioUrl = slideshow?.audioUrl ? getSlideshowAudioUrl(rawAudioUrl) : rawAudioUrl;
      
      console.log('🎵 BACKGROUND_AUDIO: Setting up audio for', playlist ? 'playlist' : 'slideshow');
      console.log('🎵 BACKGROUND_AUDIO: Original URL:', rawAudioUrl);
      console.log('🎵 BACKGROUND_AUDIO: Streaming URL:', audioUrl);
      
      if (Platform.OS === 'web') {
        const audio = new Audio(audioUrl);
        audio.loop = true;
        audio.volume = 0.3; // Lower volume for background audio
        audioRef.current = audio;
        
        // Add event listeners for debugging
        audio.addEventListener('loadstart', () => {
          console.log('🎵 BACKGROUND_AUDIO: Load started');
        });
        
        audio.addEventListener('loadeddata', () => {
          console.log('🎵 BACKGROUND_AUDIO: Audio data loaded');
        });
        
        audio.addEventListener('error', (e) => {
          console.error('🎵 BACKGROUND_AUDIO: Audio error:', e);
        });
        
        if (autoPlay) {
          console.log('🎵 BACKGROUND_AUDIO: Auto-playing audio');
          audio.play().catch(error => {
            console.error('🎵 BACKGROUND_AUDIO: Auto-play failed:', error);
          });
        }
        
        return () => {
          console.log('🎵 BACKGROUND_AUDIO: Cleaning up web audio');
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
        };
      } else {
        // Mobile background audio setup
        const setupMobileBackgroundAudio = async () => {
          try {
            console.log('🎵 BACKGROUND_AUDIO: Setting up mobile audio');
            // Create a separate audio player for background music on mobile
            const bgAudio = useAudioPlayer();
            await bgAudio.replace(audioUrl);
            bgAudio.loop = true;
            setBackgroundAudioPlayer(bgAudio);
            
            if (autoPlay) {
              console.log('🎵 BACKGROUND_AUDIO: Auto-playing mobile audio');
              await bgAudio.play();
            }
          } catch (error) {
            console.error('🎵 BACKGROUND_AUDIO: Mobile background audio setup failed:', error);
          }
        };
        
        setupMobileBackgroundAudio();
        
        return () => {
          console.log('🎵 BACKGROUND_AUDIO: Cleaning up mobile audio');
          if (backgroundAudioPlayer) {
            backgroundAudioPlayer.pause();
            setBackgroundAudioPlayer(null);
          }
        };
      }
    } else {
      console.log('🎵 BACKGROUND_AUDIO: No audio URL found, skipping setup');
    }
  }, [playlist?.backgroundAudioUrl, slideshow?.audioUrl, autoPlay]);

  // Slideshow auto-advance - but only if not user paused
  useEffect(() => {
    if (isSlideshow && isPlaying && !userPaused && slideshowSettings?.autoplayInterval) {
      const interval = setInterval(() => {
        setCurrentImageIndex(prev => {
          const nextIndex = (prev + 1) % media.length;
          setCurrentTrack(nextIndex);
          return nextIndex;
        });
      }, slideshowSettings.autoplayInterval);
      
      setSlideshowInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      // Clear interval if paused
      if (slideshowInterval) {
        clearInterval(slideshowInterval);
        setSlideshowInterval(null);
      }
    }
  }, [isSlideshow, isPlaying, userPaused, slideshowSettings?.autoplayInterval, media.length]);

  // Auto-play setup - but don't auto-play if user manually paused
  useEffect(() => {
    if (autoPlay && currentMediaFile && !isPlaying && !userPaused) {
      const timer = setTimeout(() => {
        handlePlay();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, currentMediaFile, isPlaying, userPaused]);

  // Auto-hide controls for slideshow
  useEffect(() => {
    if (isSlideshow && isPlaying && !userPaused) {
      // Show controls initially
      setShowControls(true);
      setControlsVisible(true);
      
      // Hide controls after 3 seconds of inactivity
      const hideControls = () => {
        if (controlsTimeout) {
          clearTimeout(controlsTimeout);
        }
        const timeout = setTimeout(() => {
          setShowControls(false);
          setControlsVisible(false);
        }, 3000);
        setControlsTimeout(timeout);
      };
      
      hideControls();
      
      return () => {
        if (controlsTimeout) {
          clearTimeout(controlsTimeout);
        }
      };
    } else {
      // Always show controls when paused or not in slideshow
      setShowControls(true);
      setControlsVisible(true);
    }
  }, [isSlideshow, isPlaying, userPaused]);

  // Show controls on interaction
  const showControlsTemporarily = () => {
    setShowControls(true);
    setControlsVisible(true);
    
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    
    // Only auto-hide if slideshow is playing
    if (isSlideshow && isPlaying && !userPaused) {
      const timeout = setTimeout(() => {
        setShowControls(false);
        setControlsVisible(false);
      }, 3000);
      setControlsTimeout(timeout);
    }
  };

  // Fullscreen detection for web
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      document.addEventListener('MSFullscreenChange', handleFullscreenChange);
      
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      };
    }
  }, []);

  const loadTrack = async (trackIndex: number) => {
    const mediaFile = media[trackIndex];
    if (!mediaFile) return;

    console.log('🔴 MEDIA_PLAYER: Loading track:', mediaFile.title, 'Type:', mediaFile.type || mediaFile.fileType);
    
    setIsLoading(true);
    setError(null);

    // Determine if the track should auto-play after loading.
    // It should play if it's NOT the very first track loaded.
    const playAfterLoad = !isInitialLoad;
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }
      
      try {
        if (isVideo) {
        // Video is handled by videoPlayer hook
        setIsLoading(false);
        if (playAfterLoad) {
          videoPlayer.play();
        }
      } else if (isAudio) {
        if (Platform.OS === 'web') {
          // Web audio fallback
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
          }
          
          const audio = new Audio(getMediaUrl(mediaFile));
          audioRef.current = audio;
          
          audio.addEventListener('loadeddata', () => {
            setWebAudioLoaded(true);
            setWebAudioDuration(audio.duration);
            setIsLoading(false);
            if (playAfterLoad) {
              console.log('🔴 MEDIA_PLAYER (Web): Auto-playing subsequent track.');
              audio.play();
              setWebAudioPlaying(true);
            }
          });
          
          audio.addEventListener('timeupdate', () => {
            setWebAudioCurrentTime(audio.currentTime);
          });
          
          audio.addEventListener('ended', () => {
            setWebAudioPlaying(false);
            handleNext();
          });
          
          audio.addEventListener('error', (e) => {
            setError('Failed to load audio');
            setIsLoading(false);
          });
          
          audio.load();
        } else {
          // Mobile audio using expo-audio
          try {
            await audioPlayer.replace(getMediaUrl(mediaFile));
            setIsLoading(false);
            if (playAfterLoad) {
              console.log('🔴 MEDIA_PLAYER (Mobile): Auto-playing subsequent track.');
              await audioPlayer.play();
            }
      } catch (error) {
            setError('Failed to load audio');
            setIsLoading(false);
          }
        }
      } else if (isImage) {
        // Images load immediately
        setIsLoading(false);
        if (playAfterLoad) {
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error('Error loading track:', error);
      setError('Failed to load media');
      setIsLoading(false);
    }
  };

  const handlePlay = async () => {
    try {
      // Clear user paused flag when manually playing
      setUserPaused(false);
      
      if (isVideo && videoRef.current) {
        await videoRef.current.play();
        setIsPlaying(true);
      } else if (isAudio) {
        if (Platform.OS === 'web' && audioRef.current) {
          await audioRef.current.play();
          setWebAudioPlaying(true);
    } else {
          await audioPlayer.play();
        }
        setIsPlaying(true);
      } else if (isImage || isSlideshow) {
        setIsPlaying(true);
        
        // Also control background audio for slideshows
        const backgroundAudioUrl = playlist?.backgroundAudioUrl || slideshow?.audioUrl;
        if (isSlideshow && backgroundAudioUrl) {
          if (Platform.OS === 'web' && audioRef.current) {
            try {
              await audioRef.current.play();
              console.log('🎵 Background audio started with slideshow');
            } catch (audioError) {
              console.warn('Background audio play failed:', audioError);
            }
          } else if (backgroundAudioPlayer) {
            try {
              await backgroundAudioPlayer.play();
              console.log('🎵 Mobile background audio started with slideshow');
            } catch (audioError) {
              console.warn('Mobile background audio play failed:', audioError);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error playing media:', error);
      setError('Failed to play media');
    }
  };

  const handlePause = async () => {
    try {
      // Set user paused flag to prevent auto-restart
      setUserPaused(true);
      
      if (isVideo && videoRef.current) {
        videoRef.current.pause();
      } else if (isAudio) {
      if (Platform.OS === 'web' && audioRef.current) {
        audioRef.current.pause();
          setWebAudioPlaying(false);
        } else {
          await audioPlayer.pause();
        }
      } else if (isImage || isSlideshow) {
        // Also control background audio for slideshows
        const backgroundAudioUrl = playlist?.backgroundAudioUrl || slideshow?.audioUrl;
        if (isSlideshow && backgroundAudioUrl) {
          if (Platform.OS === 'web' && audioRef.current) {
            audioRef.current.pause();
            console.log('🎵 Background audio paused with slideshow');
          } else if (backgroundAudioPlayer) {
            backgroundAudioPlayer.pause();
            console.log('🎵 Mobile background audio paused with slideshow');
          }
        }
      }
      
      setIsPlaying(false);
      
    } catch (error) {
      console.error('Error pausing media:', error);
    }
  };

  const handleNext = () => {
    // Loop back to the beginning if at the end of the playlist
    const nextTrack = (currentTrack + 1) % media.length;
    console.log(`🔴 MEDIA_PLAYER: Advancing to next track ${nextTrack}`);
    setCurrentTrack(nextTrack);
    // Reset user paused flag when manually changing tracks
    setUserPaused(false);
  };

  const handlePrevious = () => {
    // Loop to the end if at the beginning of the playlist
    const prevTrack = (currentTrack - 1 + media.length) % media.length;
    console.log(`🔴 MEDIA_PLAYER: Going to previous track ${prevTrack}`);
    setCurrentTrack(prevTrack);
    // Reset user paused flag when manually changing tracks
    setUserPaused(false);
  };

  const handleSeek = (value: number) => {
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = value;
    } else if (isAudio) {
      if (Platform.OS === 'web' && audioRef.current) {
        audioRef.current.currentTime = value;
      } else {
        audioPlayer.seekTo(value * 1000); // Convert to milliseconds
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatChatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleProductLinkPress = (link: ProductLink) => {
    if (Platform.OS === 'web') {
      window.open(link.url, '_blank');
    }
  };

  const handleAddToCart = (link: ProductLink) => {
    console.log('🛒 ADD_TO_CART: Adding product to cart:', link.product_name);
    // Navigate to the product page to add to cart
    if (Platform.OS === 'web') {
      window.open(link.url, '_blank');
    } else {
      // For mobile, navigate to the product page
      router.push(`/store/product/${link.product_id}`);
    }
  };

  const handleLoginPress = () => {
    // Navigate to login screen or show login modal
    console.log('Login pressed');
  };

  const handleUsernamePress = (userId: number) => {
    console.log('🔗 USERNAME CLICK: Attempting to navigate to user store:', userId);
    console.log('🔗 USERNAME CLICK: Current platform:', Platform.OS);
    
    if (Platform.OS === 'web') {
      const storeUrl = `/store/user/${userId}`;
      console.log('🔗 USERNAME CLICK: Constructed store URL:', storeUrl);
      
      // Try using router.push first
      try {
        console.log('🔗 USERNAME CLICK: Using router.push to navigate');
        router.push(storeUrl);
      } catch (error) {
        console.error('🔗 USERNAME CLICK: router.push failed:', error);
        // Fallback to window.open
        console.log('🔗 USERNAME CLICK: Falling back to window.open');
        window.open(storeUrl, '_blank');
      }
    } else {
      // Mobile navigation
      router.push(`/store/user/${userId}`);
    }
  };

  const renderChatMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.messageContainer,
      item.userId === user?.id ? styles.ownMessage : styles.otherMessage
    ]}>
      <View style={styles.messageHeader}>
        <TouchableOpacity 
          onPress={() => handleUsernamePress(item.userId)}
          style={styles.usernameContainer}
        >
          <Text style={[
            styles.messageUsername,
            item.userId === user?.id ? styles.ownUsername : styles.otherUsername
          ]}>
            {item.username}
          </Text>
          {item.userId !== user?.id && (
            <Ionicons 
              name="storefront-outline" 
              size={12} 
              color="#666" 
              style={styles.storeIcon}
            />
          )}
        </TouchableOpacity>
        <Text style={styles.messageTime}>
          {formatChatTime(item.createdAt)}
        </Text>
      </View>
      <Text style={[
        styles.messageText,
        item.userId === user?.id ? styles.ownMessageText : styles.otherMessageText
      ]}>
        {item.message}
      </Text>
    </View>
  );

  const renderStars = (rating: number = 0) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={12}
          color="#FFD700"
        />
      );
    }
    return stars;
  };

  // Render media content based on type
  const renderMediaContent = () => {
    if (!currentMediaFile) {
    return (
        <View style={styles.mediaPlaceholder}>
          <Text style={styles.placeholderText}>No media to display</Text>
      </View>
    );
  }

    if (isVideo) {
      return renderVideoContent();
    } else if (isAudio) {
      return renderAudioContent();
    } else if (isImage || isSlideshow) {
      return renderImageContent();
    }

  return (
      <View style={styles.mediaPlaceholder}>
        <Text style={styles.placeholderText}>Unsupported media type</Text>
                </View>
    );
  };
  
  const toggleFullscreen = () => {
    if (Platform.OS === 'web') {
      if (!document.fullscreenElement) {
        const element = isVideo ? videoRef.current : document.documentElement;
        element.requestFullscreen?.() || 
        element.webkitRequestFullscreen?.() || 
        element.mozRequestFullScreen?.() || 
        element.msRequestFullscreen?.();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen?.() || 
        document.webkitExitFullscreen?.() || 
        document.mozCancelFullScreen?.() || 
        document.msExitFullscreen?.();
        setIsFullscreen(false);
      }
    } else {
      // For mobile, just toggle the fullscreen state for UI changes
      setIsFullscreen(!isFullscreen);
    }
  };

  const renderVideoContent = () => {
    if (Platform.OS !== 'web') {
      return (
            <View style={styles.videoContainer}>
              <VideoView
                style={styles.video}
                player={videoPlayer}
            allowsFullscreen={true}
            allowsPictureInPicture={true}
            contentFit="contain"
          />
          
          {/* Custom fullscreen button for mobile */}
          <TouchableOpacity 
            style={styles.fullscreenButton}
            onPress={() => {
              // VideoView handles fullscreen automatically on mobile
              setIsFullscreen(!isFullscreen);
            }}
          >
            <Ionicons 
              name={isFullscreen ? "contract" : "expand"} 
              size={24} 
              color="#fff" 
            />
          </TouchableOpacity>
            </View>
      );
    }

    const videoUrl = getMediaUrl(currentMediaFile);
    
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <video
          ref={videoRef}
          key={currentMediaFile.id}
          src={videoUrl}
          controls
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'contain', 
            backgroundColor: '#000',
            borderRadius: isFullscreen ? '0px' : '8px'
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedData={() => {
            setIsLoading(false);
            if (videoRef.current) {
              setDuration(videoRef.current.duration);
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setPosition(videoRef.current.currentTime);
            }
          }}
          onError={(e) => {
            setIsLoading(false);
            setError(`This video could not be played. (Code: ${e.currentTarget.error?.code})`);
            console.error('Video Player Error:', e.currentTarget.error);
          }}
          onWaiting={() => setIsLoading(true)}
          onCanPlay={() => setIsLoading(false)}
        />
        
        {/* Custom Fullscreen Button for Web */}
        <button
          onClick={toggleFullscreen}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: '6px',
            padding: '8px',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '16px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isFullscreen ? '⤓' : '⤢'}
        </button>
        
        {/* Loading Overlay */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: isFullscreen ? '0px' : '8px'
          }}>
            <ActivityIndicator size="large" color="#fff" />
          </div>
        )}
        
        {/* Error Overlay */}
        {error && !isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            borderRadius: isFullscreen ? '0px' : '8px'
          }}>
            <Ionicons name="alert-circle-outline" size={48} color="#fff" />
            <Text style={styles.errorText}>{error}</Text>
          </div>
        )}
      </div>
    );
  };

  const renderAudioContent = () => {
    const currentDuration = Platform.OS === 'web' ? webAudioDuration : (audioStatus.duration || 0) / 1000;
    const currentPosition = Platform.OS === 'web' ? webAudioCurrentTime : (audioStatus.currentTime || 0) / 1000;
    const playerIsPlaying = Platform.OS === 'web' ? webAudioPlaying : audioStatus.playing;

    return (
      <View style={styles.audioContainer}>
        {/* Fullscreen Button for Audio */}
        <TouchableOpacity 
          style={styles.audioFullscreenButton}
          onPress={toggleFullscreen}
        >
          <Ionicons 
            name={isFullscreen ? "contract" : "expand"} 
            size={24} 
            color="#fff" 
          />
        </TouchableOpacity>

        <View style={[styles.audioArtwork, isFullscreen && styles.audioArtworkFullscreen]}>
          <Ionicons name="musical-notes" size={isFullscreen ? 120 : 80} color="#666" />
          </View>

        <View style={styles.audioInfo}>
          <Text style={[styles.audioTitle, isFullscreen && styles.audioTitleFullscreen]}>{currentMediaFile.title}</Text>
          <Text style={[styles.audioArtist, isFullscreen && styles.audioArtistFullscreen]}>Track {currentTrack + 1} of {media.length}</Text>
        </View>
        
        <View style={[styles.audioControls, isFullscreen && styles.audioControlsFullscreen]}>
          <View style={styles.progressContainer}>
            <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>
            {Platform.OS === 'web' ? (
              <input
                type="range"
                min={0}
                max={currentDuration}
                value={currentPosition}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                style={{
                  flex: 1,
                  margin: '0 10px',
                  height: isFullscreen ? '8px' : '6px',
                  borderRadius: isFullscreen ? '4px' : '3px',
                  background: `linear-gradient(to right, #007AFF 0%, #007AFF ${(currentPosition / currentDuration) * 100}%, #ccc ${(currentPosition / currentDuration) * 100}%, #ccc 100%)`,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
            ) : (
              <View style={[styles.progressSlider, isFullscreen && styles.progressSliderFullscreen]}>
                <View style={[styles.progressTrack, { width: `${(currentPosition / currentDuration) * 100}%` }]} />
            </View>
            )}
            <Text style={styles.timeText}>{formatTime(currentDuration)}</Text>
          </View>

          <View style={styles.controlButtons}>
            <TouchableOpacity
              style={[styles.controlButton, isFullscreen && styles.controlButtonFullscreen]}
              onPress={handlePrevious}
            >
              <Ionicons name="play-skip-back" size={isFullscreen ? 32 : 24} color={"#007AFF"} />
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.playButton, isFullscreen && styles.playButtonFullscreen]} onPress={playerIsPlaying ? handlePause : handlePlay}>
              <Ionicons 
                name={playerIsPlaying ? "pause" : "play"} 
                size={isFullscreen ? 48 : 32} 
                color="#fff" 
              />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.controlButton, isFullscreen && styles.controlButtonFullscreen]}
              onPress={handleNext}
            >
              <Ionicons name="play-skip-forward" size={isFullscreen ? 32 : 24} color={"#007AFF"} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderImageContent = () => {
    // On web, controls are visible if paused or hovered. On mobile, use existing state.
    const finalControlsVisible = Platform.OS === 'web' ? (isHovering || !isPlaying) : controlsVisible;

    return (
      <View 
        style={[styles.imageContainer, isFullscreen && styles.imageContainerFullscreen]}
        onMouseEnter={Platform.OS === 'web' ? () => setIsHovering(true) : undefined}
        onMouseLeave={Platform.OS === 'web' ? () => setIsHovering(false) : undefined}
        onTouchStart={Platform.OS !== 'web' ? showControlsTemporarily : undefined}
      >
        {/* Fullscreen Button for Images/Slideshows */}
            <TouchableOpacity
              style={[
            styles.imageFullscreenButton,
            !finalControlsVisible && styles.hiddenControl
          ]}
          onPress={() => {
            showControlsTemporarily();
            toggleFullscreen();
          }}
        >
                <Ionicons
            name={isFullscreen ? "contract" : "expand"} 
            size={24} 
                  color="#fff"
                />
            </TouchableOpacity>

        <Image
          source={{ uri: currentMediaFile.url }}
          style={[styles.image, isFullscreen && styles.imageFullscreen]}
          resizeMode="contain"
        />
        
        {isSlideshow && (
          <View style={[
            styles.slideshowControls, 
            isFullscreen && styles.slideshowControlsFullscreen,
            !finalControlsVisible && styles.hiddenControls
          ]}>
            <TouchableOpacity
              style={[styles.controlButton, isFullscreen && styles.controlButtonFullscreen]}
              onPress={() => {
                showControlsTemporarily();
                handlePrevious();
              }}
            >
              <Ionicons name="chevron-back" size={isFullscreen ? 32 : 24} color={"#007AFF"} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.playButton, isFullscreen && styles.playButtonFullscreen]} 
              onPress={() => {
                showControlsTemporarily();
                isPlaying ? handlePause() : handlePlay();
              }}
            >
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={isFullscreen ? 48 : 32} 
                color="#fff" 
              />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.controlButton, isFullscreen && styles.controlButtonFullscreen]}
              onPress={() => {
                showControlsTemporarily();
                handleNext();
              }}
            >
              <Ionicons name="chevron-forward" size={isFullscreen ? 32 : 24} color={"#007AFF"} />
            </TouchableOpacity>
          </View>
        )}
        
        <View style={[
          styles.imageInfo, 
          isFullscreen && styles.imageInfoFullscreen,
          !finalControlsVisible && styles.hiddenInfo
        ]}>
          <Text style={[styles.imageTitle, isFullscreen && styles.imageTitleFullscreen]}>{currentMediaFile.title}</Text>
          <Text style={[styles.imageCounter, isFullscreen && styles.imageCounterFullscreen]}>
            {currentTrack + 1} of {media.length}
          </Text>
              </View>
            </View>
    );
  };
  
  if (!currentMediaFile) {
    return (
      <View style={styles.container}>
        <Text style={styles.noMediaText}>No media files to play.</Text>
          </View>
    );
  }

  const content = (
    <>
      {/* Two-panel layout for web, single column for mobile */}
      {Platform.OS === 'web' ? (
        <View style={styles.webMainContent}>
          {/* Left Panel - Media Player and Chat */}
          <View style={styles.leftPanel}>
            {/* Media Section */}
            <View style={styles.mediaSection}>
              <View style={styles.mediaContainer}>
                {renderMediaContent()}
              </View>
              
              {/* Track Info */}
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle}>
                  {currentMediaFile.title || 'Untitled'}
                </Text>
                <Text style={styles.trackCount}>
                  {currentTrack + 1} of {media.length}
                </Text>
              </View>
            </View>

            {/* Chat Section */}
            <View style={styles.chatSection}>
              <View style={styles.chatHeader}>
                <Ionicons name="chatbubbles" size={20} color="#007AFF" />
                <Text style={styles.chatTitle}>Live Chat</Text>
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chatMessages.length}</Text>
                </View>
              </View>

              {/* Chat Filters */}
              <ChatFilters
                currentFilter={chatFilter}
                onFilterChange={handleChatFilterChange}
                currentUserId={mediaOwner?.id}
                currentUsername={mediaOwner?.username}
              />

              <View style={styles.chatMessages}>
                {loadingChat ? (
                  <View style={styles.chatLoadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.chatLoadingText}>Loading messages...</Text>
                  </View>
                ) : (
                  <FlatList
                    ref={chatScrollRef}
                    data={chatMessages}
                    renderItem={renderChatMessage}
                    keyExtractor={(item) => item.id.toString()}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.chatMessagesList}
                    ListEmptyComponent={
                      <View style={styles.chatEmptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
                        <Text style={styles.chatEmptyText}>
                          {user ? 
                            "No messages yet. Be the first to share your thoughts!" :
                            "Join the conversation! Log in to see and post messages."
                          }
                        </Text>
                      </View>
                    }
                  />
                )}
              </View>
              
              <View style={styles.chatInputWrapper}>
                {user ? (
                  <>
                    <Text style={styles.chatInputLabel}>💬 Write a message:</Text>
                    <View style={styles.chatInputContainer}>
                      <TextInput
                        style={styles.messageInput}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Type your message..."
                        placeholderTextColor="#999"
                        multiline
                        maxLength={1000}
                        onSubmitEditing={sendChatMessage}
                        returnKeyType="send"
                        editable={true}
                      />
                      <TouchableOpacity
                        style={[
                          styles.sendButton,
                          (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled
                        ]}
                        onPress={sendChatMessage}
                        disabled={!newMessage.trim() || sendingMessage}
                      >
                        {sendingMessage ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name="send"
                            size={20}
                            color="#fff"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.chatInputFooter}>
                      <Text style={styles.chatInputHint}>
                        {newMessage.length}/1000 characters
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.chatAuthPrompt}>
                    <Text style={styles.chatAuthText}>Please log in to join the conversation.</Text>
                    <TouchableOpacity style={styles.chatAuthButton} onPress={handleLoginPress}>
                      <Text style={styles.chatAuthButtonText}>Log In</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Right Panel - Featured Products (Advertisement Section) */}
          <View style={styles.rightPanel}>
            <View style={styles.productsSection}>
              <View style={styles.productsHeader}>
                <Ionicons name="storefront" size={20} color="#007AFF" />
                <Text style={styles.productsTitle}>Featured Products</Text>
              </View>
              
              <View style={styles.productsContent}>
                {loadingProductLinks ? (
                  <View style={styles.chatLoadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.chatLoadingText}>Loading products...</Text>
                  </View>
                ) : (
                  productLinks.length > 0 ? (
                    productLinks.map((link) => (
                      <TouchableOpacity
                        key={link.id}
                        style={styles.productCard}
                        onPress={() => handleProductLinkPress(link)}
                      >
                        {(link.image_url || (link.product_images && link.product_images.length > 0)) && (
                          <View style={styles.productImageContainer}>
                            <Image
                              source={{ uri: link.image_url || link.product_images?.[0] }}
                              style={styles.productImage}
                              resizeMode="cover"
                            />
                          </View>
                        )}
                        
                        <View style={styles.productInfo}>
                          <Text style={styles.productTitle} numberOfLines={2}>
                            {link.product_name}
                          </Text>
                          
                          {link.description && (
                            <Text style={styles.productDescription} numberOfLines={3}>
                              {link.description}
                            </Text>
                          )}

                          <View style={styles.productFooter}>
                            {link.price && (
                              <View style={styles.priceContainer}>
                                <Text style={styles.price}>${link.price}</Text>
                              </View>
                            )}
                          </View>

                          {/* Product Action Buttons */}
                          <View style={styles.productActions}>
                            <TouchableOpacity
                              style={styles.buyNowButton}
                              onPress={() => handleProductLinkPress(link)}
                            >
                              <Text style={styles.buyNowButtonText}>Buy Now</Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                              style={styles.addToCartButton}
                              onPress={() => handleAddToCart(link)}
                            >
                              <Ionicons name="cart-outline" size={16} color="#007AFF" />
                              <Text style={styles.addToCartButtonText}>Add to Cart</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.noProductsContainer}>
                      <Ionicons name="storefront-outline" size={48} color="#ccc" />
                      <Text style={styles.noProductsTitle}>Featured Products</Text>
                      <Text style={styles.noProductsText}>
                        Products related to this content will appear here
                      </Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>
        </View>
      ) : (
        // Mobile layout - single column
        <>
          {/* Media Section */}
          <View style={styles.mediaSection}>
            <View style={styles.mediaContainer}>
              {renderMediaContent()}
            </View>
            
            {/* Track Info */}
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle}>
                {currentMediaFile.title || 'Untitled'}
              </Text>
              <Text style={styles.trackCount}>
                {currentTrack + 1} of {media.length}
              </Text>
            </View>
          </View>

          {/* Chat Section */}
          <View style={styles.chatSection}>
            <View style={styles.chatHeader}>
              <Ionicons name="chatbubbles" size={20} color="#007AFF" />
              <Text style={styles.chatTitle}>Live Chat</Text>
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{chatMessages.length}</Text>
              </View>
            </View>

            {/* Chat Filters */}
            <ChatFilters
              currentFilter={chatFilter}
              onFilterChange={handleChatFilterChange}
              currentUserId={mediaOwner?.id}
              currentUsername={mediaOwner?.username}
            />

            <View style={styles.chatMessages}>
              {loadingChat ? (
                <View style={styles.chatLoadingContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.chatLoadingText}>Loading messages...</Text>
                </View>
              ) : (
                <FlatList
                  ref={chatScrollRef}
                  data={chatMessages}
                  renderItem={renderChatMessage}
                  keyExtractor={(item) => item.id.toString()}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.chatMessagesList}
                  ListEmptyComponent={
                    <View style={styles.chatEmptyContainer}>
                      <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
                      <Text style={styles.chatEmptyText}>
                        {user ? 
                          "No messages yet. Be the first to share your thoughts!" :
                          "Join the conversation! Log in to see and post messages."
                        }
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
            
            <View style={styles.chatInputWrapper}>
              {user ? (
                <>
                  <Text style={styles.chatInputLabel}>💬 Write a message:</Text>
                  <View style={styles.chatInputContainer}>
                    <TextInput
                      style={styles.messageInput}
                      value={newMessage}
                      onChangeText={setNewMessage}
                      placeholder="Type your message..."
                      placeholderTextColor="#999"
                      multiline
                      maxLength={1000}
                      onSubmitEditing={sendChatMessage}
                      returnKeyType="send"
                      editable={true}
                    />
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled
                      ]}
                      onPress={sendChatMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                    >
                      {sendingMessage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="send"
                          size={20}
                          color="#fff"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chatInputFooter}>
                    <Text style={styles.chatInputHint}>
                      {newMessage.length}/1000 characters
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.chatAuthPrompt}>
                  <Text style={styles.chatAuthText}>Please log in to join the conversation.</Text>
                  <TouchableOpacity style={styles.chatAuthButton} onPress={handleLoginPress}>
                    <Text style={styles.chatAuthButtonText}>Log In</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Products Section */}
          <View style={styles.productsSection}>
            <View style={styles.productsHeader}>
              <Ionicons name="storefront" size={20} color="#007AFF" />
              <Text style={styles.productsTitle}>Featured Products</Text>
            </View>
            
            <View style={styles.productsContent}>
              {loadingProductLinks ? (
                <View style={styles.chatLoadingContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.chatLoadingText}>Loading products...</Text>
                </View>
              ) : (
                productLinks.length > 0 ? (
                  productLinks.map((link) => (
                    <TouchableOpacity
                      key={link.id}
                      style={styles.productCard}
                      onPress={() => handleProductLinkPress(link)}
                    >
                      {(link.image_url || (link.product_images && link.product_images.length > 0)) && (
                        <View style={styles.productImageContainer}>
                          <Image
                            source={{ uri: link.image_url || link.product_images?.[0] }}
                            style={styles.productImage}
                            resizeMode="cover"
                          />
                        </View>
                      )}
                      
                      <View style={styles.productInfo}>
                        <Text style={styles.productTitle} numberOfLines={2}>
                          {link.product_name}
                        </Text>
                        
                        {link.description && (
                          <Text style={styles.productDescription} numberOfLines={3}>
                            {link.description}
                          </Text>
                        )}

                        <View style={styles.productFooter}>
                          {link.price && (
                            <View style={styles.priceContainer}>
                              <Text style={styles.price}>${link.price}</Text>
                            </View>
                          )}
                        </View>

                        {/* Product Action Buttons */}
                        <View style={styles.productActions}>
                          <TouchableOpacity
                            style={styles.buyNowButton}
                            onPress={() => handleProductLinkPress(link)}
                          >
                            <Text style={styles.buyNowButtonText}>Buy Now</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={styles.addToCartButton}
                            onPress={() => handleAddToCart(link)}
                          >
                            <Ionicons name="cart-outline" size={16} color="#007AFF" />
                            <Text style={styles.addToCartButtonText}>Add to Cart</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.noProductsContainer}>
                    <Ionicons name="storefront-outline" size={48} color="#ccc" />
                    <Text style={styles.noProductsTitle}>Featured Products</Text>
                    <Text style={styles.noProductsText}>
                      Products related to this content will appear here
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        </>
      )}
    </>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.webContainer}>{content}</View>;
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Platform-specific container styles
  webContainer: {
    ...(Platform.OS === 'web' && {
      height: '100vh',
      overflowY: 'auto',
    }),
    backgroundColor: '#f5f5f5',
    paddingBottom: 40, // Add bottom padding to prevent content from sitting at the very bottom
  },
  container: {
    flex: 1, // Native container
    backgroundColor: '#f5f5f5',
  },

  // Shared content layout styles
  contentContainer: {
    flexDirection: 'column',
    padding: 20,
    gap: 20,
    flexGrow: 1, // This is crucial for native scrolling
  },
  mediaSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
    padding: 20,
    minHeight: 300,
    marginBottom: 20,
  },
  mediaContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 400,
  },
  mediaPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
  },
  fullscreenButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 8,
    zIndex: 10,
  },
  audioFullscreenButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 8,
    zIndex: 10,
  },
  audioArtworkFullscreen: {
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  audioTitleFullscreen: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  audioArtistFullscreen: {
    fontSize: 20,
  },
  audioControlsFullscreen: {
    width: '100%',
    maxWidth: 600,
  },
  progressSliderFullscreen: {
    height: 8,
  },
  controlButtonFullscreen: {
    padding: 16,
    marginHorizontal: 20,
  },
  playButtonFullscreen: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginHorizontal: 32,
  },
  imageFullscreenButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 8,
    zIndex: 10,
    transition: Platform.OS === 'web' ? 'opacity 0.3s ease-in-out' : undefined,
  },
  imageContainerFullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  imageFullscreen: {
    width: '100%',
    height: '100%',
  },
  slideshowControlsFullscreen: {
    paddingVertical: 30,
  },
  imageInfoFullscreen: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    padding: 15,
  },
  imageTitleFullscreen: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  imageCounterFullscreen: {
    fontSize: 18,
    color: '#ccc',
  },
  hiddenControls: {
    opacity: 0,
    pointerEvents: 'none',
  },
  hiddenControl: {
    opacity: 0,
    pointerEvents: 'none',
  },
  hiddenInfo: {
    opacity: 0,
  },
  placeholderText: {
    color: '#666',
    textAlign: 'center',
  },
  audioContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  audioArtwork: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  audioInfo: {
    alignItems: 'center',
    marginBottom: 30,
  },
  audioTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 5,
  },
  audioArtist: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  audioControls: {
    width: '100%',
    maxWidth: 400,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressSlider: {
    flex: 1,
    height: 6,
    backgroundColor: '#ccc',
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  progressTrack: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },

  timeText: {
    color: '#ccc',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
  },
  controlButton: {
    padding: 10,
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  playButton: {
    backgroundColor: '#007AFF',
    borderRadius: 30,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  slideshowControls: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    transition: Platform.OS === 'web' ? 'opacity 0.3s ease-in-out' : undefined,
    gap: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 10,
    marginHorizontal: 20,
    borderRadius: 20,
  },
  imageInfo: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
  },
  imageTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  imageCounter: {
    color: '#ccc',
    fontSize: 12,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 20,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  trackCount: {
    fontSize: 14,
    color: '#666',
  },
  chatSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
    flexBasis: 550, // Increased from 450 to accommodate expanded filters
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  chatBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  chatBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatMessages: {
    flex: 1, // Allow this to grow to fill chatSection
    backgroundColor: '#fff',
  },
  chatMessagesList: {
    padding: 10,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    // Web-specific styles
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  messageUsername: {
    fontSize: 12,
    fontWeight: 'bold',
    // Web-specific styles for clickable usernames
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
    }),
  },
  ownUsername: {
    color: '#007AFF',
    textAlign: 'right',
  },
  otherUsername: {
    color: '#666',
    // Web-specific hover effect
    ...(Platform.OS === 'web' && {
      ':hover': {
        color: '#007AFF',
      },
    }),
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
    padding: 10,
    borderRadius: 12,
  },
  ownMessageText: {
    backgroundColor: '#007AFF',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  otherMessageText: {
    backgroundColor: '#f0f0f0',
    color: '#333',
    borderBottomLeftRadius: 4,
  },
  chatInputWrapper: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f9f9f9',
    padding: 15,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20, // Increased bottom padding
    marginBottom: 20, // Add margin to prevent sitting at bottom
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 14,
    // Web-specific styles
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      resize: 'none',
    }),
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    // Web-specific styles
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  sendButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
    // Web-specific styles
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  productsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  productsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  productsContent: {
    padding: 20,
  },
  productCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  productImageContainer: {
    height: 120,
    backgroundColor: '#e9e9e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  productImagePlaceholder: {
    fontSize: 24,
    color: '#999',
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
    lineHeight: 16,
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  originalPrice: {
    color: '#999',
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginLeft: 5,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stars: {
    flexDirection: 'row',
  },
  reviewCount: {
    color: '#666',
    fontSize: 12,
    marginLeft: 5,
  },
  noProductsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  noProductsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    textAlign: 'center',
  },
  noProductsText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
  },
  noMediaText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    margin: 20,
  },
  // Chat loading and empty state styles
  chatLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  chatLoadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  chatEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  chatEmptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  // Chat authentication prompt styles
  chatAuthPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  chatAuthText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  chatAuthButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chatAuthButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Chat input footer styles
  chatInputFooter: {
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  chatInputHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  chatInputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    fontWeight: 'bold',
  },
  // Debug styles (can be removed)
  debugText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  chatInputDebug: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  // New styles for two-panel layout
  webMainContent: {
    flexDirection: 'row',
    minHeight: '100vh', // Ensure minimum full viewport height
    gap: 0,
  },
  leftPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: 20,
    paddingBottom: 40, // Extra bottom padding for the left panel
    gap: 20,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  rightPanel: {
    width: 350, // Fixed width for the right panel
    backgroundColor: '#f5f5f5',
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
    padding: 20,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
    }),
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeIcon: {
    marginLeft: 4,
    opacity: 0.7,
  },
  // Product action button styles
  productActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  addToCartButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
}); 