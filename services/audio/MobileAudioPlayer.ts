import { Audio } from 'expo-av';

let sound: Audio.Sound | null = null;

export const MobileAudioPlayer = {
  async play(uri: string) {
    if (sound) {
      await sound.unloadAsync();
    }
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true }
    );
    sound = newSound;
  },

  async pause() {
    if (sound) {
      await sound.pauseAsync();
    }
  },

  async resume() {
    if (sound) {
      await sound.playAsync();
    }
  },

  async stop() {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
  },

  async setLooping(isLooping: boolean) {
    if (sound) {
      await sound.setIsLoopingAsync(isLooping);
    }
  },
}; 