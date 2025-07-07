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
  'add-circle-outline': '⊕',
  'cloud-upload': '☁️⬆️',
  'qr-code': '📱',
  'qr-code-scanner': '📱',
  'analytics': '📊',
  'store': '🏪',
  'star': '⭐',
  'dashboard': '📊',
  'library-music': '🎵',
  'delete-forever': '🗑️',
  'delete': '🗑️',
  'search': '🔍',
  'search-off': '🔍❌',
  'clear': '✖️',
  'close': '✖️',
  'queue-music': '🎵',
  'audiotrack': '🎵',
  'videocam': '🎬',
  'insert-drive-file': '📄',
  'warning': '⚠️',
  'contrast': '🌓',
  'gradient': '🌈',
  'crop-free': '⚡',
  'photo-size-select-small': '🔍',
  'brightness-7': '☀️',
  'arrow-back': '←',
  'account-circle': '👤',
  'support-agent': '🎧',
  'description': '📝',
  'play-circle-filled': '▶️',
  'forum': '💬',
  'home': '🏠',
  'settings': '⚙️',
  'slideshow': '🖼️',
  'content-copy': '📋',
  'share': '📤',
  'remove': '➖',
  'code': '💻',
  'edit': '✏️',
  'vpn-key': '🔑',
  'info': 'ℹ️',
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
  color = '#000',
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
  
  // Default to MaterialIcons with error boundary
  try {
    return <MaterialIcons size={size} style={style} name={name} color={color} {...rest} />;
  } catch (error) {
    console.warn(`MaterialIcon "${name}" failed to load, using fallback`);
    return (
      <Text style={[{ fontSize: size, color }, style]}>
        {WEB_MATERIAL_ICON_MAP[name as string] || '❓'}
      </Text>
    );
  }
} 