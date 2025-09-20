/**
 * ResponsiveContainer Component
 * Provides responsive layout container with proper scaling
 */

import React from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: any;
  contentContainerStyle?: any;
  padding?: boolean;
  backgroundColor?: string;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  padding = true,
  backgroundColor = '#f8fafc',
}) => {
  const { padding: responsivePadding, width, isTablet } = useResponsive();

  const containerStyle = [
    styles.container,
    { backgroundColor },
    style,
  ];

  const contentStyle = [
    padding && {
      paddingHorizontal: responsivePadding.horizontal,
      paddingVertical: responsivePadding.vertical,
    },
    // Center content on tablets
    isTablet && {
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },
    contentContainerStyle,
  ];

  if (scrollable) {
    return (
      <ScrollView
        style={containerStyle}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        bounces={Platform.OS === 'ios'}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[containerStyle, contentStyle]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default ResponsiveContainer;
