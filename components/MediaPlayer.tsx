import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
  Ionicons,
} from '@expo/vector-icons';
import Swiper from 'react-native-swiper';
import { Video, ResizeMode } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import createAudioPlayer, {
  IAudioPlayer,
} from '../services/audio/AudioService';
import { MediaFile, ProductLink } from '../shared/media-schema';
import { api, paymentAPI } from '../services/api';
import { useCart } from '../contexts/CartContext';
import * as WebBrowser from 'expo-web-browser';

const { width } = Dimensions.get('window');

// Define the media item interface for MediaPlayer
interface MediaItem {
  id: string | number;
  title?: string;
  s3_key: string;
  url?: string; // Add url property for slideshow images
  media_type: 'image' | 'audio' | 'video';
  type?: string;
  fileType?: string;
  contentType?: string;
  caption?: string;
  displayOrder?: number;
}

interface MediaPlayerProps {
  mediaId?: string;
  type?: string;
  media?: any[];
  playlist?: any;
  slideshow?: any;
  autoPlay?: boolean;
}

const MediaPlayer = ({ mediaId, type, media: externalMedia, playlist, slideshow, autoPlay = false }: MediaPlayerProps) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<Video>(null);
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);
  
  // Slideshow-specific state
  const slideshowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [productImageIndexes, setProductImageIndexes] = useState<Record<string, number>>({});

  // Cart functionality
  const { addToCart, getTotalItems } = useCart();

  // Product handling functions
  const handleAddToCart = (productLink: ProductLink) => {
    try {
      // Convert ProductLink to Product format for cart
      const product = {
        id: productLink.id.toString(),
        name: productLink.title,
        description: productLink.description || '',
        price: parseFloat(productLink.price?.replace('$', '') || '0') * 100, // Convert to cents
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
          unit_amount: parseFloat(productLink.price?.replace('$', '') || '0') * 100, // Convert to cents
          currency: 'usd',
          type: 'one_time' as const,
        }],
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
      console.log('🔗 PAYMENT: Opened Stripe checkout for Buy Now from MediaPlayer');
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

  // Remove blurhash placeholder that was causing the gradient blob
  // const blurhash = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

  const fetchMedia = useCallback(async () => {
    // If external data is provided, use it instead of fetching
    if (externalMedia || playlist || slideshow) {
      console.log('Using external data provided to MediaPlayer');
      
      if (externalMedia) {
        setMedia(externalMedia);
        setPlaylistTitle(playlist?.name || slideshow?.name || 'Media Player');
      } else if (playlist) {
        setMedia(playlist.mediaFiles || []);
        setPlaylistTitle(playlist.name || 'Playlist');
      } else if (slideshow) {
        console.log('🖼️ SLIDESHOW_PROCESSING: Processing slideshow with images:', slideshow.images?.length || 0);
        console.log('🖼️ SLIDESHOW_PROCESSING: Slideshow images data:', slideshow.images);
        
        // Convert slideshow images to media format expected by MediaPlayer
        const slideshowMedia = slideshow.images?.map((image: any) => {
          console.log('🖼️ SLIDESHOW_IMAGE_PROCESSING: Processing image:', {
            id: image.id,
            url: image.url,
            title: image.title,
            caption: image.caption,
            displayOrder: image.displayOrder
          });
          
          // Use streaming URL if available, otherwise fall back to direct URL
          let imageUrl = image.url;
          
          // If the URL is a direct S3 URL, try to convert it to streaming URL
          if (imageUrl && imageUrl.includes('amazonaws.com') && image.id) {
            const baseUrl = process.env.NODE_ENV === 'production' 
              ? 'https://merchtech5-production.up.railway.app'
              : 'http://localhost:5001';
            const streamingUrl = `${baseUrl}/api/slideshow-images/${image.id}/stream`;
            
            console.log('🖼️ SLIDESHOW_URL_CONVERSION:', {
              original: imageUrl,
              streaming: streamingUrl,
              imageId: image.id
            });
            
            imageUrl = streamingUrl;
          } else {
            console.log('🖼️ SLIDESHOW_URL_DIRECT: Using URL as-is (already streaming URL):', imageUrl);
          }
          
          const processedImage = {
            id: image.id,
            title: image.caption || image.title || `Image ${image.displayOrder + 1}`,
            s3_key: imageUrl, // Use streaming URL for better compatibility
            media_type: 'image',
            type: 'image',
            fileType: 'image',
            contentType: 'image/jpeg',
            caption: image.caption,
            displayOrder: image.displayOrder
          };
          
          console.log('🖼️ SLIDESHOW_IMAGE_PROCESSED:', processedImage);
          return processedImage;
        }) || [];
        
        console.log('🖼️ SLIDESHOW_MEDIA_FINAL: Final media array:', slideshowMedia);
        console.log('🖼️ SLIDESHOW_MEDIA_COUNT: Setting media with', slideshowMedia.length, 'items');
        
        // Don't add background audio as a separate media item
        // It will be handled by the backgroundAudioUrl useMemo above
        
        setMedia(slideshowMedia);
        setPlaylistTitle(slideshow.name || 'Slideshow');
      }
      
      setLoading(false);
      return;
    }

    // Fallback to fetching data if no external data provided
    if (!mediaId || !type) {
      console.error('MediaPlayer: No external data provided and no mediaId/type for fetching');
      setError('No media data available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log(
        `Fetching media for ID: ${mediaId}, Type: ${type}`
      );
      const response = await api.get(`/${type}-access/${mediaId}`);
      console.log('API Response:', response.data);

      if (response.data && response.data.media) {
        setMedia(response.data.media);
        setPlaylistTitle(
          response.data.title || response.data.name || 'Media Player'
        );
      } else {
        setError(
          'No media found for this content. Please check the link and try again.'
        );
      }
    } catch (err: any) {
      console.error('Failed to fetch media:', err);
      const errorMessage =
        err.response?.data?.message ||
        'Could not load media. The content may be private or no longer available.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [mediaId, type, externalMedia, playlist, slideshow]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // Slideshow auto-play effect
  useEffect(() => {
    if (slideshow && isPlaying && media.length > 1) {
      const interval = slideshow.autoplayInterval || 5000; // Default 5 seconds
      
      slideshowIntervalRef.current = setInterval(() => {
        setCurrentIndex(prev => prev < media.length - 1 ? prev + 1 : 0);
      }, interval);

      return () => {
        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
        }
      };
    }
  }, [slideshow, isPlaying, media.length]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
    };
  }, []);

  const currentMediaItem = useMemo(() => {
    return media.length > 0 ? media[currentIndex] : null;
  }, [media, currentIndex]);

  const backgroundAudioUrl = useMemo(() => {
    // For slideshows, use the slideshow.audioUrl directly
    if (slideshow?.audioUrl) {
      let audioUrl = slideshow.audioUrl;
      
      // Check if this is an S3 URL and needs to be processed
      if (audioUrl && audioUrl.includes('amazonaws.com') && slideshow.id) {
        // Generate a streaming URL for the audio file
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? 'https://merchtech5-production.up.railway.app'
          : 'http://localhost:5001';
        
        // Use the streaming endpoint which handles CORS properly
        const streamingUrl = `${baseUrl}/api/slideshow-audio/${slideshow.id}/stream`;
        
        console.log('🔊 SLIDESHOW_AUDIO_URL_CONVERSION:', {
          original: audioUrl,
          streaming: streamingUrl,
          slideshowId: slideshow.id
        });
        
        audioUrl = streamingUrl;
      }
      
      return audioUrl;
    }
    
    // For playlists, look for audio files in media
    return (
      media.find((item) => item.media_type === 'audio')?.s3_key || null
    );
  }, [media, slideshow]);

  // This effect manages the lifecycle of the background audio player
  useEffect(() => {
    if (backgroundAudioUrl) {
      console.log('BACKGROUND_AUDIO: Setting up audio player.');
      // Unload any existing player first
      audioPlayerRef.current?.unload();

      const onEnded = () => {
        console.log('BACKGROUND_AUDIO: Playback finished.');
        setIsPlaying(false);
      };

      // Create a new player instance
      audioPlayerRef.current = createAudioPlayer(
        backgroundAudioUrl,
        onEnded,
        {
          shouldPlay: isPlaying,
          isLooping: true, // Typically background music should loop
        }
      );
    }

    // Cleanup function to unload the audio player when the component unmounts
    // or when the background audio URL changes.
    return () => {
      console.log('BACKGROUND_AUDIO: Unloading audio player.');
      audioPlayerRef.current?.unload();
    };
  }, [backgroundAudioUrl]); // Re-run only when the audio URL changes

  // This effect handles the play/pause state synchronization
  useEffect(() => {
    if (isPlaying) {
      audioPlayerRef.current?.play();
      videoRef.current?.playAsync();
    } else {
      audioPlayerRef.current?.pause();
      videoRef.current?.pauseAsync();
    }
  }, [isPlaying]);

  const onIndexChanged = (index: number) => {
    setCurrentIndex(index);
    setImageLoadError(false); // Reset image load error when changing images
    // If we swipe to a new slide that has a video, we might want to automatically
    // seek the video to the beginning.
    if (media[index]?.media_type === 'video') {
      videoRef.current?.setPositionAsync(0);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    const isActive = index === currentIndex;
    const isVideo = item.media_type === 'video';
    const itemUri = item.s3_key || item.url || 'https://placehold.co/400x300?text=No+Image';

    if (isVideo) {
      return (
        <Video
          ref={isActive ? videoRef : null}
          source={{ uri: itemUri }}
          rate={1.0}
          volume={1.0}
          isMuted={isMuted || !isActive}
          shouldPlay={isActive && isPlaying}
          isLooping
          resizeMode={ResizeMode.CONTAIN}
          style={styles.media}
          useNativeControls={false}
        />
      );
    } else {
      return (
        <ExpoImage
          source={{ uri: itemUri }}
          style={styles.media}
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
        <Text style={styles.infoText}>Loading Media...</Text>
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
        <MaterialIcons name="cloud-off" size={60} color="#aaa" />
        <Text style={styles.infoText}>No media files found.</Text>
      </View>
    );
  }

  // Enhanced layout for slideshows with Featured Products and Live Chat
  if (slideshow) {
    return (
      <View style={styles.slideshowContainer}>
        {/* Header */}
        <View style={styles.slideshowHeader}>
          <Text style={styles.slideshowTitle}>{slideshow.name}</Text>
        </View>

        {/* Main Content - Horizontal Layout */}
        <View style={styles.slideshowMainContent}>
          {/* Left Panel - Slideshow */}
          <View style={styles.slideshowLeftPanel}>
            {/* Current Image Display */}
            <View style={styles.slideshowImageContainer}>
              {media[currentIndex] && !imageLoadError && (
                <Image
                  source={{
                    uri: media[currentIndex].s3_key || media[currentIndex].url || 'https://placehold.co/400x300?text=No+Image',
                    headers: {
                      // Add cache control headers to prevent caching issues
                      'Cache-Control': 'no-cache',
                      // Add a timestamp to bust cache if needed
                      'X-Timestamp': Date.now().toString(),
                    },
                  }}
                  style={styles.slideshowImage}
                  resizeMode="contain"
                  onError={(error) => {
                    console.error('🖼️ SLIDESHOW_IMAGE_ERROR:', error);
                    console.error('🖼️ Failed to load image:', media[currentIndex].s3_key || media[currentIndex].url);

                    // Log additional details for debugging
                    console.error('🖼️ Image details:', {
                      s3_key: media[currentIndex].s3_key,
                      url: media[currentIndex].url,
                      mediaType: media[currentIndex].media_type,
                      id: media[currentIndex].id,
                    });

                    setImageLoadError(true);
                  }}
                  onLoad={() => {
                    console.log('🖼️ SLIDESHOW_IMAGE_LOADED:', media[currentIndex].s3_key || media[currentIndex].url);
                    setImageLoadError(false);
                  }}
                />
              )}
              
              {imageLoadError && (
                <View style={styles.imageErrorContainer}>
                  <MaterialIcons name="broken-image" size={64} color="#666" />
                  <Text style={styles.imageErrorText}>Failed to load image</Text>
                </View>
              )}
              
              {/* Navigation Arrows */}
              <TouchableOpacity 
                style={[styles.navButton, styles.prevButton]}
                onPress={() => {
                  setCurrentIndex(prev => prev > 0 ? prev - 1 : media.length - 1);
                  setImageLoadError(false);
                }}
              >
                <MaterialIcons name="chevron-left" size={32} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.navButton, styles.nextButton]}
                onPress={() => {
                  setCurrentIndex(prev => prev < media.length - 1 ? prev + 1 : 0);
                  setImageLoadError(false);
                }}
              >
                <MaterialIcons name="chevron-right" size={32} color="#fff" />
              </TouchableOpacity>

              {/* Image Info Overlay */}
              <View style={styles.imageInfoOverlay}>
                <Text style={styles.imageTitle}>
                  {media[currentIndex]?.title || `Image ${currentIndex + 1}`}
                </Text>
                <Text style={styles.imageCounter}>
                  {currentIndex + 1} of {media.length}
                </Text>
              </View>
            </View>

            {/* Slideshow Controls */}
            <View style={styles.slideshowControls}>
              <TouchableOpacity onPress={handleMuteToggle} style={styles.slideshowControlButton}>
                <MaterialCommunityIcons
                  name={isMuted ? 'volume-off' : 'volume-high'}
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePlayPause} style={styles.slideshowControlButton}>
                <FontAwesome5
                  name={isPlaying ? 'pause' : 'play'}
                  size={22}
                  color="white"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Right Panel - Featured Products */}
          <View style={styles.slideshowRightPanel}>
            <View style={styles.featuredProductsHeader}>
              <MaterialIcons name="storefront" size={24} color="#374151" />
              <Text style={styles.featuredProductsTitle}>Featured Products</Text>
            </View>
            <ScrollView
              style={styles.featuredProductsContent}
              showsVerticalScrollIndicator={true}
              bounces={Platform.OS === 'ios'}
              overScrollMode={Platform.OS === 'android' ? 'always' : 'auto'}
              contentContainerStyle={styles.productsListContent}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              {...(Platform.OS === 'web' && {
                scrollEnabled: true,
                showsVerticalScrollIndicator: true,
              })}
            >
              {slideshow.productLinks && slideshow.productLinks.length > 0 ? (
                slideshow.productLinks
                  .filter((link: ProductLink) => link.isActive)
                  .sort((a: ProductLink, b: ProductLink) => a.displayOrder - b.displayOrder)
                  .map((link: ProductLink) => {
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
                                    {images.map((_: string | undefined, index: number) => (
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

        {/* Bottom Panel - Live Chat */}
        <View style={styles.slideshowChatSection}>
          <View style={styles.chatHeader}>
            <MaterialIcons name="chat" size={20} color="#3b82f6" />
            <Text style={styles.chatTitle}>Live Chat</Text>
            <View style={styles.chatBadge}>
              <Text style={styles.chatBadgeText}>0</Text>
            </View>
          </View>
          <View style={styles.chatContent}>
            <View style={styles.chatEmptyContainer}>
              <MaterialIcons name="chat" size={48} color="#ccc" />
              <Text style={styles.chatEmptyText}>
                Join the conversation! Share your thoughts about this slideshow.
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Default layout for regular media (playlists, etc.)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {playlistTitle}
        </Text>
      </View>

      <Swiper
        style={styles.wrapper}
        showsButtons={false}
        loop={false}
        onIndexChanged={onIndexChanged}
        dotStyle={styles.dot}
        activeDotStyle={styles.activeDot}
        paginationStyle={styles.pagination}
      >
        {media.map(renderMediaItem)}
      </Swiper>

      <View style={styles.controls}>
        <TouchableOpacity onPress={handleMuteToggle} style={styles.controlButton}>
          <MaterialCommunityIcons
            name={isMuted ? 'volume-off' : 'volume-high'}
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
        <View style={styles.controlButton} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  wrapper: {},
  media: {
    width: width,
    flex: 1,
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
  pagination: {
    bottom: 80,
  },
  dot: {
    backgroundColor: 'rgba(255,255,255,.3)',
    width: 8,
    height: 8,
    borderRadius: 4,
    margin: 3,
  },
  activeDot: {
    backgroundColor: 'white',
    width: 10,
    height: 10,
    borderRadius: 5,
    margin: 3,
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
  // Slideshow-specific styles
  slideshowContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
    flex: 1,
    flexDirection: 'row',
    padding: 20,
    gap: 20,
  },
  slideshowLeftPanel: {
    flex: 2,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  slideshowSwiper: {
    flex: 1,
  },
  slideshowControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    gap: 20,
  },
  slideshowControlButton: {
    padding: 8,
  },
  slideshowDot: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
  },
  slideshowActiveDot: {
    backgroundColor: 'white',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
  },
  slideshowPagination: {
    bottom: 60,
  },
  slideshowRightPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  featuredProductsText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
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
  noProductsSubtext: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
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
    maxHeight: 200,
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
  // Additional slideshow styles
  slideshowImageContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  slideshowImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -25 }],
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  prevButton: {
    left: 10,
  },
  nextButton: {
    right: 10,
  },
  imageInfoOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    padding: 12,
  },
  imageTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  imageCounter: {
    color: '#ccc',
    fontSize: 14,
  },
  imageErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  imageErrorText: {
    color: '#666',
    fontSize: 16,
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
  productsListContent: {
    paddingBottom: 20, // Add some padding at the bottom for the last item
  },
});

export default MediaPlayer; 