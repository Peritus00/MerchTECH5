import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';
import { ThemedText } from './ThemedText';

interface LogoOptions {
  // Existing base64 data URI (kept for backward compatibility)
  imageData?: string;
  // New S3 / remote URL for the logo image
  imageUrl?: string;
  // Optional S3 key for internal tracking
  s3Key?: string;
  size: number;
  borderRadius: number;
  borderSize: number;
  borderColor: string;
  opacity?: number;
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  padding?: number;
  whiteBackground?: boolean;
  contrastBorder?: boolean;
  maxSizePercent?: number;
  quietZone?: boolean;
}

interface GradientOptions {
  startColor: string;
  endColor: string;
  type: 'linear' | 'radial';
  angle?: number;
}

// Interface for ref methods
export interface QRCodeRef {
  getSVGString: () => Promise<string | null>;
  toDataURL: (callback: (dataURL: string) => void) => void;
}

interface AdvancedQRCodeGeneratorProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  level?: "L" | "M" | "Q" | "H";
  cornerRadius?: number;
  gradientColors?: GradientOptions;
  logoOptions?: LogoOptions;
  onPress?: () => void;
  optimizeForScanning?: boolean;
  contrastRatio?: number;
  getRef?: (ref: QRCodeRef | null) => void;
}

export const AdvancedQRCodeGenerator = forwardRef<QRCodeRef, AdvancedQRCodeGeneratorProps>(({
  value,
  size = 240,
  fgColor = '#000000',
  bgColor = '#FFFFFF',
  level = 'H',
  cornerRadius = 0,
  gradientColors,
  logoOptions,
  onPress,
  optimizeForScanning = true,
  contrastRatio = 4.5,
  getRef,
}, ref) => {
  // Convert base64 data URI to blob URL for web to avoid ERR_INVALID_URL errors
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);
  
  useEffect(() => {
    let blobUrl: string | null = null;
    setLogoLoadError(false);
    
    // Prefer remote logo URLs if provided (S3-backed or CDN)
    if (logoOptions?.imageUrl) {
      setLogoBlobUrl(null);
      return;
    }
    
    if (Platform.OS === 'web' && logoOptions?.imageData?.startsWith('data:')) {
      // Convert base64 data URI to blob URL for better web compatibility
      try {
        const parts = logoOptions.imageData.split(',');
        if (parts.length !== 2) {
          // Invalid data URI format, use original
          setLogoBlobUrl(null);
          return;
        }
        
        const base64Data = parts[1];
        if (!base64Data || base64Data.length === 0) {
          // Empty base64 data, use original
          setLogoBlobUrl(null);
          return;
        }
        
        // Validate base64 string (remove whitespace and check format)
        const cleanBase64 = base64Data.replace(/\s/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
          // Invalid base64 characters, use original
          console.warn('Invalid base64 characters detected, using data URI directly');
          setLogoBlobUrl(null);
          return;
        }
        
        // Try to decode base64; if this fails we'll fall back to using the original data URI
        let byteCharacters;
        try {
          byteCharacters = atob(cleanBase64);
        } catch (decodeError) {
          console.warn('Failed to decode base64 string, using data URI directly:', decodeError);
          setLogoBlobUrl(null);
          return;
        }
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Determine MIME type from data URI
        const mimeMatch = parts[0].match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        
        const blob = new Blob([byteArray], { type: mimeType });
        blobUrl = URL.createObjectURL(blob);
        setLogoBlobUrl(blobUrl);
      } catch (error) {
        // If blob URL creation fails, fall back to using data URI directly
        console.warn('Failed to create blob URL from base64, using data URI directly:', error);
        setLogoBlobUrl(null);
      }
    } else {
      setLogoBlobUrl(null);
    }
    
    // Cleanup blob URL on unmount or when imageData changes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [logoOptions?.imageData, logoOptions?.imageUrl]);
  const [qrData, setQrData] = useState<string>('https://example.com');
  const qrCodeSvgRef = useRef<any>(null);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getSVGString: async (): Promise<string | null> => {
      if (!qrCodeSvgRef.current) return null;
      
      try {
        let svgContent: string | null = null;

        // react-native-qrcode-svg has a getString method
        if (qrCodeSvgRef.current.getString) {
          svgContent = qrCodeSvgRef.current.getString();
        } else {
          // Fallback: try toDataURL and extract SVG
          svgContent = await new Promise((resolve) => {
            qrCodeSvgRef.current.toDataURL((dataURL: string) => {
              // If it's SVG data URL, extract the SVG content
              if (dataURL.startsWith('data:image/svg+xml')) {
                resolve(decodeURIComponent(dataURL.split(',')[1]));
              } else {
                resolve(null);
              }
            });
          });
        }

        // If we have SVG content and logo options, embed the logo
        if (svgContent && (logoOptions?.imageData || logoOptions?.imageUrl)) {
          const optimalLogoSize = calculateOptimalLogoSize();
          // Assuming square QR code and center position for now (most common)
          // SVG viewBox is usually equivalent to size prop in react-native-qrcode-svg
          const x = (size - optimalLogoSize) / 2;
          const y = (size - optimalLogoSize) / 2;
          
          let href = logoOptions.imageData;
          // Prefer imageUrl if imageData is missing or invalid
          if (!href && logoOptions.imageUrl) {
             href = logoOptions.imageUrl;
          }
          
          if (href) {
             // Create an image tag
             // Note: We use both href and xlink:href for compatibility
             const imageTag = `<image x="${x}" y="${y}" width="${optimalLogoSize}" height="${optimalLogoSize}" href="${href}" xlink:href="${href}" preserveAspectRatio="xMidYMid slice" />`;
             
             // Check if xmlns:xlink is present, if not add it to svg tag
             if (!svgContent.includes('xmlns:xlink')) {
               svgContent = svgContent.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
             }
             
             // Insert image before closing svg tag
             svgContent = svgContent.replace('</svg>', `${imageTag}</svg>`);
          }
        }
        
        return svgContent;
      } catch (error) {
        console.error('Error getting SVG string:', error);
        return null;
      }
    },
    toDataURL: (callback: (dataURL: string) => void) => {
      if (qrCodeSvgRef.current && qrCodeSvgRef.current.toDataURL) {
        qrCodeSvgRef.current.toDataURL(callback);
      }
    },
  }));

  // Call getRef prop if provided
  useEffect(() => {
    if (getRef && ref && typeof ref === 'object' && 'current' in ref) {
      getRef(ref.current);
    }
  }, [getRef, ref]);

  useEffect(() => {
    generateQRCode();
  }, [value, size, fgColor, bgColor, level, cornerRadius, gradientColors, logoOptions]);

  const generateQRCode = async () => {
    try {
      // For React Native, we'll use the SVG approach with overlays
      const newQrData = value && value.trim() ? value.trim() : 'https://example.com';
      setQrData(newQrData);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const calculateOptimalLogoSize = (): number => {
    if (!logoOptions) return 0;
    
    const baseSize = logoOptions.size || Math.floor(size * 0.2);
    
    if (!optimizeForScanning) return baseSize;
    
    const maxSizePercents = {
      'L': 0.07,
      'M': 0.15,
      'Q': 0.25,
      'H': 0.30
    };
    
    const maxPercent = logoOptions.maxSizePercent || maxSizePercents[level];
    const maxSize = size * maxPercent;
    
    return Math.min(baseSize, maxSize);
  };

  const optimizeColors = () => {
    if (!optimizeForScanning) return { fg: fgColor, bg: bgColor };
    
    if (gradientColors) {
      const startLuminance = getLuminance(gradientColors.startColor);
      const endLuminance = getLuminance(gradientColors.endColor);
      const bgLuminance = getLuminance(bgColor);
      
      if (Math.min(startLuminance, endLuminance) / bgLuminance < contrastRatio) {
        console.warn('🔍 QR Code: Low contrast detected, consider adjusting colors for better scanning');
      }
    }
    
    return { fg: fgColor, bg: bgColor };
  };

  const getLuminance = (color: string): number => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const rsRGB = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gsRGB = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bsRGB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
  };

  const renderLogo = () => {
    // Render logo if we have either imageData (database) or imageUrl (S3)
    if (!logoOptions?.imageData && !logoOptions?.imageUrl) return null;

    const optimalLogoSize = calculateOptimalLogoSize();
    const borderSize = logoOptions.borderSize || 8;
    const borderRadius = logoOptions.borderRadius || 0;
    const borderColor = logoOptions.contrastBorder ? '#FFFFFF' : (logoOptions.borderColor || '#FFFFFF');
    const opacity = logoOptions.opacity !== undefined ? logoOptions.opacity : 1;
    const position = logoOptions.position || 'center';
    const padding = logoOptions.padding || 10;

    const enhancedBorderSize = optimizeForScanning ? Math.max(borderSize, 6) : borderSize;
    const totalSize = optimalLogoSize + (enhancedBorderSize * 2);

    let positionStyle: any = {};
    switch (position) {
      case 'top-left':
        positionStyle = { top: padding, left: padding };
        break;
      case 'top-right':
        positionStyle = { top: padding, right: padding };
        break;
      case 'bottom-left':
        positionStyle = { bottom: padding, left: padding };
        break;
      case 'bottom-right':
        positionStyle = { bottom: padding, right: padding };
        break;
      case 'center':
      default:
        positionStyle = {
          top: '50%',
          left: '50%',
          marginTop: -totalSize / 2,
          marginLeft: -totalSize / 2,
        };
    }

    return (
      <View
        style={[
          styles.logoContainer,
          {
            width: totalSize,
            height: totalSize,
            backgroundColor: borderColor,
            borderRadius: borderRadius + enhancedBorderSize,
            opacity,
            ...positionStyle,
            ...(optimizeForScanning && {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 2,
              elevation: 3,
            }),
          },
        ]}
      >
        {(optimizeForScanning || logoOptions.whiteBackground) && (
          <View
            style={[
              styles.logoWhiteBackground,
              {
                width: totalSize - 2,
                height: totalSize - 2,
                borderRadius: borderRadius + enhancedBorderSize - 1,
                backgroundColor: '#FFFFFF',
                position: 'absolute',
                top: 1,
                left: 1,
              },
            ]}
          />
        )}
        
        <View
          style={[
            styles.logoInner,
            {
              width: optimalLogoSize,
              height: optimalLogoSize,
              borderRadius,
              backgroundColor: logoOptions.whiteBackground !== false ? '#FFFFFF' : 'transparent',
            },
          ]}
        >
          {logoOptions.imageData || logoOptions.imageUrl ? (
            (() => {
              // Check if imageData is truncated (common issue: exactly 10000 chars suggests truncation)
              const isImageDataTruncated = logoOptions.imageData && 
                (logoOptions.imageData.length === 10000 || 
                 (logoOptions.imageData.includes(',') && logoOptions.imageData.split(',')[1]?.length === 10000));
              
              // ALWAYS prefer S3 / remote URL if provided (unless it already failed)
              // S3 URLs are more reliable than base64 data URIs
              let imageUri: string | null = (!logoLoadError && logoOptions.imageUrl) 
                ? logoOptions.imageUrl 
                : null;

              // Only use imageData as fallback if:
              // 1. We don't have a remote URL (or it failed)
              // 2. imageData is not truncated
              // 3. imageData is valid
              if (!imageUri && logoOptions.imageData && !isImageDataTruncated) {
                const isValidDataUri = logoOptions.imageData.startsWith('data:') && 
                  logoOptions.imageData.includes(',') &&
                  logoOptions.imageData.split(',')[1]?.length > 0;
                
                // Validate base64 completeness - check if it ends properly (base64 padding)
                const base64Part = logoOptions.imageData.split(',')[1];
                const isBase64Complete = base64Part && (
                  base64Part.length % 4 === 0 || // Base64 should be multiple of 4
                  base64Part.match(/^[A-Za-z0-9+/]*={0,2}$/) // Valid base64 with proper padding
                );
                
                // Use blob URL if available, otherwise use data URI directly when valid and complete
                if (isValidDataUri && isBase64Complete) {
                  imageUri = Platform.OS === 'web' && logoBlobUrl 
                    ? logoBlobUrl 
                    : logoOptions.imageData;
                } else {
                  // Invalid base64, skip imageData
                  if (logoOptions.imageUrl) {
                    console.warn('⚠️ QR Logo imageData invalid, using S3 URL instead');
                    imageUri = logoOptions.imageUrl;
                  }
                }
              } else if (isImageDataTruncated && logoOptions.imageUrl) {
                // If imageData is truncated but we have S3 URL, use that
                console.warn('⚠️ QR Logo imageData truncated, using S3 URL instead');
                imageUri = logoOptions.imageUrl;
              }
              
              if (!imageUri) {
                // Invalid or missing image data, show fallback
                return (
                  <ThemedText style={{ fontSize: 12, textAlign: 'center' }}>
                    LOGO
                  </ThemedText>
                );
              }
              
              return (
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    width: optimalLogoSize,
                    height: optimalLogoSize,
                    borderRadius,
                  }}
                  resizeMode="contain"
                  onError={(error) => {
                    // If S3 URL failed and we have imageData, try that as fallback (silently)
                    if (!logoLoadError && logoOptions.imageUrl && imageUri === logoOptions.imageUrl && logoOptions.imageData) {
                      setLogoLoadError(true);
                      return; // Will trigger re-render with imageData
                    }
                    // If imageData failed and we have S3 URL, try that as fallback (silently)
                    if (!logoLoadError && logoOptions.imageData && imageUri !== logoOptions.imageUrl && logoOptions.imageUrl) {
                      setLogoLoadError(true);
                      return; // Will trigger re-render with S3 URL
                    }
                    // Only log error if we've exhausted all options (both failed)
                    // This prevents spam when component is trying alternatives
                    if (logoLoadError) {
                      // Both sources failed, but only log once per component instance
                      return;
                    }
                    // First failure - set error state but don't log yet (might recover)
                    setLogoLoadError(true);
                  }}
                />
              );
            })()
          ) : (
            <ThemedText style={{ fontSize: 12, textAlign: 'center' }}>
              LOGO
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  const renderQuietZone = () => {
    if (!optimizeForScanning || !logoOptions?.quietZone) return null;
    
    const quietZoneSize = Math.floor(size * 0.1);
    
    return (
      <View
        style={[
          styles.quietZone,
          {
            width: size + (quietZoneSize * 2),
            height: size + (quietZoneSize * 2),
            backgroundColor: bgColor,
            position: 'absolute',
            top: -quietZoneSize,
            left: -quietZoneSize,
            zIndex: -1,
          },
        ]}
      />
    );
  };

  const colors = optimizeColors();
  
  const qrProps = {
    value: qrData || 'https://example.com',
    size: size,
    color: colors.fg,
    backgroundColor: colors.bg,
    ecl: level,
    enableLinearGradient: !!gradientColors,
    getRef: (c: any) => {
      qrCodeSvgRef.current = c;
    },
    ...(gradientColors && {
      linearGradient: [gradientColors.startColor, gradientColors.endColor],
      gradientDirection: gradientColors.angle ? [
        Math.cos((gradientColors.angle * Math.PI) / 180),
        Math.sin((gradientColors.angle * Math.PI) / 180),
        Math.cos(((gradientColors.angle + 180) * Math.PI) / 180),
        Math.sin(((gradientColors.angle + 180) * Math.PI) / 180),
      ] : ['0%', '0%', '100%', '100%'],
    }),
  };

  return (
    <View 
      style={[styles.container, { width: size, height: size }]}
      collapsable={false}
    >
      {renderQuietZone()}
      <View
        style={[
          styles.qrWrapper,
          {
            width: size,
            height: size,
            backgroundColor: colors.bg,
            borderRadius: cornerRadius,
          },
        ]}
        collapsable={false}
      >
        <QRCodeSVG {...qrProps} />
        {renderLogo()}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  qrWrapper: {
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  logoWhiteBackground: {
    position: 'absolute',
  },
  logoInner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
  quietZone: {
    position: 'absolute',
  },
});

AdvancedQRCodeGenerator.displayName = 'AdvancedQRCodeGenerator';

export default AdvancedQRCodeGenerator; 