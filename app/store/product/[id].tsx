import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product, ProductRating } from '@/shared/product-schema';
import { productsAPI, checkoutAPI } from '@/services/api';
import { env } from '@/config/environment';
import { useCart } from '@/contexts/CartContext';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import ShareButton from '@/components/ShareButton';
import { MobileCompatibleImage } from '@/components/MobileCompatibleImage';

const { width } = Dimensions.get('window');

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id, product: productParam } = useLocalSearchParams<{ id: string; product?: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const flatListRef = useRef<FlatList<string>>(null);
  const [base, setBase] = useState('');

  // Ratings & comments
  const [ratings, setRatings] = useState<ProductRating[]>([]);
  const [userRating, setUserRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [quantity, setQuantity] = useState(1);

  const { addToCart, getTotalItems } = useCart();

  useEffect(() => {
    loadProduct();
    // Determine absolute base URL for web and native
    if (Platform.OS === 'web') {
      setBase(window.location.origin);
    } else {
      setBase(env.frontendUrl.replace(/\/$/, ''));
    }
  }, [id, productParam]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      if (productParam) {
        try {
          const parsed = JSON.parse(productParam);
          setProduct(parsed);
          setLoading(false);
          return;
        } catch {
          // fall-through to fetch
        }
      }
      
      // Fetch product from API
      const response = await productsAPI.getProductById(id);
      if (response.product) {
        const normalized = {
          ...response.product,
          in_stock: response.product.in_stock ?? (response.product as any).inStock ?? true,
        } as Product;
        setProduct(normalized);
      } else {
        // Fallback: fetch all products and find by id
        const all = await productsAPI.getAllProducts();
        const foundRaw = all.find((p: Product) => p.id === id);
        const found = foundRaw
          ? ({
              ...foundRaw,
              in_stock: (foundRaw as any).in_stock ?? (foundRaw as any).inStock ?? true,
            } as Product)
          : null;
        if (found) {
          setProduct(found);
        } else {
          Alert.alert('Error', 'Product not found');
          router.back();
        }
      }
    } catch (err) {
      console.error('Failed to load product', err);
      Alert.alert('Error', 'Failed to load product details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}> 
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading product details...</ThemedText>
      </ThemedView>
    );
  }

  if (!product) {
    return (
      <ThemedView style={styles.centered}> 
        <MaterialIcons name="error-outline" size={48} color="#ef4444" />
        <ThemedText style={styles.errorText}>Product not found</ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  // Handle multiple images properly
  const images = product.images && product.images.length > 0 
    ? product.images.filter(img => img && img.trim() !== '') 
    : ['data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="Arial, Helvetica, sans-serif" font-size="24">No Image</text></svg>'];

  const formatPrice = (priceInCents: number) => `$${(priceInCents / 100).toFixed(2)}`;
  const lowestPrice = product.prices?.length ? Math.min(...product.prices.map(p => p.unit_amount)) : (product.price || 0);

  const getProductUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/product/${product.id}`;
  };

  const handleAddToCart = async () => {
    if (!product.in_stock) {
      Alert.alert('Out of Stock', 'This product is currently out of stock.');
      return;
    }

    setAddingToCart(true);
    try {
      // Add the specified quantity to cart
      for (let i = 0; i < quantity; i++) {
        addToCart(product);
      }
      
      Alert.alert(
        'Added to Cart', 
        `${quantity} ${product.name}${quantity > 1 ? 's' : ''} added to your cart!`,
        [
          { text: 'Continue Shopping', style: 'cancel' },
          { text: 'View Cart', onPress: () => router.push('/store/cart') }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to add product to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product.in_stock) {
      Alert.alert('Out of Stock', 'This product is currently out of stock.');
      return;
    }

    setBuyingNow(true);
    try {
      // Ensure base URL is set before creating session
      if (Platform.OS === 'web' && !base) {
        Alert.alert('Error', 'Could not determine checkout URL. Please refresh and try again.');
        return;
      }

      const absBase = base || (Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.origin : '') : env.frontendUrl.replace(/\/$/, ''));
      const successUrl = `${absBase}/store/checkout-success`;
      const cancelUrl = `${absBase}/store/product/${id}`;
      
      const items = Array(quantity).fill({ productId: product.id, quantity: 1 });
      
      console.log('🔗 BUY_NOW: Creating session with items:', items);

      const response = await checkoutAPI.createSession(items, successUrl, cancelUrl);
      console.log('🔗 BUY_NOW: API response:', response);

      const checkoutUrl = response.url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL received from server');
      }

      console.log('🔗 BUY_NOW: Opening URL:', checkoutUrl);

      if (Platform.OS === 'web') {
        // Direct redirect - no popups, works reliably on all devices
        console.log('🔗 BUY_NOW: Redirecting to checkout:', checkoutUrl);
        window.location.href = checkoutUrl;
      } else {
        // For mobile native apps (iOS/Android)
        if (Platform.OS === 'ios') {
          // iOS: Try WebBrowser first, fallback to Linking if it fails
          try {
            const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
              dismissButtonStyle: 'done',
              presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
              controlsColor: '#3b82f6',
            });
            console.log('🔗 BUY_NOW (iOS): WebBrowser result:', result);
            
            // If user dismissed the browser, handle it gracefully
            if (result.type === 'cancel') {
              console.log('🔗 BUY_NOW (iOS): User cancelled checkout');
            }
          } catch (webBrowserError) {
            // Fallback to Linking API for iOS
            console.warn('🔗 BUY_NOW (iOS): WebBrowser failed, trying Linking API:', webBrowserError);
            const canOpen = await Linking.canOpenURL(checkoutUrl);
            if (canOpen) {
              await Linking.openURL(checkoutUrl);
              console.log('🔗 BUY_NOW (iOS): Opened with Linking API');
            } else {
              throw new Error('Cannot open checkout URL on this device');
            }
          }
        } else {
          // Android: Use WebBrowser
          const result = await WebBrowser.openBrowserAsync(checkoutUrl);
          console.log('🔗 BUY_NOW (Android): WebBrowser result:', result);
        }
      }
    } catch (err: any) {
      console.error('🔴 BUY_NOW ERROR:', err);
      console.error('🔴 BUY_NOW ERROR Details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
    } finally {
      setBuyingNow(false);
    }
  };

  const submitReview = () => {
    if (!userRating && !comment.trim()) {
      Alert.alert('Review Required', 'Please provide a rating or comment.');
      return;
    }
    
    const newReview: ProductRating = {
      id: Date.now(),
      productId: Number(product.id),
      userId: 0,
      rating: userRating,
      review: comment.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setRatings(prev => [newReview, ...prev]);
    setUserRating(0);
    setComment('');
    Alert.alert('Thank You!', 'Your review has been submitted.');
  };

  const ZoomableImage = ({ uri }: { uri: string }) => {
    const scale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const pinchHandler = useAnimatedGestureHandler({
      onStart: (_, context) => {
        context.startScale = scale.value;
      },
      onActive: (event, context) => {
        scale.value = Math.max(1, Math.min(context.startScale * event.scale, 4));
      },
      onEnd: () => {
        if (scale.value < 1) {
          scale.value = withSpring(1);
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
        }
      },
    });

    const panHandler = useAnimatedGestureHandler({
      onStart: (_, context) => {
        context.startX = translateX.value;
        context.startY = translateY.value;
      },
      onActive: (event, context) => {
        if (scale.value > 1) {
          const maxTranslateX = (width * (scale.value - 1)) / 2;
          const maxTranslateY = (400 * (scale.value - 1)) / 2;
          
          translateX.value = Math.max(
            -maxTranslateX,
            Math.min(maxTranslateX, context.startX + event.translationX)
          );
          translateY.value = Math.max(
            -maxTranslateY,
            Math.min(maxTranslateY, context.startY + event.translationY)
          );
        }
      },
    });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    }));

    const resetZoom = () => {
      scale.value = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    };

    // Enhanced image source handling for mobile
    const handleImageError = (error: any) => {
      console.log('🖼️ Product image load error:', {
        uri,
        error: error.nativeEvent?.error || error,
        platform: Platform.OS
      });
    };

    return (
      <View style={styles.imageContainer}>
        <PanGestureHandler onGestureEvent={panHandler}>
          <Animated.View>
            <PinchGestureHandler onGestureEvent={pinchHandler}>
              <Animated.View style={animatedStyle}>
                <TouchableOpacity onPress={resetZoom} activeOpacity={1}>
                  <MobileCompatibleImage
                    uri={uri}
                    style={styles.image}
                    resizeMode="contain"
                    onError={handleImageError}
                    fallbackUri="https://placehold.co/600x600?text=No+Image"
                  />
                </TouchableOpacity>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </PanGestureHandler>
      </View>
    );
  };

  const renderImage = ({ item }: { item: string }) => (
    <ZoomableImage uri={item} />
  );

  const Star = ({ filled }: { filled: boolean }) => (
    <Text style={[styles.star, filled ? styles.starFilled : styles.starEmpty]}>★</Text>
  );

  const adjustQuantity = (change: number) => {
    const newQuantity = Math.max(1, Math.min(10, quantity + change));
    setQuantity(newQuantity);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <ShareButton
              url={getProductUrl()}
              title={product.name}
              description={product.description}
              type="product"
              compact={true}
            />
          </View>
        </View>

        {/* Image Gallery */}
        <View style={styles.imageCarouselContainer}>
          <FlatList
            data={images}
            keyExtractor={(uri, idx) => `${uri}-${idx}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={renderImage}
            style={styles.imageCarousel}
            onMomentumScrollEnd={(ev) => {
              const idx = Math.round(ev.nativeEvent.contentOffset.x / width);
              setCurrentIndex(idx);
            }}
            ref={flatListRef}
          />
          
          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowLeft]}
                onPress={() => {
                  const newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
                  setCurrentIndex(newIndex);
                  flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
                }}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.navArrow, styles.navArrowRight]}
                onPress={() => {
                  const newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
                  setCurrentIndex(newIndex);
                  flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
                }}
              >
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          
          {/* Image Counter */}
          {images.length > 1 && (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          )}
        </View>
        
        {/* Dot Indicators */}
        {images.length > 1 && (
          <View style={styles.dotsContainer}>
            {images.map((_, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.dot, idx === currentIndex && styles.dotActive]}
                onPress={() => {
                  setCurrentIndex(idx);
                  flatListRef.current?.scrollToIndex({ index: idx, animated: true });
                }}
              />
            ))}
          </View>
        )}

        {/* Product Details */}
        <ThemedView style={styles.content}>
          {/* Product Info */}
          <View style={styles.productHeader}>
            <ThemedText type="title" style={styles.title}>{product.name}</ThemedText>
            <View style={styles.priceStockContainer}>
              <ThemedText style={styles.price}>{formatPrice(lowestPrice)}</ThemedText>
              <View style={[styles.stockBadge, { backgroundColor: product.in_stock ? '#22c55e' : '#ef4444' }]}>
                <MaterialIcons 
                  name={product.in_stock ? 'check-circle' : 'error'} 
                  size={16} 
                  color="#fff" 
                />
                <Text style={styles.stockText}>
                  {product.in_stock ? 'In Stock' : 'Out of Stock'}
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          <ThemedText style={styles.description}>{product.description}</ThemedText>

          {/* Quantity Selector */}
          <View style={styles.quantityContainer}>
            <ThemedText style={styles.quantityLabel}>Quantity:</ThemedText>
            <View style={styles.quantitySelector}>
              <TouchableOpacity 
                style={styles.quantityBtn} 
                onPress={() => adjustQuantity(-1)}
                disabled={quantity <= 1}
              >
                <Ionicons name="remove" size={20} color={quantity <= 1 ? "#ccc" : "#000"} />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity 
                style={styles.quantityBtn} 
                onPress={() => adjustQuantity(1)}
                disabled={quantity >= 10}
              >
                <Ionicons name="add" size={20} color={quantity >= 10 ? "#ccc" : "#000"} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.cartBtn, (!product.in_stock || addingToCart) && styles.buttonDisabled]} 
              onPress={handleAddToCart}
              disabled={!product.in_stock || addingToCart}
            >
              {addingToCart ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="add-shopping-cart" size={20} color="#fff" />
                  <ThemedText style={styles.buttonText}>Add to Cart</ThemedText>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.buyNowBtn, (!product.in_stock || buyingNow) && styles.buttonDisabled]} 
              onPress={handleBuyNow}
              disabled={!product.in_stock || buyingNow}
            >
              {buyingNow ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="flash-on" size={20} color="#fff" />
                  <ThemedText style={styles.buttonText}>Buy Now</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Reviews Section */}
          <View style={styles.reviewsSection}>
            <ThemedText type="subtitle" style={styles.reviewsTitle}>Reviews & Ratings</ThemedText>
            
            {/* Rating Input */}
            <View style={styles.ratingInput}>
              <ThemedText style={styles.ratingLabel}>Rate this product:</ThemedText>
              <View style={styles.ratingRow}>
                {[1,2,3,4,5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setUserRating(i)}>
                    <Star filled={i <= userRating} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Comment Input */}
            <TextInput
              placeholder="Leave a comment..."
              placeholderTextColor="#9ca3af"
              value={comment}
              onChangeText={setComment}
              style={styles.commentInput}
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity style={styles.reviewButton} onPress={submitReview}>
              <ThemedText style={styles.reviewButtonText}>Submit Review</ThemedText>
            </TouchableOpacity>

            {/* Existing Reviews */}
            {ratings.length > 0 && (
              <View style={styles.existingReviews}>
                <ThemedText style={styles.existingReviewsTitle}>Customer Reviews</ThemedText>
                {ratings.map(r => (
                  <View key={r.id} style={styles.reviewItem}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.ratingRow}>
                        {[1,2,3,4,5].map(i => <Star key={i} filled={i <= r.rating} />)}
                      </View>
                      <Text style={styles.reviewDate}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    {r.review && <ThemedText style={styles.reviewText}>{r.review}</ThemedText>}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#ef4444',
  },
  backButton: {
    marginTop: 20,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  backBtn: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageCarouselContainer: {
    position: 'relative',
    backgroundColor: '#f8f9fa',
  },
  imageCarousel: {
    height: 400,
  },
  imageContainer: {
    width: width,
    height: 400,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  image: {
    width: width,
    height: 400,
    backgroundColor: '#f8f9fa', // Light background while loading
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  navArrowLeft: {
    left: 15,
  },
  navArrowRight: {
    right: 15,
  },
  imageCounter: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: '#f8f9fa',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: '#3b82f6',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  productHeader: {
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
  },
  priceStockContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3b82f6',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    gap: 5,
  },
  stockText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.8,
    marginBottom: 20,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  quantityBtn: {
    padding: 10,
    borderRadius: 6,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    minWidth: 40,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  cartBtn: {
    flex: 1,
    backgroundColor: '#6b7280',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    gap: 8,
  },
  buyNowBtn: {
    flex: 1,
    backgroundColor: '#22c55e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewsSection: {
    marginTop: 10,
  },
  reviewsTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  ratingInput: {
    marginBottom: 15,
  },
  ratingLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  star: {
    fontSize: 28,
    marginHorizontal: 2,
  },
  starFilled: {
    color: '#facc15',
  },
  starEmpty: {
    color: '#d1d5db',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
    marginBottom: 15,
  },
  reviewButton: {
    backgroundColor: '#3b82f6',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 25,
  },
  reviewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  existingReviews: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 20,
  },
  existingReviewsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  reviewItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 15,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
  },
}); 