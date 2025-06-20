
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';

export enum QRCodeFormat {
  PNG = 'png',
  JPG = 'jpg',
  PDF = 'pdf'
}

export const downloadQRCode = async (
  qrRef: any,
  filename: string,
  format: QRCodeFormat = QRCodeFormat.PNG
): Promise<void> => {
  try {
    // Request storage permission on Android
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Denied', 'Storage permission is required to save QR codes');
        return;
      }
    }

    // Capture the QR code as image
    const uri = await captureRef(qrRef, {
      format: format === QRCodeFormat.PDF ? 'png' : format,
      quality: 1.0,
      width: 800,
      height: 800,
    });

    if (format === QRCodeFormat.PDF) {
      // For PDF, we would need additional processing
      // For now, we'll save as PNG and show sharing options
      await shareQRCode(uri, `${filename}.png`);
    } else {
      const downloadPath = `${RNFS.DownloadDirectoryPath}/${filename}.${format}`;
      await RNFS.copyFile(uri, downloadPath);
      Alert.alert('Success', `QR code saved to Downloads folder as ${filename}.${format}`);
    }
  } catch (error) {
    console.error('Download failed:', error);
    Alert.alert('Error', 'Failed to save QR code');
  }
};

export const shareQRCode = async (uri: string, filename: string): Promise<void> => {
  try {
    const shareOptions = {
      title: 'Share QR Code',
      message: 'Check out this QR code',
      url: uri,
      filename: filename,
    };

    await Share.open(shareOptions);
  } catch (error) {
    console.error('Share failed:', error);
    Alert.alert('Error', 'Failed to share QR code');
  }
};

export const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const formatContentForType = (content: string, type: string): string => {
  switch (type) {
    case 'email':
      return content.startsWith('mailto:') ? content : `mailto:${content}`;
    case 'phone':
      return content.startsWith('tel:') ? content : `tel:${content}`;
    case 'sms':
      return content.startsWith('sms:') ? content : `sms:${content}`;
    case 'url':
      if (!content.startsWith('http://') && !content.startsWith('https://')) {
        return `https://${content}`;
      }
      return content;
    default:
      return content;
  }
};

export const generateVCard = (contact: {
  name: string;
  organization?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}): string => {
  let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
  
  if (contact.name) vcard += `FN:${contact.name}\n`;
  if (contact.organization) vcard += `ORG:${contact.organization}\n`;
  if (contact.phone) vcard += `TEL:${contact.phone}\n`;
  if (contact.email) vcard += `EMAIL:${contact.email}\n`;
  if (contact.website) vcard += `URL:${contact.website}\n`;
  if (contact.address) vcard += `ADR:;;${contact.address};;;;\n`;
  
  vcard += 'END:VCARD';
  return vcard;
};

export const generateWiFiQR = (config: {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden?: boolean;
}): string => {
  return `WIFI:T:${config.security};S:${config.ssid};P:${config.password};H:${config.hidden ? 'true' : 'false'};;`;
};
