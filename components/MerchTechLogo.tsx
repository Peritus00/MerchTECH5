import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';

interface MerchTechLogoProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  variant?: 'full' | 'icon' | 'text';
  style?: any;
  showText?: boolean;
}

export const MerchTechLogo: React.FC<MerchTechLogoProps> = ({
  size = 'medium',
  variant = 'full',
  style,
  showText = true,
}) => {
  const getSizes = () => {
    switch (size) {
      case 'small':
        return { iconSize: 32, fontSize: 14, containerHeight: showText ? 48 : 32, spacing: 4 };
      case 'medium':
        return { iconSize: 48, fontSize: 18, containerHeight: showText ? 72 : 48, spacing: 8 };
      case 'large':
        return { iconSize: 64, fontSize: 24, containerHeight: showText ? 96 : 64, spacing: 12 };
      case 'xlarge':
        return { iconSize: 80, fontSize: 32, containerHeight: showText ? 120 : 80, spacing: 16 };
      default:
        return { iconSize: 48, fontSize: 18, containerHeight: showText ? 72 : 48, spacing: 8 };
    }
  };

  const { iconSize, fontSize, containerHeight, spacing } = getSizes();

  const renderIcon = () => {
    try {
      return (
        <Image
          source={require('../assets/images/merchtechlogogoldnoBgColor.png')}
          style={[styles.logoImage, { width: iconSize, height: iconSize }]}
          resizeMode="contain"
        />
      );
    } catch (error) {
      // Fallback: Simple golden eagle-style icon until actual logo is added
      return (
        <View style={[styles.fallbackContainer, { width: iconSize, height: iconSize }]}>
          <Text style={[styles.fallbackIcon, { fontSize: iconSize * 0.6 }]}>🦅</Text>
        </View>
      );
    }
  };

  const renderText = () => (
    <Text style={[styles.logoText, { fontSize }]}>
      MERCHTECH
    </Text>
  );

  if (variant === 'icon') {
    return (
      <View style={[styles.container, { height: iconSize }, style]}>
        {renderIcon()}
      </View>
    );
  }

  if (variant === 'text') {
    return (
      <View style={[styles.container, { height: fontSize + 8 }, style]}>
        {renderText()}
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.fullContainer, { height: containerHeight, gap: spacing }, style]}>
      {renderIcon()}
      {showText && renderText()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  logoImage: {
    // Your beautiful golden eagle logo will maintain its aspect ratio
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 8,
  },
  fallbackIcon: {
    color: '#FFD700',
  },
  logoText: {
    fontWeight: 'bold',
    letterSpacing: 3,
    textAlign: 'center',
    color: '#FFD700',
  },
});

export default MerchTechLogo; 