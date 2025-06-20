
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';

interface QRCodeGeneratorProps {
  value: string;
  size?: number;
  options?: {
    foregroundColor?: string;
    backgroundColor?: string;
    size?: number;
    logo?: string | null;
  };
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ 
  value, 
  size = 200, 
  options 
}) => {
  // For now, showing a placeholder since we need to implement actual QR code generation
  // You'll need to install a QR code library like react-native-qrcode-svg
  
  return (
    <View style={[
      styles.container, 
      { 
        width: size, 
        height: size,
        backgroundColor: options?.backgroundColor || '#FFFFFF'
      }
    ]}>
      <ThemedText style={styles.placeholder}>
        QR Code
      </ThemedText>
      <ThemedText style={styles.value} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
  },
  placeholder: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  value: {
    fontSize: 10,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
