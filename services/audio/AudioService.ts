import { Platform } from 'react-native';

const AudioService = Platform.select({
  web: require('./WebAudioPlayer').WebAudioPlayer,
  default: require('./MobileAudioPlayer').MobileAudioPlayer,
});

export default AudioService; 