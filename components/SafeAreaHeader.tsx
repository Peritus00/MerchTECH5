/**
 * SafeAreaHeader Component
 * Reusable header component with built-in safe area handling
 */

import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

interface SafeAreaHeaderProps {
  children?: ReactNode;
  showBackButton?: boolean;
  onBackPress?: () => void;
  backButtonColor?: string;
  backgroundColor?: string;
  minTopPadding?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

export default function SafeAreaHeader({
  children,
  showBackButton = false,
  onBackPress,
  backButtonColor = '#1f2937',
  backgroundColor = '#fff',
  minTopPadding = 12,
  style,
  contentStyle,
}: SafeAreaHeaderProps) {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, minTopPadding);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topPadding, backgroundColor },
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>
        {showBackButton && onBackPress && (
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={24} color={backButtonColor} />
          </TouchableOpacity>
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
});

