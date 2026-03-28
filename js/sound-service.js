/**
 * Sound Manager - Uber Style Audio Feedback
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.initialized = false;
    this.sounds = {};
  }

  async init() {
    if (this.initialized) return;
    
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      this.ctx = new AudioContext();
      this.enabled = true;
      this.initialized = true;
      
      this._generateSounds();
    } catch (e) {
      console.warn('[Sound] Init failed:', e);
    }
  }

  _generateSounds() {
    // New trip - urgent notification
    this.sounds.newTrip = () => this._playTone({
      frequencies: [880, 1100, 880, 1100, 880],
      durations: [0.1, 0.1, 0.1, 0.1, 0.3],
      type: 'sine',
      gain: 0.5
    });

    // Accept - positive chime
    this.sounds.accept = () => this._playTone({
      frequencies: [523.25, 659.25, 783.99, 1046.50],
      durations: [0.08, 0.08, 0.08, 0.4],
      type: 'sine',
      gain: 0.4
    });

    // Reject - subtle down
    this.sounds.reject = () => this._playTone({
      frequencies: [400, 300],
      durations: [0.15, 0.3],
      type: 'sine',
      gain: 0.3
    });

    // Arrival - success
    this.sounds.arrival = () => this._playTone({
      frequencies: [523.25, 659.25, 783.99, 1046.50],
      durations: [0.1, 0.1, 0.1, 0.6],
      type: 'sine',
      gain: 0.4
    });

    // Tick - countdown
    this.sounds.tick = () => this._playTone({
      frequencies: [800],
      durations: [0.05],
      type: 'sine',
      gain: 0.2
    });
  }

  _playTone({ frequencies, durations, type, gain }) {
    if (!this.enabled || !this.ctx) return;
    
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
      this.init().then(() => {
        if (this.sounds[soundName]) this.sounds[soundName]();
      });
      return;
    }
    
    // Resume context if suspended (browser policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    if (this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  }

  // Enable on user interaction (required by browsers)
  enable() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

const soundManager = new SoundManager();
export default soundManager;
