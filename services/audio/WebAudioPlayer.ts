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
  private uri: string;
  private options: { shouldPlay: boolean; isLooping: boolean };

  constructor(
    uri: string,
    onEnded: () => void,
    options: { shouldPlay: boolean; isLooping: boolean }
  ) {
    this.onEndedCallback = onEnded;
    this.uri = uri;
    this.options = options;

    try {
      // Create audio element directly to avoid constructor mangling issues
      this.audio = document.createElement('audio');
      this.audio.src = this.uri;
      this.audio.loop = options.isLooping;
      
      // Add crossOrigin attribute to handle CORS
      this.audio.crossOrigin = "anonymous";
      
      // Preload the audio
      this.audio.preload = "auto";

      this.audio.addEventListener('ended', this.handleEnded);
      this.audio.addEventListener('error', this.handleError);
      this.audio.addEventListener('canplaythrough', this.handleCanPlayThrough);

      console.log('WebAudioPlayer: Created audio element for URI:', uri);
      
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
    // Try to provide more detailed error information
    if (this.audio) {
      console.error('Audio error details:', {
        src: this.audio.src,
        readyState: this.audio.readyState,
        networkState: this.audio.networkState,
        error: this.audio.error ? this.audio.error.code : 'No error code'
      });
    }
  };
  
  private handleCanPlayThrough = () => {
    console.log('WebAudioPlayer: Audio can play through without buffering');
    // If we're supposed to be playing, try again (in case autoplay failed)
    if (this.options.shouldPlay && this.audio && this.audio.paused) {
      this.play();
    }
  };

  async play() {
    if (this.audio) {
      try {
        // Add the audio element to the DOM to improve compatibility
        if (!this.audio.parentElement) {
          this.audio.style.display = 'none'; // Hide the element
          document.body.appendChild(this.audio);
        }
        
        const playPromise = this.audio.play();
        
        // Modern browsers return a promise from play()
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // Auto-play was prevented
            console.warn('WebAudioPlayer: Autoplay prevented:', error);
            
            // If it's an autoplay restriction, we'll need user interaction
            if (error.name === 'NotAllowedError') {
              console.log('WebAudioPlayer: Autoplay not allowed. Waiting for user interaction.');
              
              // We could set up a one-time click handler on the document to try playing again
              const playOnInteraction = () => {
                this.audio?.play().catch(e => console.error('Still failed to play after interaction:', e));
                document.removeEventListener('click', playOnInteraction);
                document.removeEventListener('touchstart', playOnInteraction);
              };
              
              document.addEventListener('click', playOnInteraction, { once: true });
              document.addEventListener('touchstart', playOnInteraction, { once: true });
            }
          });
        }
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