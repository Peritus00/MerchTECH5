import React, { useState, useEffect } from 'react';
import { Image, ImageProps, Platform, View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { env } from '@/config/environment';

interface MobileCompatibleImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  fallbackUri?: string;
  showErrorIcon?: boolean;
  errorText?: string;
}

/**
 * Enhanced Image component with mobile-specific optimizations
 * Handles image loading errors, HTTPS enforcement, and mobile compatibility
 */
export const MobileCompatibleImage: React.FC<MobileCompatibleImageProps> = ({
  uri,
  fallbackUri = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="Arial, Helvetica, sans-serif" font-size="18">No Image</text></svg>',
  showErrorIcon = true,
  errorText = 'Image not available',
  style,
  onError,
  ...props
}) => {
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2;

  // Reset state when URI changes
  useEffect(() => {
    setImageLoaded(false);
    setImageLoadError(false);
    setRetryCount(0);
  }, [uri]);

  // Enhanced image source handling for mobile devices
  const getImageSource = () => {
    let imageUrl = uri;
    
    console.log(`🖼️ MobileCompatibleImage [${Platform.OS}]: Original URI:`, uri);
    
    if (imageLoadError || !imageUrl) {
      console.log(`🖼️ MobileCompatibleImage [${Platform.OS}]: Using fallback (error: ${imageLoadError})`);
      imageUrl = fallbackUri;
    }
    
    // If the image is a data/blob/file URL, use it as-is (don't proxy)
    const isDataLikeUrl = /^data:|^blob:|^file:/i.test(imageUrl);

    // Normalize relative or scheme-less URLs using API origin (strip trailing /api)
    if (imageUrl && !imageUrl.startsWith('http') && !isDataLikeUrl) {
      const apiBase = env.apiBaseUrl?.replace(/\/$/, '') || '';
      const apiOrigin = apiBase.replace(/\/api$/, '');
      console.log(`🖼️ MobileCompatibleImage [${Platform.OS}]: API origin:`, apiOrigin);
      
      if (imageUrl.startsWith('/')) {
        imageUrl = `${apiOrigin}${imageUrl}`;
      } else {
        // Assume S3 key or bare path: route via proxy endpoint
        imageUrl = `${apiOrigin}/api/images/s3/${imageUrl}`;
      }
    }

    // Ensure HTTPS for all platforms (mobile requires HTTPS)
    if (imageUrl.startsWith('http://')) {
      console.log(`🖼️ MobileCompatibleImage [${Platform.OS}]: Converting HTTP to HTTPS`);
      imageUrl = imageUrl.replace('http://', 'https://');
    }

    console.log(`🖼️ MobileCompatibleImage [${Platform.OS}]: Final URL:`, imageUrl);

    // For mobile devices, use simple URI without custom headers
    // Custom headers can cause CORS issues on mobile
    if (Platform.OS !== 'web') {
      return {
        uri: imageUrl
      };
    }
    
    // Web can use the URL directly
    return { uri: imageUrl };
  };

  const handleImageError = (error: any) => {
    console.log('🖼️ MobileCompatibleImage error:', {
      uri,
      error: error.nativeEvent?.error || error,
      platform: Platform.OS,
      retryCount
    });
    
    // Call original onError if provided
    if (onError) {
      onError(error);
    }
    
    // For web, be more lenient - only show error after retries
    if (Platform.OS === 'web') {
      if (retryCount < maxRetries) {
        console.log(`🔄 MobileCompatibleImage [web]: Retrying image load (${retryCount + 1}/${maxRetries})`);
        setRetryCount(prev => prev + 1);
        // Small delay before retry
        setTimeout(() => {
          setImageLoadError(false);
        }, 500);
      } else {
        setImageLoadError(true);
      }
    } else {
      // Retry logic for native mobile devices
      if (retryCount < maxRetries) {
        console.log(`🔄 MobileCompatibleImage: Retrying image load (${retryCount + 1}/${maxRetries})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          setImageLoadError(false);
        }, 1000);
      } else {
        setImageLoadError(true);
      }
    }
  };

  // If we've exhausted retries and still have errors, show error state
  if (imageLoadError && retryCount >= maxRetries && showErrorIcon) {
    return (
      <View style={[styles.errorContainer, style]}>
        <MaterialIcons name="broken-image" size={48} color="#9ca3af" />
        <Text style={styles.errorText}>{errorText}</Text>
      </View>
    );
  }

  // For web platform, use native img tag for better mobile browser compatibility
  if (Platform.OS === 'web') {
    const imageSource = getImageSource();
    const imageUrl = typeof imageSource === 'object' && 'uri' in imageSource ? imageSource.uri : '';
    
    return (
      <View style={[styles.imageWrapper, style]}>
        {!imageLoaded && (
          <View style={styles.loadingContainer}>
            <MaterialIcons name="image" size={48} color="#d1d5db" />
          </View>
        )}
        <img
          key={imageUrl} // Force reload when URL changes
          src={imageUrl}
          alt="" // Empty alt text to prevent "Image not available" text from showing while loading
          style={{
            width: '100%',
            height: '100%',
            objectFit: props.resizeMode || 'cover',
            backgroundColor: '#f3f4f6',
            display: imageLoaded ? 'block' : 'none', // Hide until loaded
          }}
          onError={(e) => {
            console.error('🖼️ MobileCompatibleImage [web]: Image failed to load:', imageUrl);
            setImageLoaded(false);
            handleImageError(e as any);
          }}
          onLoad={() => {
            console.log('✅ MobileCompatibleImage [web]: Image loaded successfully:', imageUrl);
            setImageLoaded(true);
          }}
        />
      </View>
    );
  }

  // For native mobile apps, use React Native Image component
  return (
    <Image
      {...props}
      source={getImageSource()}
      style={[styles.image, style]}
      onError={handleImageError}
      defaultSource={{ uri: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="Arial, Helvetica, sans-serif" font-size="18">Loading…</text></svg>' }}
      resizeMode={props.resizeMode || 'cover'}
    />
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#f3f4f6', // Light gray background while loading
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    zIndex: 1,
  },
  errorContainer: {
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default MobileCompatibleImage;
