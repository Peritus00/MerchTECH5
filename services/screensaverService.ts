import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

interface ScreensaverState {
  currentQRCodeId: number | null;
  originalWallpaperPath: string | null;
  isScreensaverActive: boolean;
}

class ScreensaverService {
  private readonly STORAGE_KEY = 'screensaver_state';
  private readonly WALLPAPER_FOLDER = 'QRCodeWallpapers';

  // Get current screensaver state
  async getScreensaverState(): Promise<ScreensaverState> {
    try {
      const state = await AsyncStorage.getItem(this.STORAGE_KEY);
      return state ? JSON.parse(state) : {
        currentQRCodeId: null,
        originalWallpaperPath: null,
        isScreensaverActive: false
      };
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error getting state:', error);
      return {
        currentQRCodeId: null,
        originalWallpaperPath: null,
        isScreensaverActive: false
      };
    }
  }

  // Save screensaver state
  private async saveScreensaverState(state: ScreensaverState): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error saving state:', error);
    }
  }

  // Capture QR code as high-quality image
  async captureQRCode(qrRef: any, qrCodeName: string): Promise<string | null> {
    try {
      console.log('📸 SCREENSAVER: Capturing QR code for screensaver');
      
      const uri = await captureRef(qrRef, {
        format: 'png',
        quality: 1.0,
        width: 2048,
        height: 2048,
      });

      console.log('📸 SCREENSAVER: QR code captured successfully');
      return uri;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error capturing QR code:', error);
      throw error;
    }
  }

  // Set QR code as screensaver/wallpaper
  async setQRCodeAsScreensaver(qrRef: any, qrCodeId: number, qrCodeName: string): Promise<boolean> {
    try {
      console.log('🖼️ SCREENSAVER: Setting QR code as screensaver:', { qrCodeId, qrCodeName });

      // Get current state to preserve original wallpaper info
      const currentState = await this.getScreensaverState();

      // Capture the QR code
      const imageUri = await this.captureQRCode(qrRef, qrCodeName);
      if (!imageUri) {
        throw new Error('Failed to capture QR code image');
      }

      // Platform-specific implementation
      let success = false;
      
      if (Platform.OS === 'web') {
        success = await this.setWebWallpaper(imageUri, qrCodeName);
      } else if (Platform.OS === 'ios') {
        success = await this.setIOSWallpaper(imageUri, qrCodeName);
      } else if (Platform.OS === 'android') {
        success = await this.setAndroidWallpaper(imageUri, qrCodeName);
      }

      if (success) {
        // Update state
        const newState: ScreensaverState = {
          currentQRCodeId: qrCodeId,
          originalWallpaperPath: currentState.originalWallpaperPath || 'original_wallpaper',
          isScreensaverActive: true
        };
        
        await this.saveScreensaverState(newState);
        console.log('✅ SCREENSAVER: QR code set as screensaver successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error setting QR code as screensaver:', error);
      throw error;
    }
  }

  // Restore original screensaver/wallpaper
  async restoreOriginalScreensaver(): Promise<boolean> {
    try {
      console.log('🔄 SCREENSAVER: Restoring original screensaver');

      const currentState = await this.getScreensaverState();
      
      if (!currentState.isScreensaverActive) {
        console.log('ℹ️ SCREENSAVER: No QR code screensaver is currently active');
        return true;
      }

      // Platform-specific restoration
      let success = false;
      
      if (Platform.OS === 'web') {
        success = await this.restoreWebWallpaper();
      } else if (Platform.OS === 'ios') {
        success = await this.restoreIOSWallpaper();
      } else if (Platform.OS === 'android') {
        success = await this.restoreAndroidWallpaper();
      }

      if (success) {
        // Reset state
        const newState: ScreensaverState = {
          currentQRCodeId: null,
          originalWallpaperPath: currentState.originalWallpaperPath,
          isScreensaverActive: false
        };
        
        await this.saveScreensaverState(newState);
        console.log('✅ SCREENSAVER: Original screensaver restored successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error restoring original screensaver:', error);
      throw error;
    }
  }

  // Web implementation - Browser wallpaper/background
  private async setWebWallpaper(imageUri: string, qrCodeName: string): Promise<boolean> {
    try {
      // For web, we'll guide users to manually set it as desktop wallpaper
      const downloadLink = document.createElement('a');
      downloadLink.href = imageUri;
      downloadLink.download = `${qrCodeName}_screensaver.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Show instructions
      Alert.alert(
        'QR Code Downloaded! 🎉',
        'Your QR code has been downloaded. To set it as your desktop wallpaper:\n\n' +
        '• Windows: Right-click the downloaded image → "Set as desktop background"\n' +
        '• Mac: Right-click the downloaded image → "Set Desktop Picture"\n' +
        '• Linux: Varies by desktop environment',
        [
          { text: 'Got it!', style: 'default' }
        ]
      );

      return true;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Web wallpaper error:', error);
      return false;
    }
  }

  private async restoreWebWallpaper(): Promise<boolean> {
    Alert.alert(
      'Restore Original Wallpaper',
      'To restore your original desktop wallpaper:\n\n' +
      '• Windows: Right-click desktop → Personalize → Background\n' +
      '• Mac: System Preferences → Desktop & Screen Saver\n' +
      '• Linux: Varies by desktop environment',
      [
        { text: 'Thanks!', style: 'default' }
      ]
    );
    return true;
  }

  // iOS implementation
  private async setIOSWallpaper(imageUri: string, qrCodeName: string): Promise<boolean> {
    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to set wallpaper');
        return false;
      }

      // Save to photo library
      await MediaLibrary.saveToLibraryAsync(imageUri);

      // Show instructions
      Alert.alert(
        'QR Code Saved to Photos! 📱',
        'Your QR code has been saved to your photo library. To set it as wallpaper:\n\n' +
        '1. Open Photos app\n' +
        '2. Find your QR code image\n' +
        '3. Tap Share → Use as Wallpaper\n' +
        '4. Choose Lock Screen, Home Screen, or Both',
        [
          { text: 'Open Photos', onPress: () => this.openPhotosApp() },
          { text: 'Got it!', style: 'default' }
        ]
      );

      return true;
    } catch (error) {
      console.error('🔴 SCREENSAVER: iOS wallpaper error:', error);
      return false;
    }
  }

  private async restoreIOSWallpaper(): Promise<boolean> {
    Alert.alert(
      'Restore Original Wallpaper 🔄',
      'To restore your original wallpaper:\n\n' +
      '1. Go to Settings → Wallpaper\n' +
      '2. Choose a New Wallpaper\n' +
      '3. Select from Dynamic, Stills, or your Photos\n' +
      '4. Set as Lock Screen, Home Screen, or Both',
      [
        { text: 'Open Settings', onPress: () => this.openIOSSettings() },
        { text: 'Got it!', style: 'default' }
      ]
    );
    return true;
  }

  // Android implementation
  private async setAndroidWallpaper(imageUri: string, qrCodeName: string): Promise<boolean> {
    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant storage access to set wallpaper');
        return false;
      }

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(imageUri);

      // Show instructions
      Alert.alert(
        'QR Code Saved to Gallery! 📱',
        'Your QR code has been saved to your gallery. To set it as wallpaper:\n\n' +
        '1. Open Gallery/Photos app\n' +
        '2. Find your QR code image\n' +
        '3. Tap ⋮ (menu) → Set as wallpaper\n' +
        '4. Choose Home screen, Lock screen, or Both',
        [
          { text: 'Open Gallery', onPress: () => this.openGalleryApp() },
          { text: 'Got it!', style: 'default' }
        ]
      );

      return true;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Android wallpaper error:', error);
      return false;
    }
  }

  private async restoreAndroidWallpaper(): Promise<boolean> {
    Alert.alert(
      'Restore Original Wallpaper 🔄',
      'To restore your original wallpaper:\n\n' +
      '1. Long-press on home screen\n' +
      '2. Tap Wallpapers\n' +
      '3. Choose from Gallery, Live wallpapers, or Default\n' +
      '4. Set for Home screen, Lock screen, or Both',
      [
        { text: 'Got it!', style: 'default' }
      ]
    );
    return true;
  }

  // Helper functions
  private openPhotosApp(): void {
    // iOS Photos app URL scheme
    const photosUrl = 'photos-redirect://';
    // Implementation would use Linking.openURL(photosUrl)
  }

  private openIOSSettings(): void {
    // iOS Settings app URL scheme for wallpaper
    const settingsUrl = 'App-Prefs:Wallpaper';
    // Implementation would use Linking.openURL(settingsUrl)
  }

  private openGalleryApp(): void {
    // Android Gallery intent
    // Implementation would use native module or intent
  }

  // Check if a QR code is currently set as screensaver
  async isQRCodeActiveAsScreensaver(qrCodeId: number): Promise<boolean> {
    try {
      const state = await this.getScreensaverState();
      return state.isScreensaverActive && state.currentQRCodeId === qrCodeId;
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error checking active screensaver:', error);
      return false;
    }
  }

  // Get analytics about screensaver usage
  async getScreensaverAnalytics(): Promise<{
    totalScreensaverSets: number;
    currentActiveQRCode: number | null;
    lastSetDate: string | null;
  }> {
    try {
      const state = await this.getScreensaverState();
      const analytics = await AsyncStorage.getItem('screensaver_analytics');
      const parsedAnalytics = analytics ? JSON.parse(analytics) : {
        totalScreensaverSets: 0,
        lastSetDate: null
      };

      return {
        totalScreensaverSets: parsedAnalytics.totalScreensaverSets || 0,
        currentActiveQRCode: state.currentQRCodeId,
        lastSetDate: parsedAnalytics.lastSetDate
      };
    } catch (error) {
      console.error('🔴 SCREENSAVER: Error getting analytics:', error);
      return {
        totalScreensaverSets: 0,
        currentActiveQRCode: null,
        lastSetDate: null
      };
    }
  }
}

export const screensaverService = new ScreensaverService();
export default screensaverService; 