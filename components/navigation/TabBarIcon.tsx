import Ionicons from '@expo/vector-icons/Ionicons';
import { type IconProps } from '@expo/vector-icons/build/createIconSet';
import { type ComponentProps } from 'react';
import { Platform, Text } from 'react-native';

// Web fallback icons using Unicode symbols
const WEB_ICON_MAP: Record<string, string> = {
  'home': '🏠',
  'home-outline': '🏠',
  'play-circle': '▶️',
  'play-circle-outline': '▶️',
  'musical-notes': '🎵',
  'musical-notes-outline': '🎵',
  'images': '🖼️',
  'images-outline': '🖼️',
  'qr-code': '📱',
  'qr-code-outline': '📱',
  'key': '🔑',
  'key-outline': '🔑',
  'storefront': '🏪',
  'storefront-outline': '🏪',
  'receipt': '🧾',
  'receipt-outline': '🧾',
  'bar-chart': '📊',
  'bar-chart-outline': '📊',
  'library': '📚',
  'library-outline': '📚',
  'settings': '⚙️',
  'settings-outline': '⚙️',
};

export function TabBarIcon({ style, name, ...rest }: IconProps<ComponentProps<typeof Ionicons>['name']>) {
  // On web, use emoji fallback if available
  if (Platform.OS === 'web' && WEB_ICON_MAP[name as string]) {
    return (
      <Text style={[{ fontSize: 20, marginBottom: -3 }, style]}>
        {WEB_ICON_MAP[name as string]}
      </Text>
    );
  }
  
  // Default to Ionicons
  return <Ionicons size={24} style={[{ marginBottom: -3 }, style]} name={name} {...rest} />;
}
