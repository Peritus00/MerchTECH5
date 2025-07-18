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
  ActivityIndicator,
  Text,
  SafeAreaView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
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
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, 0.5 = zoomed out, 2 = zoomed in
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const videoRef = useRef<Video>(null);
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);

  const { addToCart } = useCart();

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
    try {
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = base;

      const items = [{ productId: productLink.id, quantity: 1 }];
      const { url } = await paymentAPI.createSession(items, successUrl, cancelUrl);

      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Buy now error:', error);
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
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
      
      if (response.data) {
        setPlaylistData(response.data);
        setMedia(response.data.mediaFiles || []);
        setPlaylistTitle(response.data.name || 'Playlist');
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

  const backgroundAudioUrl = useMemo(() => {
    return media.find((item) => item.media_type === 'audio' || item.fileType === 'audio' || item.type === 'audio')?.url || null;
  }, [media]);

  // Audio player lifecycle
  useEffect(() => {
    if (backgroundAudioUrl) {
      audioPlayerRef.current?.unload();

      const onEnded = () => {
        setIsPlaying(false);
      };

      audioPlayerRef.current = createAudioPlayer(
        backgroundAudioUrl,
        onEnded,
        {
          shouldPlay: isPlaying,
          isLooping: true,
        }
      );
    }

    return () => {
      audioPlayerRef.current?.unload();
    };
  }, [backgroundAudioUrl]);

  // Play/pause synchronization
  useEffect(() => {
    if (isPlaying) {
      audioPlayerRef.current?.play();
      videoRef.current?.playAsync();
    } else {
      audioPlayerRef.current?.pause();
      videoRef.current?.pauseAsync();
    }
  }, [isPlaying]);

  const goToNextVideo = useCallback(() => {
    if (currentIndex < media.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Loop back to first video
      setCurrentIndex(0);
    }
  }, [currentIndex, media.length]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      // Capture video dimensions when loaded
      if (status.naturalSize && !videoDimensions) {
        setVideoDimensions({
          width: status.naturalSize.width,
          height: status.naturalSize.height
        });
      }
      
      if (status.didJustFinish) {
        // Video finished, go to next video
        goToNextVideo();
      }
    }
  }, [goToNextVideo, videoDimensions]);

  // Reset video position, dimensions, zoom, and fullscreen when changing videos
  useEffect(() => {
    if (videoRef.current && media[currentIndex]?.media_type === 'video') {
      videoRef.current.setPositionAsync(0);
      setVideoDimensions(null); // Reset dimensions for new video
      setZoomLevel(1); // Reset zoom level for new video
      setIsFullscreen(false); // Reset fullscreen state for new video
    }
  }, [currentIndex]);

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      // Go to last video
      setCurrentIndex(media.length - 1);
    }
  };

  const handleNext = () => {
    goToNextVideo();
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 2)); // Max zoom 2x
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5)); // Min zoom 0.5x
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  const handleFullscreen = async () => {
    try {
      if (videoRef.current) {
        if (!isFullscreen) {
          // Enter fullscreen
          await videoRef.current.presentFullscreenPlayer();
        } else {
          // Exit fullscreen
          await videoRef.current.dismissFullscreenPlayer();
        }
      }
    } catch (error) {
      console.log('Fullscreen error:', error);
      // Fallback: toggle state manually if API fails
      setIsFullscreen(!isFullscreen);
    }
  };

  const renderCurrentMedia = () => {
    const currentItem = media[currentIndex];
    if (!currentItem) return null;
    
    // Enhanced media type detection
    const isVideo = currentItem.media_type === 'video' || 
                   currentItem.fileType === 'video' || 
                   currentItem.type === 'video' ||
                   currentItem.contentType?.startsWith('video/');
    
    const isAudio = currentItem.media_type === 'audio' || 
                   currentItem.fileType === 'audio' || 
                   currentItem.type === 'audio' ||
                   currentItem.contentType?.startsWith('audio/');
    
    const isImage = !isVideo && !isAudio; // Default to image if not video or audio
    
    const itemUri = currentItem.url || currentItem.s3_key || 'https://placehold.co/400x300?text=No+Media';

    console.log('🎵 MEDIA_DETECTION:', {
      title: currentItem.title,
      media_type: currentItem.media_type,
      fileType: currentItem.fileType,
      type: currentItem.type,
      contentType: currentItem.contentType,
      isVideo,
      isAudio,
      isImage
    });

    // Calculate dynamic video style based on actual video dimensions and zoom level
    const getVideoStyle = () => {
      if (videoDimensions) {
        // Use 80% of available container height to ensure video fits
        const baseHeight = 500; // Conservative height that should fit in most containers
        const videoAspectRatio = videoDimensions.width / videoDimensions.height;
        const baseWidth = (baseHeight * videoAspectRatio) * 1.25; // Widen by 25%
        
        // Apply zoom level
        const zoomedWidth = baseWidth * zoomLevel;
        const zoomedHeight = baseHeight * zoomLevel;
        
        return {
          width: zoomedWidth,
          height: zoomedHeight,
          alignSelf: 'center' as const,
          borderRadius: 8,
          transform: [{ scale: 1 }], // Keep scale at 1, we're changing dimensions instead
        };
      }
      // Fallback style while dimensions are loading
      return {
        width: '112.5%', // Increased from 90% by 25% (90% * 1.25 = 112.5%)
        height: 500 * zoomLevel,
        alignSelf: 'center' as const,
        borderRadius: 8,
        transform: [{ scale: 1 }],
      };
    };

    if (isVideo) {
      return (
        <Video
          ref={videoRef}
          source={{ uri: itemUri }}
          rate={1.0}
          volume={1.0}
          isMuted={isMuted}
          shouldPlay={isPlaying}
          isLooping={false} // Changed to false for sequential playback
          resizeMode={ResizeMode.CONTAIN}
          style={getVideoStyle()}
          useNativeControls={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onFullscreenUpdate={(status) => setIsFullscreen(status.fullscreenUpdate)}
        />
      );
    } else if (isAudio) {
      // Audio player interface
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
            
            <View style={styles.audioInfo}>
              <MaterialIcons name="music-note" size={48} color="#3b82f6" />
              <Text style={styles.audioTitle}>{currentItem.title}</Text>
              <Text style={styles.audioSubtitle}>Audio Track</Text>
            </View>
          </View>
          
          {/* Hidden audio element for playback */}
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
          />
        </View>
      );
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
    <View style={styles.slideshowContainer}>
      <View style={styles.slideshowHeader}>
        <Text style={styles.slideshowTitle}>{playlistTitle}</Text>
      </View>
      
      {/* Scrollable Main Content */}
      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.slideshowMainContent}>
        <View style={styles.slideshowLeftPanel}>
            <View style={styles.videoContainer}>
                {renderCurrentMedia()}
            </View>
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

        <View style={styles.slideshowRightPanel}>
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
      </View>

        <View style={styles.slideshowChatSection}>
          <PlaylistChat
            playlistId={playlistData?.id?.toString() || playlistId || ''}
            playlistName={playlistData?.name || playlistTitle || 'Playlist'}
          />
        </View>
      </ScrollView>
    </View>
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
    },
    slideshowTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        textAlign: 'center',
    },
    slideshowMainContent: {
        flexDirection: 'row',
        padding: 20,
        gap: 20,
        minHeight: 500, // Set minimum height for the main content
    },
    slideshowLeftPanel: {
        flex: 0.93, // Reduced from 1.2 to 0.93 (31% - give more space to products)
        backgroundColor: '#000000',
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: 700, // Increased to accommodate larger video
    },
    slideshowRightPanel: {
        flex: 2.07, // Increased from 1.8 to 2.07 (69% - 15% increase for products)
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
        width: '25%', // Reduced from 100% by 75% (100% - 75% = 25%)
        height: 200,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center', // Center the smaller image container
        marginBottom: 8,
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
});

export default PlaylistPlayer; 