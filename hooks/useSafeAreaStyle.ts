/**
 * useSafeAreaStyle Hook
 * Provides safe area style utilities for consistent safe area handling
 */

import { useSafeAreaInsets as useSafeAreaInsetsHook } from 'react-native-safe-area-context';
import { ViewStyle } from 'react-native';

interface SafeAreaStyles {
  headerPadding: ViewStyle;
  headerPaddingWithLogo: ViewStyle;
  containerPadding: ViewStyle;
  bottomPadding: ViewStyle;
  fullSafeArea: ViewStyle;
}

/**
 * Hook that provides safe area styles for common use cases
 * @param minTopPadding - Minimum top padding for devices without notches (default: 12)
 * @param minBottomPadding - Minimum bottom padding for devices without home indicators (default: 12)
 * @returns Object containing common safe area styles
 */
export const useSafeAreaStyle = (
  minTopPadding: number = 12,
  minBottomPadding: number = 12
): SafeAreaStyles => {
  const insets = useSafeAreaInsetsHook();

  return {
    // Standard header padding (for most headers)
    headerPadding: {
      paddingTop: Math.max(insets.top, minTopPadding),
    },
    // Header padding with logo (needs extra space to avoid camera notch)
    headerPaddingWithLogo: {
      paddingTop: Math.max(insets.top, 20),
    },
    // Container padding (for full-screen containers)
    containerPadding: {
      paddingTop: Math.max(insets.top, minTopPadding),
      paddingBottom: Math.max(insets.bottom, minBottomPadding),
    },
    // Bottom padding only (for fixed bottom elements)
    bottomPadding: {
      paddingBottom: Math.max(insets.bottom, minBottomPadding),
    },
    // Full safe area padding (top, bottom, left, right)
    fullSafeArea: {
      paddingTop: Math.max(insets.top, minTopPadding),
      paddingBottom: Math.max(insets.bottom, minBottomPadding),
      paddingLeft: Math.max(insets.left, 0),
      paddingRight: Math.max(insets.right, 0),
    },
  };
};

export default useSafeAreaStyle;

