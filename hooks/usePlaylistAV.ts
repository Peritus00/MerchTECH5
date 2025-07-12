import { useEffect, useRef, useState, useCallback } from 'react';
import { AVPlaybackStatus, Audio, Video } from 'expo-av';
import { Platform } from 'react-native';

export interface MediaTrack {
  id: number | string;
  url: string;
  title?: string;
  fileType?: 'audio' | 'video';
}

export interface UsePlaylistAV {
  currentIndex: number;
  currentTrack: MediaTrack;
  isPlaying: boolean;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => void;
  previous: () => void;
  onStatusUpdate: (status: AVPlaybackStatus) => void;
  soundRef: React.MutableRefObject<Audio.Sound | null>;
}

/**
 * Simple unified playlist hook using expo-av Audio.Sound.
 * For video tracks we rely on <Video> component and just advance on didJustFinish.
 */
export const usePlaylistAV = (tracks: MediaTrack[]): UsePlaylistAV => {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const currentTrack = tracks[index];

  // Load a track into the Audio.Sound instance
  const load = async (i: number, autoPlay = true) => {
    const track = tracks[i];
    if (!track) return;
    // unload existing
    try {
      await soundRef.current?.unloadAsync();
    } catch {}

    if (track.fileType === 'video') {
      // Video handled separately by <Video>
      return;
    }
    const { sound } = await Audio.Sound.createAsync({ uri: track.url }, { shouldPlay: autoPlay });
    soundRef.current = sound;
    setIsPlaying(autoPlay);
  };

  // initial load
  useEffect(() => {
    if (tracks.length) load(0, false);
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // helpers
  const play = async () => {
    if (currentTrack.fileType === 'video') return; // Video component handles play
    await soundRef.current?.playAsync();
    setIsPlaying(true);
  };
  const pause = async () => {
    if (currentTrack.fileType === 'video') return;
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  };
  const next = useCallback(() => {
    const nextIndex = index + 1 < tracks.length ? index + 1 : 0;
    setIndex(nextIndex);
  }, [index, tracks.length]);
  const previous = () => {
    const prev = index - 1 >= 0 ? index - 1 : tracks.length - 1;
    setIndex(prev);
  };

  // Reload when index changes for audio tracks
  useEffect(() => {
    if (tracks[index]?.fileType !== 'video') {
      load(index, true);
    }
  }, [index]);

  // Handler for AV status updates (pass to Video component)
  const onStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      next();
    }
  };

  return {
    currentIndex: index,
    currentTrack,
    isPlaying,
    play,
    pause,
    next,
    previous,
    onStatusUpdate,
    soundRef,
  };
}; 