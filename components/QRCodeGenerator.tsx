import React from 'react';
import QRCode from 'react-native-qrcode-svg';

interface QRCodeGeneratorProps {
  value: string;
  size?: number;
  options?: {
    foregroundColor?: string;
    backgroundColor?: string;
    logo?: string | null;
  };
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ 
  value, 
  size = 200, 
  options = {} 
}) => {
  return (
    <QRCode
      value={value}
      size={size}
      color={options.foregroundColor || '#000000'}
      backgroundColor={options.backgroundColor || '#FFFFFF'}
      logo={options.logo ? { uri: options.logo } : undefined}
    />
  );
};

export default QRCodeGenerator;