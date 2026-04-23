let audioContext = null;

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    audioContext = new AudioContextClass();
  }

  return audioContext;
}

async function resumeAudioContext(context) {
  if (!context) return null;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }
  } catch {
    return null;
  }

  return context;
}

async function beep({ frequency = 440, duration = 0.14, type = "sine" } = {}) {
  try {
    const context = await resumeAudioContext(ensureAudioContext());
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const startTime = context.currentTime;
    const endTime = startTime + duration;

    gain.gain.setValueAtTime(0.05, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(endTime);
  } catch {
    // noop
  }
}

export function playOfferSound() {
  void beep({ frequency: 720, duration: 0.18, type: "triangle" });
  window.setTimeout(() => {
    void beep({ frequency: 860, duration: 0.22, type: "triangle" });
  }, 120);
}

export function playMessageSound() {
  void beep({ frequency: 560, duration: 0.12, type: "sine" });
}

export function playStatusSound() {
  void beep({ frequency: 460, duration: 0.12, type: "square" });
  window.setTimeout(() => {
    void beep({ frequency: 620, duration: 0.1, type: "square" });
  }, 90);
}

export function playNotificationSound() {
  void beep({ frequency: 680, duration: 0.11, type: "triangle" });
  window.setTimeout(() => {
    void beep({ frequency: 820, duration: 0.13, type: "triangle" });
  }, 90);
}
