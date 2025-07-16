// services/audio/AudioService.ts

import { Platform } from 'react-native';
import WebAudioPlayer from './WebAudioPlayer';
import MobileAudioPlayer from './MobileAudioPlayer';

// Define a common interface that both player classes will adhere to.
// This ensures that our components can interact with either player
// in a consistent way.
export interface IAudioPlayer {
  play: () => void;
  pause: () => void;
  stop: () => void;
  unload: () => void;
}

// The factory function that decides which audio player to instantiate.
const createAudioPlayer = (
  uri: string,
  onEnded: () => void,
  options: { shouldPlay: boolean; isLooping: boolean }
): IAudioPlayer | null => {
  if (Platform.OS === 'web') {
    return new WebAudioPlayer(uri, onEnded, options);
  } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return new MobileAudioPlayer(uri, onEnded, options);
  }
  // Return null or a dummy player for unsupported platforms
  console.warn('AudioService: Unsupported platform:', Platform.OS);
  return null;
};

export default createAudioPlayer; 