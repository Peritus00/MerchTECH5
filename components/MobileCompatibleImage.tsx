import React, { useState } from 'react';
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
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2;

  // Enhanced image source handling for mobile devices
  const getImageSource = () => {
    let imageUrl = uri;
    
    if (imageLoadError || !imageUrl) {
      imageUrl = fallbackUri;
    }
    
    // If the image is a data/blob/file URL, use it as-is (don't proxy)
    const isDataLikeUrl = /^data:|^blob:|^file:/i.test(imageUrl);

    // Normalize relative or scheme-less URLs using API origin (strip trailing /api)
    if (imageUrl && !imageUrl.startsWith('http') && !isDataLikeUrl) {
      const apiBase = env.apiBaseUrl?.replace(/\/$/, '') || '';
      const apiOrigin = apiBase.replace(/\/api$/, '');
      if (imageUrl.startsWith('/')) {
        imageUrl = `${apiOrigin}${imageUrl}`;
      } else {
        // Assume S3 key or bare path: route via proxy endpoint
        imageUrl = `${apiOrigin}/api/images/s3/${imageUrl}`;
      }
    }

    // Ensure HTTPS for all platforms (mobile requires HTTPS)
    if (imageUrl.startsWith('http://')) {
      imageUrl = imageUrl.replace('http://', 'https://');
    }

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
    
    // Retry logic for mobile devices
    if (retryCount < maxRetries && Platform.OS !== 'web') {
      console.log(`🔄 MobileCompatibleImage: Retrying image load (${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      // Force re-render with a small delay
      setTimeout(() => {
        setImageLoadError(false);
      }, 1000);
    } else {
      setImageLoadError(true);
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
