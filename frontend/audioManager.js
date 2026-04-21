/**
 * audioManager.js
 * Handles gamification audio feedback strictly adhering to browser policies.
 */

const audioFiles = {
  correct: './sounds/correct.mp3',
  incorrect: './sounds/incorrect.mp3'
};

const audioContext = {};
let isMuted = false;
let userHasInteracted = false;

// Initialize audio objects
for (const [key, path] of Object.entries(audioFiles)) {
  const audio = new Audio(path);
  audio.volume = 0.4;
  audioContext[key] = audio;
}

// Ensure audio only plays after user interaction
document.addEventListener('click', () => {
  userHasInteracted = true;
}, { once: true });

document.addEventListener('keydown', () => {
  userHasInteracted = true;
}, { once: true });

function playSound(type) {
  if (isMuted || !userHasInteracted) return;

  const audio = audioContext[type];
  if (audio) {
    // Reset currentTime to 0 to allow rapid replay without overlap issues
    audio.currentTime = 0;
    audio.play().catch((e) => {
      console.warn(`Could not play ${type} audio:`, e);
    });
  } else {
    console.warn(`Unknown audio type: ${type}`);
  }
}

function toggleMute() {
  isMuted = !isMuted;
  return isMuted;
}

function getIsMuted() {
  return isMuted;
}

// Expose globally
window.AudioManager = {
  playSound,
  toggleMute,
  getIsMuted
};
