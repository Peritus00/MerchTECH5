import React, { useState } from 'react';
import { Image, ImageProps, Platform, View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
  fallbackUri = 'https://placehold.co/300x300?text=No+Image',
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
    
    // For mobile devices, ensure proper image loading
    if (Platform.OS !== 'web') {
      // Ensure HTTPS for mobile compatibility
      const processedUrl = imageUrl.startsWith('http://') 
        ? imageUrl.replace('http://', 'https://') 
        : imageUrl;
      
      return {
        uri: processedUrl,
        cache: 'force-cache', // Enable caching for better performance
        headers: {
          'Accept': 'image/*',
          'User-Agent': `MerchTech-Mobile/${Platform.OS}`,
        }
      };
    }
    
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
      defaultSource={{ uri: 'https://placehold.co/300x300?text=Loading' }}
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
