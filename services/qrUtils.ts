
import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

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
    // Request media library permission
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Media library permission is required to save QR codes');
      return;
    }

    // Capture the QR code as image
    const uri = await captureRef(qrRef, {
      format: format === QRCodeFormat.PDF ? 'png' : format,
      quality: 1.0,
      width: 800,
      height: 800,
    });

    if (format === QRCodeFormat.PDF) {
      // For PDF, we'll share as PNG since PDF generation is complex
      await shareQRCode(uri, `${filename}.png`);
    } else {
      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('QR Codes', asset, false);
      Alert.alert('Success', `QR code saved to Photos as ${filename}.${format}`);
    }
  } catch (error) {
    console.error('Download failed:', error);
    Alert.alert('Error', 'Failed to save QR code');
  }
};

export const shareQRCode = async (uri: string, filename: string): Promise<void> => {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share QR Code',
    });
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
