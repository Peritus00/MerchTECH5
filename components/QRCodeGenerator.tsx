
import React from 'react';
import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QRCodeOptions } from '../types';

interface QRCodeGeneratorProps {
  value: string;
  size?: number;
  options?: QRCodeOptions;
  getRef?: (ref: any) => void;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  value,
  size = 200,
  options = {},
  getRef,
}) => {
  const {
    foregroundColor = '#000000',
    backgroundColor = '#FFFFFF',
    errorCorrectionLevel = 'M',
    logoUrl,
  } = options;

  return (
    <View style={styles.container}>
      <QRCode
        value={value}
        size={size}
        color={foregroundColor}
        backgroundColor={backgroundColor}
        ecl={errorCorrectionLevel}
        logo={logoUrl ? { uri: logoUrl } : undefined}
        logoSize={logoUrl ? size * 0.2 : 0}
        logoBackgroundColor={backgroundColor}
        logoMargin={2}
        logoBorderRadius={4}
        getRef={getRef}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
