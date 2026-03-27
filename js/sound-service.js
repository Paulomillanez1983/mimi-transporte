
/**
 * MIMI Driver - Sound & Haptics Service
 * Web Audio API with fallback
 */

class SoundService {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.initialized = false;
    this.unlocked = false;
    this.sounds = {};
  }

  async init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API not supported');
        return;
      }

      this.ctx = new AudioContext();
      
      // Generate sounds procedurally
      this._generateSounds();
      
      this.enabled = true;
      this.initialized = true;
      
      console.log('[Sound] Initialized');

    } catch (error) {
      console.warn('[Sound] Init failed:', error);
    }
  }

  async unlock() {
    if (this.unlocked || !this.ctx) return;
    
    try {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.unlocked = true;
      console.log('[Sound] Unlocked');
    } catch (e) {
      console.warn('[Sound] Unlock failed:', e);
    }
  }

  _generateSounds() {
    // New trip notification - urgent, attention-grabbing
    this.sounds.newTrip = () => this._playTone({
      frequencies: [880, 1100, 880, 1100],
      durations: [0.15, 0.15, 0.15, 0.4],
      type: 'sine',
      gain: 0.4
    });

    // Accept - positive confirmation
    this.sounds.accept = () => this._playTone({
      frequencies: [523.25, 659.25, 783.99], // C major chord
      durations: [0.1, 0.1, 0.3],
      type: 'sine',
      gain: 0.3
    });

    // Arrival - success
    this.sounds.arrival = () => this._playTone({
      frequencies: [523.25, 659.25, 783.99, 1046.50],
      durations: [0.1, 0.1, 0.1, 0.4],
      type: 'sine',
      gain: 0.3
    });

    // Error - negative feedback
    this.sounds.error = () => this._playTone({
      frequencies: [200, 150],
      durations: [0.2, 0.3],
      type: 'sawtooth',
      gain: 0.2
    });
  }

  _playTone({ frequencies, durations, type, gain }) {
    if (!this.enabled || !this.unlocked || !this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const masterGain = this.ctx.createGain();
      masterGain.connect(this.ctx.destination);
      masterGain.gain.setValueAtTime(gain, now);

      frequencies.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        
        noteGain.connect(masterGain);
        osc.connect(noteGain);
        
        const startTime = now + durations.slice(0, i).reduce((a, b) => a + b, 0);
        const duration = durations[i];
        
        // Envelope
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(1, startTime + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.05);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      });

    } catch (e) {
      console.warn('[Sound] Play error:', e);
    }
  }

  play(soundName) {
    if (!this.initialized) {
      this.init().then(() => this.play(soundName));
      return;
    }
    
    if (this.unlocked && this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  }

  // Haptics
  vibrate(pattern) {
    if (!navigator.vibrate || !CONFIG.FEATURES.enableHaptics) return;
    
    const patterns = {
      notification: [100, 50, 100],
      success: [50, 100, 50],
      error: [100, 50, 100, 50, 100],
      arrival: [100, 50, 100, 50, 300]
    };
    
    try {
      navigator.vibrate(patterns[pattern] || pattern);
    } catch (e) {}
  }

  // Combined feedback
  feedback(type) {
    this.play(type);
    this.vibrate(type === 'error' ? 'error' : 'notification');
  }

  // Enable on user interaction (required by browsers)
  enable() {
    this.init();
    this.unlock();
  }
}

const soundService = new SoundService();
