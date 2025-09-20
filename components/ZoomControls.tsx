/**
 * ZoomControls Component
 * Provides zoom in/out controls for better mobile viewing
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '@/hooks/useResponsive';
import ResponsiveText from './ResponsiveText';

interface ZoomControlsProps {
  onZoomChange?: (zoomLevel: number) => void;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
  initialZoom?: number;
  style?: any;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomChange,
  minZoom = 0.5,
  maxZoom = 2.0,
  step = 0.1,
  initialZoom = 1.0,
  style,
}) => {
  const [zoomLevel, setZoomLevel] = useState(initialZoom);
  const [fadeAnim] = useState(new Animated.Value(1));
  const { isSmall, padding } = useResponsive();

  const handleZoomIn = () => {
    const newZoom = Math.min(maxZoom, zoomLevel + step);
    setZoomLevel(newZoom);
    onZoomChange?.(newZoom);
    animatePress();
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(minZoom, zoomLevel - step);
    setZoomLevel(newZoom);
    onZoomChange?.(newZoom);
    animatePress();
  };

  const handleReset = () => {
    setZoomLevel(1.0);
    onZoomChange?.(1.0);
    animatePress();
  };

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.5,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const zoomPercentage = Math.round(zoomLevel * 100);

  return (
    <Animated.View style={[
      styles.container,
      { opacity: fadeAnim },
      isSmall && styles.compactContainer,
      style,
    ]}>
      <TouchableOpacity
        style={[styles.button, isSmall && styles.compactButton]}
        onPress={handleZoomOut}
        disabled={zoomLevel <= minZoom}
      >
        <Ionicons 
          name="remove" 
          size={isSmall ? 18 : 20} 
          color={zoomLevel <= minZoom ? '#9ca3af' : '#374151'} 
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.zoomDisplay, isSmall && styles.compactZoomDisplay]}
        onPress={handleReset}
      >
        <ResponsiveText 
          variant={isSmall ? 'caption' : 'body'} 
          weight="600"
          color="#374151"
        >
          {zoomPercentage}%
        </ResponsiveText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, isSmall && styles.compactButton]}
        onPress={handleZoomIn}
        disabled={zoomLevel >= maxZoom}
      >
        <Ionicons 
          name="add" 
          size={isSmall ? 18 : 20} 
          color={zoomLevel >= maxZoom ? '#9ca3af' : '#374151'} 
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 25,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactContainer: {
    padding: 6,
    borderRadius: 20,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  compactButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 2,
  },
  zoomDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 16,
    marginHorizontal: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  compactZoomDisplay: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    minWidth: 50,
  },
});

export default ZoomControls;
