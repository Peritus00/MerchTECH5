import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface HeaderWithLogoProps {
  title: string;
  subtitle?: string;
  onRightButtonPress?: () => void;
  rightButtonIcon?: string;
  rightButtonColor?: string;
  showLogo?: boolean;
}

export default function HeaderWithLogo({
  title,
  subtitle,
  onRightButtonPress,
  rightButtonIcon,
  rightButtonColor = '#3b82f6',
  showLogo = true,
}: HeaderWithLogoProps) {
  return (
    <View style={styles.header}>
      {/* Left side - Title and subtitle */}
      <View style={styles.leftSection}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>

      {/* Center - MerchTech Logo */}
      {showLogo && (
        <View style={styles.centerSection}>
          <Image
            source={require('../assets/images/merchtechlogonoBgBlack.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Right side - Action button */}
      <View style={styles.rightSection}>
        {onRightButtonPress && rightButtonIcon && (
          <TouchableOpacity onPress={onRightButtonPress} style={styles.rightButton}>
            <MaterialIcons name={rightButtonIcon as any} size={24} color={rightButtonColor} />
          </TouchableOpacity>
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