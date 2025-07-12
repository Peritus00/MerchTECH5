import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Video } from 'expo-av';
import { AVPlaybackStatus } from 'expo-av';
import { MediaTrack } from '@/hooks/usePlaylistAV';

interface AVTrackProps {
  track: MediaTrack;
  onStatusUpdate: (status: AVPlaybackStatus) => void;
}

/**
 * Lightweight component that renders a Video player when the current track is a video.
 * For audio tracks the Audio.Sound instance is managed inside usePlaylistAV hook, so we render nothing.
 */
const AVTrack: React.FC<AVTrackProps> = ({ track, onStatusUpdate }) => {
  if (!track) return null;

  // Audio tracks are handled invisibly by Audio.Sound, nothing to render
  if (track.fileType !== 'video') {
    return null;
  }

  return (
    <View style={styles.container}>
      <Video
        style={styles.video}
        source={{ uri: track.url }}
        resizeMode="contain"
        shouldPlay
        onPlaybackStatusUpdate={onStatusUpdate}
        useNativeControls
      />
    </View>
  );
};

export default AVTrack;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
}); 