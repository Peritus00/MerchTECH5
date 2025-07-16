let audio: HTMLAudioElement | null = null;

export const WebAudioPlayer = {
  play(uri: string) {
    if (audio) {
      audio.pause();
    }
    // Use the standard document.createElement to avoid any potential
    // constructor mangling by the production bundler.
    audio = document.createElement('audio');
    audio.src = uri;
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