import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { CartHeader } from '@/components/CartHeader';

interface HeaderWithLogoProps {
  title: string;
  subtitle?: string;
  onRightButtonPress?: () => void;
  rightButtonIcon?: string;
  rightButtonColor?: string;
  showLogo?: boolean;
  logoVariant?: 'black' | 'gold';
}

export default function HeaderWithLogo({
  title,
  subtitle,
  onRightButtonPress,
  rightButtonIcon,
  rightButtonColor = '#3b82f6',
  showLogo = true,
  logoVariant = 'black',
}: HeaderWithLogoProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
      {/* Left side - Title and subtitle */}
      <View style={styles.leftSection}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>

      {/* Center - MerchTech Logo */}
      {showLogo && (
        <View style={styles.centerSection}>
          <Image
            source={logoVariant === 'gold' 
              ? require('../assets/images/merchtechlogogoldnoBgColor.png')
              : require('../assets/images/merchtechlogonoBgBlack.png')
            }
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Right side - Action button */}
      <View style={styles.rightSection}>
        {onRightButtonPress && rightButtonIcon && (
          rightButtonIcon === 'shopping-cart' ? (
            <CartHeader color={rightButtonColor} size={24} />
          ) : (
            <TouchableOpacity onPress={onRightButtonPress} style={styles.rightButton}>
              <MaterialIconWithFallback name={rightButtonIcon as any} size={24} color={rightButtonColor} />
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    minHeight: 60,
  },
  leftSection: {
    flex: 1,
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  logo: {
    width: 80,
    height: 32,
  },
  rightButton: {
    padding: 8,
  },
}); 