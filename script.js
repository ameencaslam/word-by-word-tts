// DOM Elements
const textInput = document.getElementById("text-input");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const resumeButton = document.getElementById("resume-button");
const stopButton = document.getElementById("stop-button");
const speedControl = document.getElementById("speed-control");
const speedValue = document.getElementById("speed-value");
const delayControl = document.getElementById("delay-control");
const delayValue = document.getElementById("delay-value");
const voiceSelect = document.getElementById("voice-select");
const wordCountDisplay = document.getElementById("word-count");

// SpeechSynthesis API
const synth = window.speechSynthesis;
let words = [];
let currentWordIndex = 0;
let isSpeaking = false;
let voices = [];
let currentUtterance = null;
let timeoutId = null; // To track the delay timeout

// Constants
const DELAY_PER_CHAR = 100; // Base delay per character (in milliseconds)

// Function to calculate delay based on word length and multiplier
function calculateDelay(word) {
  const baseDelay = word.length * DELAY_PER_CHAR; // Base delay = char count * delay per char
  const multiplier = parseFloat(delayControl.value); // Delay multiplier from slider
  return baseDelay * multiplier; // Final delay
}

// Function to speak the next word
function speakNextWord() {
  if (currentWordIndex < words.length && isSpeaking) {
    const word = words[currentWordIndex];
    currentUtterance = new SpeechSynthesisUtterance(word);

    // Set speed (rate) from the slider
    currentUtterance.rate = parseFloat(speedControl.value);

    // Set selected voice
    const selectedVoice = voices[voiceSelect.value];
    if (selectedVoice) {
      currentUtterance.voice = selectedVoice;
    }

    // Highlight the current word
    highlightCurrentWord(word);

    // Speak the word
    synth.speak(currentUtterance);

    // When the word finishes speaking, wait for the delay and then move to the next word
    currentUtterance.onend = () => {
      const delay = calculateDelay(word); // Calculate delay for the next word
      timeoutId = setTimeout(() => {
        currentWordIndex++;
        if (isSpeaking && currentWordIndex < words.length) {
          speakNextWord();
        } else {
          // Reset when done
          isSpeaking = false;
          updateControls();
        }
      }, delay);
    };
  } else {
    // Reset when done
    isSpeaking = false;
    updateControls();
  }
}

// Function to highlight the current word in the textarea
function highlightCurrentWord(word) {
  const text = textInput.value;
  const startIndex = text.indexOf(word, currentWordIndex);
  const endIndex = startIndex + word.length;

  // Highlight the word
  textInput.setSelectionRange(startIndex, endIndex);
  textInput.focus();
}

// Function to update control buttons
function updateControls() {
  startButton.disabled = isSpeaking;
  pauseButton.disabled = !isSpeaking;
  resumeButton.disabled = !isSpeaking;
  stopButton.disabled = !isSpeaking;
}

// Load available voices
function loadVoices() {
  voices = synth.getVoices();
  voiceSelect.innerHTML = "";
  voices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });
  voiceSelect.disabled = false;
}

// Event Listeners
startButton.addEventListener("click", () => {
  if (!isSpeaking) {
    const text = textInput.value.trim();
    if (text !== "") {
      words = text.split(" ");
      currentWordIndex = 0;
      isSpeaking = true;
      wordCountDisplay.textContent = words.length;
      updateControls();
      speakNextWord();
    }
  }
});

pauseButton.addEventListener("click", () => {
  synth.pause();
  clearTimeout(timeoutId); // Clear the delay timeout
  isSpeaking = false; // Stop the highlighting and speech
  updateControls();
});

resumeButton.addEventListener("click", () => {
  synth.resume();
  isSpeaking = true; // Resume the highlighting and speech
  speakNextWord();
});

stopButton.addEventListener("click", () => {
  synth.cancel();
  clearTimeout(timeoutId); // Clear the delay timeout
  isSpeaking = false;
  currentWordIndex = 0;
  updateControls();
});

speedControl.addEventListener("input", () => {
  speedValue.textContent = speedControl.value;
  if (currentUtterance) {
    currentUtterance.rate = parseFloat(speedControl.value); // Update speed in real time
  }
});

delayControl.addEventListener("input", () => {
  delayValue.textContent = delayControl.value;
});

// Load voices when the API is ready
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = loadVoices;
}
