/**
 * Gestión de audio y vibración con Web Audio API
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
      this.ctx = new AudioContext();
      
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.enabled = true;
      this.initialized = true;

      // Precargar sonidos sintetizados
      this._generateSounds();

    } catch (error) {
      console.warn('Audio init failed:', error);
      this.enabled = false;
    }
  }

  _generateSounds() {
    // Sonido de nueva solicitud (urgente)
    this.sounds.newTrip = () => this._playTone({
      frequencies: [880, 1100, 880],
      durations: [0.15, 0.15, 0.3],
      type: 'triangle',
      gain: 0.4
    });

    // Sonido de éxito/confirmación
    this.sounds.success = () => this._playTone({
      frequencies: [523.25, 659.25, 783.99], // Do-Mi-Sol
      durations: [0.1, 0.1, 0.3],
      type: 'sine',
      gain: 0.3
    });

    // Sonido de alerta/rechazo
    this.sounds.error = () => this._playTone({
      frequencies: [300, 200],
      durations: [0.2, 0.4],
      type: 'sawtooth',
      gain: 0.3
    });

    // Sonido de notificación suave
    this.sounds.notification = () => this._playTone({
      frequencies: [600],
      durations: [0.1],
      type: 'sine',
      gain: 0.2
    });
  }

  _playTone({ frequencies, durations, type, gain }) {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.connect(this.ctx.destination);
    masterGain.gain.value = gain;

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
      noteGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
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

  vibrate(pattern) {
    if (!navigator.vibrate) return;
    
    // Patrones predefinidos
    const patterns = {
      newTrip: [100, 50, 100, 50, 200, 100, 500],
      success: [50, 100],
      error: [200, 100, 200],
      notification: [100]
    };

    const vibrationPattern = typeof pattern === 'string' ? patterns[pattern] : pattern;
navigator.vibrate(vibrationPattern || patterns.notification);
  }

  // Método para activar audio tras interacción del usuario (requerido por browsers)
  async enableOnUserInteraction() {
    if (!this.initialized) {
      await this.init();
    }
    
    // Intentar reproducir silencio para desbloquear audio en iOS
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }
}

const soundManager = new SoundManager();
export default soundManager;
