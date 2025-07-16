let audio: HTMLAudioElement | null = null;

export const WebAudioPlayer = {
  play(uri: string) {
    if (audio) {
      audio.pause();
    }
    const AudioConstructor = (window as any).Audio;
    audio = new AudioConstructor(uri);
    audio.play();
  },

  pause() {
    if (audio) {
      audio.pause();
    }
  },

  resume() {
    if (audio) {
      audio.play();
    }
  },

  stop() {
    if (audio) {
      audio.pause();
      audio = null;
    }
  },
  
  setLooping(isLooping: boolean) {
    if (audio) {
      audio.loop = isLooping;
    }
  },
}; 