/**
 * MIMI Driver - Sound & Haptics Manager Premium
 * Web Audio API + Vibration API optimizados
 */

import CONFIG from './config.js';

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.initialized = false;
    this.sounds = {};
    this.masterGain = null;
    this.analyzer = null;
  }

  async init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      
      // Master gain para control de volumen
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);

      // Analizador para visualizaciones (futuro)
      this.analyzer = this.ctx.createAnalyser();
      this.analyzer.fftSize = 256;

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.enabled = true;
      this.initialized = true;

      this._generateSounds();
      console.log('🔊 SoundManager Premium inicializado');

    } catch (error) {
      console.warn('Audio init failed:', error);
      this.enabled = false;
    }
  }

  _generateSounds() {
    const { SOUNDS } = CONFIG;

    Object.entries(SOUNDS).forEach(([name, config]) => {
      this.sounds[name] = () => this._playTone({
        frequencies: config.freq,
        durations: config.duration,
        type: config.type,
        gain: name === 'newTrip' ? 0.5 : 0.35
      });
    });
  }

  _playTone({ frequencies, durations, type, gain }) {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.connect(this.masterGain);
    masterGain.gain.setValueAtTime(gain, now);

    frequencies.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      
      // Envelope ADSR suave
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

    // Fade out master
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
  }

  play(soundName) {
    if (!this.initialized) {
      this.init().then(() => {
        if (this.sounds[soundName]) {
          this.sounds[soundName]();
        }
      });
      return;
    }

    if (this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  }

  // =========================
  // HAPTICS PREMIUM
  // =========================
  vibrate(patternName) {
    if (!navigator.vibrate || !CONFIG.FEATURES.enableHaptics) return;
    
    const pattern = CONFIG.HAPTICS[patternName] || CONFIG.HAPTICS.notification;
    navigator.vibrate(pattern);
  }

  // Patrón de llegada (intensidad creciente)
  vibrateArrival(distance) {
    if (!navigator.vibrate) return;
    
    if (distance < 50) {
      navigator.vibrate(CONFIG.HAPTICS.arrival);
    } else if (distance < 200) {
      navigator.vibrate([100, 50, 100]);
    } else {
      navigator.vibrate([60]);
    }
  }

  // Doble feedback (sonido + haptic)
  notify(type) {
    this.play(type);
    this.vibrate(type);
  }

  // =========================
  // VOICE SYNTHESIS (Nuevo)
  // =========================
  speak(text, priority = 'normal') {
    if (!CONFIG.FEATURES.enableVoiceSynthesis || !window.speechSynthesis) return;

    // Cancelar speech anterior si es urgente
    if (priority === 'urgent') {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    utterance.rate = 1.1;
    utterance.pitch = 1;
    
    // Seleccionar voz española si disponible
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.includes('es'));
    if (spanishVoice) utterance.voice = spanishVoice;

    window.speechSynthesis.speak(utterance);
  }

  // =========================
  // AUDIO UNLOCK (iOS/Android)
  // =========================
  async enableOnUserInteraction() {
    if (!this.initialized) {
      await this.init();
    }
    
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Precargar voices
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }

  // =========================
  // UTILIDADES
  // =========================
  setVolume(level) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(level, this.ctx.currentTime);
    }
  }

  mute() {
    this.setVolume(0);
  }

  unmute() {
    this.setVolume(0.8);
  }
}

const soundManager = new SoundManager();
export default soundManager;
