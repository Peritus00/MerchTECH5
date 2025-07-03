import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, Image, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Product, ProductRating } from '@/shared/product-schema';
import { productsAPI } from '@/services/api';
import { useCart } from '@/contexts/CartContext';
import * as WebBrowser from 'expo-web-browser';
import { checkoutAPI } from '@/services/api';
import ShareButton from '@/components/ShareButton';

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = width; // square images

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id, product: productParam } = useLocalSearchParams<{ id: string; product?: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<string>>(null);

  // Ratings & comments (placeholder local state)
  const [ratings, setRatings] = useState<ProductRating[]>([]);
  const [userRating, setUserRating] = useState<number>(0);
  const [comment, setComment] = useState('');

  const { addToCart } = useCart();

  useEffect(() => {
    if (productParam) {
      try {
        const parsed = JSON.parse(productParam);
        setProduct(parsed);
        return;
      } catch {
        // fall-through to fetch
      }
    }
    // Fallback: fetch product list and find by id
    const load = async () => {
      try {
        const all = await productsAPI.getAllProducts();
        const found = all.find((p: Product) => p.id === id);
        if (found) setProduct(found);
      } catch (err) {
        console.error('Failed to load product', err);
      }
    };
    load();
  }, [id, productParam]);

  if (!product) {
    return (
      <ThemedView style={styles.centered}> 
        <ThemedText>Loading product...</ThemedText>
      </ThemedView>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : ['https://placehold.co/600x600?text=No+Image'];

  const formatPrice = (priceInCents: number) => `$${(priceInCents / 100).toFixed(2)}`;
  const lowestPrice = product.prices?.length ? Math.min(...product.prices.map(p => p.unit_amount)) : 0;

  const getProductUrl = () => {
    const baseUrl = 'https://merchtech.net';
    return `${baseUrl}/store/product/${product.id}`;
  };

  const handleAddToCart = () => addToCart(product);

  const handleBuyNow = async () => {
    try {
      const base = Platform.OS === 'web' ? window.location.origin : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success`;
      const cancelUrl = `${base}/store/checkout-cancel`;
      const { url } = await checkoutAPI.createSession([{ productId: product.id, quantity: 1 }], successUrl, cancelUrl);
      
      // Always use WebBrowser to keep app running in background
      await WebBrowser.openBrowserAsync(url);
      console.log('🔗 PAYMENT: Opened Stripe checkout in external browser (Product Detail)');
    } catch (err) {
      console.error('BuyNow error', err);
    }
  };

  const submitReview = () => {
    if (!userRating && !comment) return;
    const newReview: ProductRating = {
      id: Date.now(),
      productId: Number(product.id),
      userId: 0,
      rating: userRating,
      review: comment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRatings(prev => [newReview, ...prev]);
    setUserRating(0);
    setComment('');
  };

  const ZoomableImage = ({ uri }: { uri: string }) => {
    const scale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const focalX = useSharedValue(0);
    const focalY = useSharedValue(0);

    const pinchHandler = useAnimatedGestureHandler({
      onStart: (_, context) => {
        context.startScale = scale.value;
        focalX.value = _.focalX;
        focalY.value = _.focalY;
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
          const maxTranslateY = (300 * (scale.value - 1)) / 2;
          
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

    return (
      <View style={styles.imageContainer}>
        <PanGestureHandler onGestureEvent={panHandler}>
          <Animated.View>
            <PinchGestureHandler onGestureEvent={pinchHandler}>
              <Animated.View style={animatedStyle}>
                <TouchableOpacity onPress={resetZoom} activeOpacity={1}>
                  <Image source={{ uri }} style={styles.image} />
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <FlatList
        data={images}
        keyExtractor={(uri, idx) => `${uri}-${idx}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderImage}
        style={{ flexGrow: 0, height: 300 }}
        onMomentumScrollEnd={(ev) => {
          const idx = Math.round(ev.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
        ref={flatListRef}
      />
      {/* Dot indicator */}
      <View style={styles.dotsContainer}>
        {images.map((_, idx) => (
          <View key={idx} style={[styles.dot, idx === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <ThemedView style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titlePriceContainer}>
            <ThemedText type="title" style={styles.title}>{product.name}</ThemedText>
            <ThemedText style={styles.price}>{formatPrice(lowestPrice)}</ThemedText>
          </View>
          <ShareButton
            url={getProductUrl()}
            title={product.name}
            description={product.description}
            type="product"
            compact={true}
          />
        </View>
        <ThemedText style={styles.description}>{product.description}</ThemedText>

        {/* Rating input */}
        <View style={styles.ratingRow}>
          {[1,2,3,4,5].map(i => (
            <TouchableOpacity key={i} onPress={() => setUserRating(i)}>
              <Star filled={i <= userRating} />
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          placeholder="Leave a comment..."
          placeholderTextColor="#9ca3af"
          value={comment}
          onChangeText={setComment}
          style={[styles.commentInput,{color:'#fff'}]}
          multiline
        />
        <TouchableOpacity style={styles.reviewButton} onPress={submitReview}>
          <ThemedText style={styles.reviewButtonText}>Submit Review</ThemedText>
        </TouchableOpacity>

        {/* Add to cart / Buy now */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cartBtn} onPress={handleAddToCart}>
            <ThemedText style={{color:'#fff'}}>Add to Cart</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buyNowBtn} onPress={handleBuyNow}>
            <ThemedText style={{color:'#fff'}}>Buy Now</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Existing reviews */}
        {ratings.length > 0 && (
          <ThemedView style={{ marginTop: 24 }}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Reviews</ThemedText>
            {ratings.map(r => (
              <View key={r.id} style={styles.reviewItem}>
                <View style={styles.ratingRow}>
                  {[1,2,3,4,5].map(i => <Star key={i} filled={i <= r.rating} />)}
                </View>
                {r.review ? <ThemedText>{r.review}</ThemedText> : null}
              </View>
            ))}
          </ThemedView>
        )}
      </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered:{flex:1,justifyContent:'center',alignItems:'center'},
  imageContainer:{width:width,height:300,overflow:'hidden'},
  image:{width:width,height:300,resizeMode:'contain'},
  dotsContainer:{flexDirection:'row',justifyContent:'center',marginVertical:8},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:'#ccc',marginHorizontal:3},
  dotActive:{backgroundColor:'#3b82f6'},
  content:{flex:1,padding:16},
  headerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8},
  titlePriceContainer:{flex:1},
  title:{fontSize:24,fontWeight:'600',marginBottom:4},
  price:{fontSize:18,fontWeight:'500',color:'#3b82f6',marginBottom:8},
  description:{fontSize:14,opacity:0.8,marginBottom:12},
  ratingRow:{flexDirection:'row',marginBottom:8},
  star:{fontSize:28,marginHorizontal:2},
  starFilled:{color:'#facc15'},
  starEmpty:{color:'#d1d5db'},
  commentInput:{borderWidth:1,borderColor:'#e5e7eb',borderRadius:8,padding:8,minHeight:60,textAlignVertical:'top'},
  reviewButton:{backgroundColor:'#3b82f6',padding:10,borderRadius:8,alignItems:'center',marginTop:8},
  reviewButtonText:{color:'#fff',fontWeight:'600'},
  actionRow:{flexDirection:'row',justifyContent:'space-between',marginTop:16},
  cartBtn:{flex:1,backgroundColor:'#6b7280',padding:12,borderRadius:8,alignItems:'center',marginRight:8},
  buyNowBtn:{flex:1,backgroundColor:'#22c55e',padding:12,borderRadius:8,alignItems:'center'},
  reviewItem:{borderBottomWidth:1,borderBottomColor:'#e5e7eb',paddingVertical:12},
}); 