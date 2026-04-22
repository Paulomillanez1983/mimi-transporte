let audioContext = null;

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function beep({ frequency = 440, duration = 0.14, type = "sine" } = {}) {
  try {
    const context = ensureAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.05;

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();

    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.stop(context.currentTime + duration);
  } catch {
    // noop
  }
}

export function playOfferSound() {
  beep({ frequency: 720, duration: 0.18, type: "triangle" });
  setTimeout(() => beep({ frequency: 860, duration: 0.22, type: "triangle" }), 120);
}

export function playMessageSound() {
  beep({ frequency: 560, duration: 0.12, type: "sine" });
}

export function playStatusSound() {
  beep({ frequency: 460, duration: 0.12, type: "square" });
  setTimeout(() => beep({ frequency: 620, duration: 0.1, type: "square" }), 90);
}


export function playNotificationSound() {
  beep({ frequency: 680, duration: 0.11, type: "triangle" });
  setTimeout(() => beep({ frequency: 820, duration: 0.13, type: "triangle" }), 90);
}
