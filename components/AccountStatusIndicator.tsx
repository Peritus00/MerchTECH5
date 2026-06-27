import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

interface AccountStatusIndicatorProps {
  color?: string;
  compact?: boolean;
  style?: ViewStyle;
}

export function AccountStatusIndicator({
  color = '#374151',
  compact = false,
  style,
}: AccountStatusIndicatorProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading && !user) {
    return null;
  }

  const displayName = user?.username || user?.firstName || user?.email || 'Account';
  const label = isAuthenticated ? displayName : 'Sign in';
  const accessibilityLabel = isAuthenticated
    ? `Signed in as ${displayName}. Open profile menu`
    : 'Sign in';

  const handlePress = () => {
    router.push(isAuthenticated ? '/settings/profile' : '/auth/login');
  };

  return (
    <TouchableOpacity
      style={[styles.container, compact && styles.compactContainer, style]}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialIcons
        name={isAuthenticated ? 'account-circle' : 'login'}
        size={compact ? 14 : 16}
        color={color}
      />
      <Text
        style={[styles.label, compact && styles.compactLabel, { color }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  compactContainer: {
    maxWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  compactLabel: {
    fontSize: 12,
  },
});
