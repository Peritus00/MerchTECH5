/**
 * Responsive Design Utilities
 * Provides consistent scaling and responsive behavior across different screen sizes
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Design reference dimensions (based on typical mobile design)
const REFERENCE_WIDTH = 375; // iPhone X/11/12 width
const REFERENCE_HEIGHT = 812; // iPhone X/11/12 height

// Screen size categories
export const SCREEN_SIZES = {
  SMALL: 'small',   // < 375px width
  MEDIUM: 'medium', // 375px - 414px width  
  LARGE: 'large',   // > 414px width
  TABLET: 'tablet'  // > 768px width
} as const;

export type ScreenSize = typeof SCREEN_SIZES[keyof typeof SCREEN_SIZES];

/**
 * Get current screen size category
 */
export const getScreenSize = (): ScreenSize => {
  if (SCREEN_WIDTH < 375) return SCREEN_SIZES.SMALL;
  if (SCREEN_WIDTH <= 414) return SCREEN_SIZES.MEDIUM;
  if (SCREEN_WIDTH > 768) return SCREEN_SIZES.TABLET;
  return SCREEN_SIZES.LARGE;
};

/**
 * Check if device is a tablet
 */
export const isTablet = (): boolean => {
  return getScreenSize() === SCREEN_SIZES.TABLET;
};

/**
 * Check if device is small screen
 */
export const isSmallScreen = (): boolean => {
  return getScreenSize() === SCREEN_SIZES.SMALL;
};

/**
 * Scale size based on screen width
 */
export const scaleWidth = (size: number): number => {
  const scale = SCREEN_WIDTH / REFERENCE_WIDTH;
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
};

/**
 * Scale size based on screen height
 */
export const scaleHeight = (size: number): number => {
  const scale = SCREEN_HEIGHT / REFERENCE_HEIGHT;
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
};

/**
 * Scale font size responsively
 */
export const scaleFontSize = (size: number): number => {
  const scale = Math.min(SCREEN_WIDTH / REFERENCE_WIDTH, SCREEN_HEIGHT / REFERENCE_HEIGHT);
  const scaledSize = size * scale;
  
  // Ensure minimum readability
  return Math.max(scaledSize, size * 0.8);
};

/**
 * Get responsive padding based on screen size
 */
export const getResponsivePadding = () => {
  const screenSize = getScreenSize();
  
  switch (screenSize) {
    case SCREEN_SIZES.SMALL:
      return { horizontal: 12, vertical: 8 };
    case SCREEN_SIZES.MEDIUM:
      return { horizontal: 16, vertical: 12 };
    case SCREEN_SIZES.LARGE:
      return { horizontal: 20, vertical: 16 };
    case SCREEN_SIZES.TABLET:
      return { horizontal: 24, vertical: 20 };
    default:
      return { horizontal: 16, vertical: 12 };
  }
};

/**
 * Get responsive margins based on screen size
 */
export const getResponsiveMargin = () => {
  const screenSize = getScreenSize();
  
  switch (screenSize) {
    case SCREEN_SIZES.SMALL:
      return { horizontal: 8, vertical: 6 };
    case SCREEN_SIZES.MEDIUM:
      return { horizontal: 12, vertical: 8 };
    case SCREEN_SIZES.LARGE:
      return { horizontal: 16, vertical: 12 };
    case SCREEN_SIZES.TABLET:
      return { horizontal: 20, vertical: 16 };
    default:
      return { horizontal: 12, vertical: 8 };
  }
};

/**
 * Get responsive grid columns based on screen size
 */
export const getGridColumns = (minItemWidth: number = 150): number => {
  const padding = getResponsivePadding();
  const availableWidth = SCREEN_WIDTH - (padding.horizontal * 2);
  const columns = Math.floor(availableWidth / minItemWidth);
  return Math.max(1, Math.min(columns, isTablet() ? 4 : 2));
};

/**
 * Get responsive card width for grid layouts
 */
export const getCardWidth = (columns: number = 2, gap: number = 12): number => {
  const padding = getResponsivePadding();
  const availableWidth = SCREEN_WIDTH - (padding.horizontal * 2);
  const totalGaps = (columns - 1) * gap;
  return (availableWidth - totalGaps) / columns;
};

/**
 * Get responsive header height
 */
export const getHeaderHeight = (): number => {
  const screenSize = getScreenSize();
  const statusBarHeight = Platform.OS === 'ios' ? 44 : 24;
  
  switch (screenSize) {
    case SCREEN_SIZES.SMALL:
      return statusBarHeight + 50;
    case SCREEN_SIZES.MEDIUM:
      return statusBarHeight + 56;
    case SCREEN_SIZES.LARGE:
      return statusBarHeight + 60;
    case SCREEN_SIZES.TABLET:
      return statusBarHeight + 64;
    default:
      return statusBarHeight + 56;
  }
};

/**
 * Get responsive font sizes for different text types
 */
export const getFontSizes = () => {
  const screenSize = getScreenSize();
  
  const baseSizes = {
    [SCREEN_SIZES.SMALL]: {
      h1: 24,
      h2: 20,
      h3: 18,
      h4: 16,
      body: 14,
      caption: 12,
      small: 10,
    },
    [SCREEN_SIZES.MEDIUM]: {
      h1: 28,
      h2: 24,
      h3: 20,
      h4: 18,
      body: 16,
      caption: 14,
      small: 12,
    },
    [SCREEN_SIZES.LARGE]: {
      h1: 32,
      h2: 28,
      h3: 24,
      h4: 20,
      body: 18,
      caption: 16,
      small: 14,
    },
    [SCREEN_SIZES.TABLET]: {
      h1: 36,
      h2: 32,
      h3: 28,
      h4: 24,
      body: 20,
      caption: 18,
      small: 16,
    },
  };
  
  return baseSizes[screenSize] || baseSizes[SCREEN_SIZES.MEDIUM];
};

/**
 * Screen dimension utilities
 */
export const screen = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: isSmallScreen(),
  isTablet: isTablet(),
  size: getScreenSize(),
  padding: getResponsivePadding(),
  margin: getResponsiveMargin(),
  fonts: getFontSizes(),
};

/**
 * Responsive style helpers
 */
export const responsive = {
  width: scaleWidth,
  height: scaleHeight,
  font: scaleFontSize,
  padding: getResponsivePadding,
  margin: getResponsiveMargin,
  columns: getGridColumns,
  cardWidth: getCardWidth,
  headerHeight: getHeaderHeight,
};
