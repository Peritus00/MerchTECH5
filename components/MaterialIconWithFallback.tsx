import { MaterialIcons } from '@expo/vector-icons';
import { type IconProps } from '@expo/vector-icons/build/createIconSet';
import { type ComponentProps } from 'react';
import { Platform, Text } from 'react-native';

// Web fallback icons using Unicode symbols
const WEB_MATERIAL_ICON_MAP: Record<string, string> = {
  'email': '✉️',
  'lock': '🔒',
  'person': '👤',
  'visibility': '👁️',
  'visibility-off': '🙈',
  'error': '❌',
  'check': '✅',
  'check-circle': '✅',
  'verified': '✅',
  'verified-user': '👤✅',
  'hourglass-empty': '⏳',
  'lock-reset': '🔓',
  'add': '➕',
  'cloud-upload': '☁️⬆️',
  'qr-code': '📱',
  'analytics': '📊',
  'store': '🏪',
  'star': '⭐',
  'dashboard': '📊',
  'library-music': '🎵',
  'delete-forever': '🗑️',
  'search': '🔍',
  'clear': '✖️',
  'queue-music': '🎵',
};

interface MaterialIconWithFallbackProps extends IconProps<ComponentProps<typeof MaterialIcons>['name']> {
  name: ComponentProps<typeof MaterialIcons>['name'];
  size?: number;
  color?: string;
}

export function MaterialIconWithFallback({ 
  style, 
  name, 
  size = 24, 
  color,
  ...rest 
}: MaterialIconWithFallbackProps) {
  // On web, use emoji fallback if available
  if (Platform.OS === 'web' && WEB_MATERIAL_ICON_MAP[name as string]) {
    return (
      <Text style={[{ fontSize: size, color }, style]}>
        {WEB_MATERIAL_ICON_MAP[name as string]}
      </Text>
    );
  }
  
  // Default to MaterialIcons
  return <MaterialIcons size={size} style={style} name={name} color={color} {...rest} />;
} 