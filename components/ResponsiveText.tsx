/**
 * ResponsiveText Component
 * Text component that automatically scales based on screen size
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';

interface ResponsiveTextProps {
  children: React.ReactNode;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'small';
  style?: any;
  numberOfLines?: number;
  onPress?: () => void;
  color?: string;
  weight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  children,
  variant = 'body',
  style,
  numberOfLines,
  onPress,
  color = '#1f2937',
  weight = 'normal',
}) => {
  const { fonts } = useResponsive();

  const textStyle = [
    styles.base,
    {
      fontSize: fonts[variant],
      color,
      fontWeight: weight,
    },
    style,
  ];

  return (
    <Text
      style={textStyle}
      numberOfLines={numberOfLines}
      onPress={onPress}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});

export default ResponsiveText;
