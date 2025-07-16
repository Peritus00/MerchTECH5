// services/audio/MobileAudioPlayer.ts

import { Audio } from 'expo-av';

/**
 * A mobile-specific audio player that uses the expo-av library.
 * This is isolated to its own file to prevent it from being included
 * in the web build, where it is not needed and can cause bundling issues.
 */
class MobileAudioPlayer {
  private sound: Audio.Sound | null = null;
  private onEndedCallback: (() => void) | null = null;

  constructor(
    uri: string,
    onEnded: () => void,
    options: { shouldPlay: boolean; isLooping: boolean }
  ) {
    this.onEndedCallback = onEnded;
    this.init(uri, options);
  }

  private async init(
    uri: string,
    options: { shouldPlay: boolean; isLooping: boolean }
  ) {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // Do not mix with others
        interruptionModeAndroid: 1, // Do not mix with others
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: options.shouldPlay,
          isLooping: options.isLooping,
        },
        this.onPlaybackStatusUpdate
      );

      this.sound = sound;
    } catch (error) {
      console.error('Error initializing mobile audio:', error);
    }
  }

  private onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish && !status.isLooping) {
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    }
    if (status.error) {
      console.error(`Playback Error: ${status.error}`);
    }
  };

  async play() {
    try {
      if (this.sound) {
        const status = await this.sound.getStatusAsync();
        if (status.isLoaded && !status.isPlaying) {
          await this.sound.playAsync();
        }
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  pause() {
    this.sound?.pauseAsync();
  }

  stop() {
    this.sound?.stopAsync();
  }

  async unload() {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }
    this.onEndedCallback = null;
  }
}

export default MobileAudioPlayer; 