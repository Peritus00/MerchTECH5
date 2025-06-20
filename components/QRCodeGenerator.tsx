
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';
import { ThemedText } from './ThemedText';

interface QRCodeGeneratorProps {
  value: string;
  size?: number;
  options?: {
    foregroundColor?: string;
    backgroundColor?: string;
    logo?: string | null;
    logoSize?: number;
    logoBorderRadius?: number;
    logoBorderSize?: number;
    logoBorderColor?: string;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  };
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ 
  value, 
  size = 200, 
  options = {} 
}) => {
  const [isPressed, setIsPressed] = useState(false);
  
  const {
    foregroundColor = '#000000',
    backgroundColor = '#FFFFFF',
    logo = null,
    logoSize = 40,
    logoBorderRadius = 8,
    logoBorderSize = 4,
    logoBorderColor = '#FFFFFF',
    errorCorrectionLevel = 'H'
  } = options;

  const isUrl = value.match(/^(https?:\/\/|www\.)/i);

  const handlePress = async () => {
    if (isUrl) {
      try {
        let url = value;
        if (url.startsWith('www.')) {
          url = 'https://' + url;
        }
        
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Cannot open this URL');
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to open URL');
      }
    }
  };

  const qrCodeProps = {
    value: value || 'https://example.com',
    size: size,
    color: foregroundColor,
    backgroundColor: backgroundColor,
    logoSize: logo ? logoSize : 0,
    logoBackgroundColor: logoBorderColor,
    logoMargin: logoBorderSize,
    logoBorderRadius: logoBorderRadius,
    enableLinearGradient: false,
    ecl: errorCorrectionLevel,
    ...(logo && { logo: { uri: logo } })
  };

  return (
    <TouchableOpacity
      onPress={isUrl ? handlePress : undefined}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={[
        styles.container,
        isUrl && styles.clickable,
        isPressed && isUrl && styles.pressed
      ]}
      activeOpacity={isUrl ? 0.8 : 1}
    >
      <View style={[
        styles.qrContainer,
        { 
          backgroundColor: backgroundColor,
          borderRadius: 8,
          padding: 8,
          width: size + 16,
          height: size + 16
        }
      ]}>
        <QRCodeSVG {...qrCodeProps} />
      </View>
      
      {isUrl && (
        <ThemedText style={styles.urlHint}>
          Tap to open URL
        </ThemedText>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  clickable: {
    cursor: 'pointer',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  urlHint: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
  },
});

export default QRCodeGenerator;
