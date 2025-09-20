/**
 * useResponsive Hook
 * Provides responsive design values and utilities
 */

import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { screen, responsive, getScreenSize, isTablet, isSmallScreen } from '@/utils/responsive';

export const useResponsive = () => {
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    
    return () => subscription?.remove();
  }, []);
  
  return {
    // Screen info
    width: dimensions.width,
    height: dimensions.height,
    isSmall: dimensions.width < 375,
    isMedium: dimensions.width >= 375 && dimensions.width <= 414,
    isLarge: dimensions.width > 414 && dimensions.width <= 768,
    isTablet: dimensions.width > 768,
    screenSize: getScreenSize(),
    
    // Responsive utilities
    scaleWidth: responsive.width,
    scaleHeight: responsive.height,
    scaleFont: responsive.font,
    
    // Layout helpers
    padding: responsive.padding(),
    margin: responsive.margin(),
    fonts: screen.fonts,
    
    // Grid helpers
    getColumns: (minWidth = 150) => responsive.columns(minWidth),
    getCardWidth: (cols = 2, gap = 12) => responsive.cardWidth(cols, gap),
    
    // Header height
    headerHeight: responsive.headerHeight(),
  };
};

export default useResponsive;
