import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';
import { ThemedText } from './ThemedText';

interface LogoOptions {
  imageData?: string;
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
}

export const AdvancedQRCodeGenerator: React.FC<AdvancedQRCodeGeneratorProps> = ({
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
}) => {
  const [qrData, setQrData] = useState<string>('https://example.com');

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
    if (!logoOptions?.imageData) return null;

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
          {logoOptions.imageData ? (
            <Image
              source={{ uri: logoOptions.imageData }}
              style={{
                width: optimalLogoSize,
                height: optimalLogoSize,
                borderRadius,
              }}
              resizeMode="contain"
            />
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
      
      {optimizeForScanning && logoOptions?.imageData && (
        <View style={styles.optimizationIndicator}>
          <ThemedText style={styles.optimizationText}>📱 Scan Optimized</ThemedText>
        </View>
      )}
    </View>
  );
};

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
  optimizationIndicator: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  optimizationText: {
    fontSize: 8,
    color: '#10B981',
    fontWeight: '600',
  },
});

export default AdvancedQRCodeGenerator; 