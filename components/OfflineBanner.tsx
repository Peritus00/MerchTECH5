/**
 * Small banner shown when device is offline or reconnecting.
 * Part of offline-aware UX for weak connectivity.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '@/contexts/NetworkContext';

export function OfflineBanner() {
  const { isOnline, isReconnecting } = useNetwork();
  const insets = useSafeAreaInsets();

  if (isOnline && !isReconnecting) return null;

  return (
    <View style={[styles.banner, { top: insets.top }]}>
      <MaterialIcons
        name={isReconnecting ? 'sync' : 'cloud-off'}
        size={18}
        color="#fff"
      />
      <Text style={styles.text}>
        {isReconnecting
          ? 'Reconnecting...'
          : 'You\'re offline. Showing last synced data.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#6b7280',
  },
  text: {
    color: '#fff',
    fontSize: 13,
  },
});
