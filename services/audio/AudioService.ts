import { Platform } from 'react-native';
import { WebAudioPlayer } from './WebAudioPlayer';
import { MobileAudioPlayer } from './MobileAudioPlayer';

const AudioService = Platform.OS === 'web' ? WebAudioPlayer : MobileAudioPlayer;

export default AudioService; 