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
    this._audioUnlocked = false;
    this._hapticsUnlocked = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('Web Audio API no soportado');
        return;
      }

      this.ctx = new AudioContext();
      
      // Master gain para control de volumen
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.enabled = true;
      this.initialized = true;

      this._generateSounds();
      console.log('🔊 SoundManager inicializado (esperando interacción)');

    } catch (error) {
      console.warn('Audio init failed:', error);
      this.enabled = false;
    }
  }

  async _unlockAudio() {
    if (this._audioUnlocked || !this.ctx) return;
    
    try {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this._audioUnlocked = true;
      console.log('🔊 Audio desbloqueado');
    } catch (e) {
      console.warn('No se pudo desbloquear audio:', e);
    }
  }

  _unlockHaptics() {
    this._hapticsUnlocked = true;
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
    if (!this.enabled || !this.ctx || !this._audioUnlocked) return;

    try {
      const now = this.ctx.currentTime;
      const masterGain = this.ctx.createGain();
      masterGain.connect(this.masterGain);
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

      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
    } catch (e) {
      console.warn('Error reproduciendo sonido:', e);
    }
  }

  play(soundName) {
    if (!this.initialized) {
      this.init().then(() => {
        if (this._audioUnlocked && this.sounds[soundName]) {
          this.sounds[soundName]();
        }
      });
      return;
    }

    if (this._audioUnlocked && this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  }

  // =========================
  // HAPTICS
  // =========================
  vibrate(patternName) {
    if (!navigator.vibrate || !CONFIG.FEATURES.enableHaptics || !this._hapticsUnlocked) return;
    
    try {
      const pattern = CONFIG.HAPTICS[patternName] || CONFIG.HAPTICS.notification;
      navigator.vibrate(pattern);
    } catch (e) {
      // Silencioso - algunos navegadores bloquean vibración
    }
  }

  vibrateArrival(distance) {
    if (!navigator.vibrate || !this._hapticsUnlocked) return;
    
    try {
      if (distance < 50) {
        navigator.vibrate(CONFIG.HAPTICS.arrival);
      } else if (distance < 200) {
        navigator.vibrate([100, 50, 100]);
      } else {
        navigator.vibrate([60]);
      }
    } catch (e) {
      // Silencioso
    }
  }

  notify(type) {
    this.play(type);
    this.vibrate(type);
  }

  // =========================
  // VOICE (con fallback)
  // =========================
  speak(text, priority = 'normal') {
    if (!CONFIG.FEATURES.enableVoiceSynthesis || !window.speechSynthesis) return;

    try {
      if (priority === 'urgent') {
        window.speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 1.1;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis no disponible:', e);
    }
  }

  // =========================
  // UNLOCK (llamar tras interacción)
  // =========================
  async enableOnUserInteraction() {
    await this._unlockAudio();
    this._unlockHaptics();
    
    if (!this.initialized) {
      await this.init();
    }
  }

  setVolume(level) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(level, this.ctx?.currentTime || 0);
    }
  }
}

const soundManager = new SoundManager();
export default soundManager;
