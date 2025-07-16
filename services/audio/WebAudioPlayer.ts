// services/audio/WebAudioPlayer.ts

/**
 * A web-specific audio player that uses the browser's native Audio object.
 * This is isolated to its own file to prevent the Expo/Metro bundler from
 * attempting to resolve it in a native environment, and to prevent the
 * web build process from mangling the `Audio` constructor.
 */
class WebAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndedCallback: (() => void) | null = null;

  constructor(
    uri: string,
    onEnded: () => void,
    options: { shouldPlay: boolean; isLooping: boolean }
  ) {
    this.onEndedCallback = onEnded;

    try {
      // IMPORTANT: Access the Audio constructor via a string property lookup on `window`.
      // This is the critical change to prevent the production build process (e.g., Terser)
      // from mangling the constructor name, which was causing the fatal
      // "A.Audio is not a constructor" error.
      const AudioConstructor = (window as any)['Audio'];
      if (!AudioConstructor) {
        console.error('WebAudioPlayer: Browser does not support the Audio object.');
        return;
      }
      this.audio = new AudioConstructor(uri);
      this.audio.loop = options.isLooping;

      this.audio.addEventListener('ended', this.handleEnded);
      this.audio.addEventListener('error', this.handleError);

      if (options.shouldPlay) {
        this.play();
      }
    } catch (error) {
      console.error('Error creating or playing web audio:', error);
    }
  }

  private handleEnded = () => {
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  };

  private handleError = (e: ErrorEvent) => {
    console.error('HTML Audio Error:', e);
    // You could add more robust error handling or state management here
  };

  async play() {
    if (this.audio) {
      try {
        await this.audio.play();
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  }

  pause() {
    this.audio?.pause();
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  unload() {
    if (this.audio) {
      this.stop();
      this.audio.removeEventListener('ended', this.handleEnded);
      this.audio.removeEventListener('error', this.handleError);
      this.audio.src = ''; // Release the audio source
      this.audio = null;
    }
    this.onEndedCallback = null;
  }
}

export default WebAudioPlayer;