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
  TouchableWithoutFeedback,
  ActivityIndicator,
  Text,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import {
  MaterialCommunityIcons,
  MaterialIcons,
  FontAwesome5,
  Ionicons,
} from '@expo/vector-icons';
import createAudioPlayer, {
  IAudioPlayer,
} from '../services/audio/AudioService';
import { ProductLink } from '../shared/media-schema';
import { api, paymentAPI } from '../services/api';
import { useCart } from '../contexts/CartContext';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import SlideshowChat from './SlideshowChat';

const { width } = Dimensions.get('window');

interface SlideshowImage {
  id: string | number;
  title?: string;
  caption?: string;
  url: string;
  displayOrder?: number;
}

interface SlideshowPlayerProps {
  slideshowId?: string;
  slideshow?: any;
  autoPlay?: boolean;
}

const SlideshowPlayer = ({ slideshowId, slideshow, autoPlay = false }: SlideshowPlayerProps) => {
  const [slideshowData, setSlideshowData] = useState<any>(slideshow);
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [loading, setLoading] = useState(!slideshow);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitButton, setShowExitButton] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [productImageIndexes, setProductImageIndexes] = useState<Record<string, number>>({});

  // Audio player reference
  const audioPlayerRef = useRef<IAudioPlayer | null>(null);
  const slideshowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cart functionality
  const { addToCart, getTotalItems } = useCart();
  const router = useRouter();
  const isMobile = width < 768;

  // Product handling functions
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
          console.log('🔗 PAYMENT (iOS): Opened Stripe checkout from SlideshowPlayer, result:', result);
          
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
        console.log('🔗 PAYMENT: Opened Stripe checkout from SlideshowPlayer, result:', result);
      }
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

  const fetchSlideshow = useCallback(async () => {
    if (!slideshowId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/slideshow-access/${slideshowId}`);
      
      if (response.data) {
        setSlideshowData(response.data);
        
        // Convert slideshow images to expected format
        const slideshowImages = response.data.images?.map((image: any) => ({
          id: image.id,
          title: image.caption || image.title || `Image ${image.displayOrder + 1}`,
          caption: image.caption,
          url: image.image_url,
          displayOrder: image.displayOrder
        })) || [];
        
        setImages(slideshowImages);
      } else {
        setError('Slideshow not found');
      }
    } catch (err: any) {
      console.error('Failed to fetch slideshow:', err);
      setError(err.response?.data?.message || 'Could not load slideshow');
    } finally {
      setLoading(false);
    }
  }, [slideshowId]);

  useEffect(() => {
    if (slideshow) {
      console.log('🎬 SLIDESHOW_PLAYER: Processing slideshow data:', slideshow);
      console.log('🎬 SLIDESHOW_PLAYER: Slideshow name:', slideshow.name);
      console.log('🎬 SLIDESHOW_PLAYER: Slideshow images array:', slideshow.images);
      console.log('🎬 SLIDESHOW_PLAYER: Images array length:', slideshow.images?.length || 0);
      
      setSlideshowData(slideshow);
      
      // Process slideshow images
      const slideshowImages = slideshow.images?.map((image: any, index: number) => {
        console.log(`🎬 SLIDESHOW_PLAYER: Processing image ${index + 1}:`, {
          id: image.id,
          image_url: image.image_url,
          imageUrl: image.imageUrl,
          url: image.url,
          caption: image.caption,
          displayOrder: image.displayOrder
        });
        
        return {
          id: image.id,
          title: image.caption || image.title || `Image ${image.displayOrder + 1}`,
          caption: image.caption,
          url: image.image_url || image.imageUrl || image.url, // Try multiple field names
          displayOrder: image.displayOrder
        };
      }) || [];
      
      console.log('🎬 SLIDESHOW_PLAYER: Final processed images:', slideshowImages);
      console.log('🎬 SLIDESHOW_PLAYER: Final images count:', slideshowImages.length);
      
      setImages(slideshowImages);
      setLoading(false);
    } else {
      fetchSlideshow();
    }
  }, [slideshow, fetchSlideshow]);

  // Background audio URL
  const backgroundAudioUrl = useMemo(() => {
    if (slideshowData?.audioUrl) {
      return slideshowData.audioUrl;
    }
    return null;
  }, [slideshowData]);

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
    } else {
      audioPlayerRef.current?.pause();
    }
  }, [isPlaying]);

  // Mute/unmute synchronization
  useEffect(() => {
    audioPlayerRef.current?.setMuted(isMuted);
  }, [isMuted]);

  // Slideshow auto-play
  useEffect(() => {
    if (isPlaying && images.length > 1) {
      const interval = slideshowData?.autoplayInterval || 5000;
      
      slideshowIntervalRef.current = setInterval(() => {
        setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
      }, interval);

      return () => {
        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
        }
      };
    }
  }, [isPlaying, images.length, slideshowData?.autoplayInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
    };
  }, []);

  // Disable right-click on web
  useEffect(() => {
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

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
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
      if (Platform.OS === 'web') {
        // For web platform, use native fullscreen API
        if (!document.fullscreenElement) {
          // Enter fullscreen - fullscreen the entire slideshow container
          const slideshowContainer = document.querySelector('[data-slideshow-player]') || 
                                   document.querySelector('.slideshowContainer') ||
                                   document.body;
          
          if (slideshowContainer) {
            // Try different fullscreen methods for better iOS Safari compatibility
            const requestFullscreen = slideshowContainer.requestFullscreen ||
                                     (slideshowContainer as any).webkitRequestFullscreen ||
                                     (slideshowContainer as any).mozRequestFullScreen ||
                                     (slideshowContainer as any).msRequestFullscreen;
            
            if (requestFullscreen) {
              try {
                await requestFullscreen.call(slideshowContainer);
                setIsFullscreen(true);
                console.log('🖥️ SLIDESHOW_FULLSCREEN: Entered fullscreen mode on web');
              } catch (fsError) {
                console.warn('🖥️ SLIDESHOW_FULLSCREEN: Native fullscreen failed, using fallback:', fsError);
                // Fallback to state-only fullscreen for iOS Safari
                setIsFullscreen(true);
              }
            } else {
              console.warn('🖥️ SLIDESHOW_FULLSCREEN: Fullscreen API not available, using fallback');
              // Fallback to state-only fullscreen
              setIsFullscreen(true);
            }
          } else {
            console.warn('🖥️ SLIDESHOW_FULLSCREEN: Container not found, using fallback');
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
              console.log('🖥️ SLIDESHOW_FULLSCREEN: Exited fullscreen mode on web');
            } catch (fsError) {
              console.warn('🖥️ SLIDESHOW_FULLSCREEN: Native exit fullscreen failed:', fsError);
              setIsFullscreen(false);
            }
          } else {
            setIsFullscreen(false);
          }
        }
      } else {
        // For mobile platform, toggle fullscreen state (no native fullscreen for images)
        console.log('📱 SLIDESHOW_FULLSCREEN: Toggling fullscreen mode on mobile');
        setIsFullscreen(!isFullscreen);
      }
    } catch (error) {
      console.error('🖥️ SLIDESHOW_FULLSCREEN: Error:', error);
      // Fallback: toggle state manually if API fails
      setIsFullscreen(!isFullscreen);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.infoText}>Loading Slideshow...</Text>
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

  if (images.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="image-not-supported" size={60} color="#aaa" />
        <Text style={styles.infoText}>No images found in slideshow.</Text>
        <Text style={styles.infoSubtext}>
          This slideshow exists but doesn't have any images uploaded yet.
        </Text>
        {slideshowData?.name && (
          <Text style={styles.slideshowNameText}>
            Slideshow: {slideshowData.name}
          </Text>
        )}
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={handleScreenTouch}>
      <View style={[styles.slideshowContainer, isFullscreen && styles.fullscreenContainer]} data-slideshow-player="true">
      {/* Header */}
      {!isFullscreen && (
        <View style={styles.slideshowHeader}>
          <View style={styles.slideshowHeaderRow}>
            <Text style={styles.slideshowTitle}>{slideshowData?.name || 'Slideshow'}</Text>
            <TouchableOpacity
              style={styles.slideshowCartButton}
              onPress={() => {
                console.log('Navigate to cart');
                if (Platform.OS === 'web') {
                  window.location.href = '/store/cart';
                } else {
                  router.push('/store/cart');
                }
              }}
            >
              <MaterialIcons name="shopping-cart" size={24} color="#374151" />
              {getTotalItems() > 0 && (
                <View style={styles.slideshowCartBadge}>
                  <Text style={styles.slideshowCartBadgeText}>{getTotalItems()}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Scrollable Main Content */}
      <ScrollView 
        style={[styles.scrollContainer, isFullscreen && styles.fullscreenScrollContainer]}
        showsVerticalScrollIndicator={!isFullscreen}
        contentContainerStyle={[styles.scrollContent, isFullscreen && styles.fullscreenScrollContent]}
      >
        {/* Main Content - Horizontal Layout */}
        <View style={[styles.slideshowMainContent, isFullscreen && styles.fullscreenMainContent, isMobile && styles.mobileMainContent]}>
        {/* Left Panel - Slideshow */}
        <View style={[styles.slideshowLeftPanel, isFullscreen && styles.fullscreenLeftPanel, isMobile && styles.mobileLeftPanel]}>
          {/* Current Image Display */}
          <View style={[styles.slideshowImageContainer, isFullscreen && styles.fullscreenImageContainer]}>
            {images[currentIndex] && !imageLoadError && (
              <Image
                source={{
                  uri: images[currentIndex].url,
                  headers: {
                    'Cache-Control': 'no-cache',
                    'X-Timestamp': Date.now().toString(),
                  },
                }}
                style={[styles.slideshowImage, isFullscreen && styles.fullscreenImage]}
                resizeMode="contain"
                onError={(error) => {
                  console.error('Image load error:', error);
                  setImageLoadError(true);
                }}
                onLoad={() => {
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
                setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
                setImageLoadError(false);
              }}
            >
              <MaterialIcons name="chevron-left" size={32} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.navButton, styles.nextButton]}
              onPress={() => {
                setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
                setImageLoadError(false);
              }}
            >
              <MaterialIcons name="chevron-right" size={32} color="#fff" />
            </TouchableOpacity>

            {/* Image Info Overlay - Hidden in fullscreen */}
            {!isFullscreen && (
              <View style={styles.imageInfoOverlay}>
                <Text style={styles.imageTitle}>
                  {images[currentIndex]?.title || `Image ${currentIndex + 1}`}
                </Text>
                <Text style={styles.imageCounter}>
                  {currentIndex + 1} of {images.length}
                </Text>
              </View>
            )}
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
            <TouchableOpacity onPress={handleFullscreen} style={styles.slideshowControlButton}>
              <MaterialIcons
                name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
                size={24}
                color="white"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Right Panel - Featured Products */}
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
            {slideshowData?.productLinks && slideshowData.productLinks.length > 0 ? (
              slideshowData.productLinks
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
        )}
      </View>

        {/* Bottom Panel - Live Chat */}
        {!isFullscreen && (
          <View style={styles.slideshowChatSection}>
            <SlideshowChat
              slideshowId={slideshowData?.id?.toString() || ''}
              slideshowName={slideshowData?.name || 'Slideshow'}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    padding: 20,
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
  infoSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  slideshowNameText: {
    fontSize: 14,
    color: '#3b82f6',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
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
  slideshowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slideshowTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  slideshowCartButton: {
    position: 'relative',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  slideshowCartBadge: {
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
  slideshowCartBadgeText: {
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
    flex: 1.2, // Reduced from 2 to 1.2 (give more space to products)
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 500, // Set minimum height for the slideshow panel
  },
  mobileLeftPanel: {
    width: '100%',
    minHeight: 300,
  },
  slideshowImageContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  slideshowImage: {
    flex: 1,
    width: '100%',
    height: '100%',
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
  slideshowRightPanel: {
    flex: 1.8, // Increased from 1 to 1.8 (more space for products)
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
  fullscreenImageContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minHeight: '100%',
  },
  fullscreenImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
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
});

export default SlideshowPlayer; 