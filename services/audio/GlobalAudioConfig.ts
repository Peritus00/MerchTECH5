// services/audio/GlobalAudioConfig.ts

import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform } from 'react-native';

/**
 * Configures the global audio session to enable background playback
 * and prevent pausing when the device is locked or woken up.
 * 
 * This should be called once on app startup to ensure all media playback
 * continues when the app moves to the background or the device is locked.
 */
export async function configureAudioSession(): Promise<void> {
  // Only configure on mobile platforms (iOS/Android)
  // Web doesn't need this configuration
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await Audio.setAudioModeAsync({
      // Critical: Keep audio playing when app goes to background or device is locked
      staysActiveInBackground: true,
      
      // Critical: Play audio even when hardware mute switch is on (iOS)
      playsInSilentModeIOS: true,
      
      // Allow recording (set to false since we're only playing media)
      allowsRecordingIOS: false,
      
      // Interruption modes: Do not mix with other audio (take exclusive control)
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      
      // Android-specific: Duck other audio instead of stopping it
      shouldDuckAndroid: true,
      
      // Don't play through earpiece (use speaker)
      playThroughEarpieceAndroid: false,
    });

    console.log('✅ Global audio session configured for background playback');
  } catch (error) {
    console.error('❌ Failed to configure global audio session:', error);
    // Don't throw - allow app to continue even if audio config fails
  }
}

