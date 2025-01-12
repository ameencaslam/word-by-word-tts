// Initialize Quill Editor
const quill = new Quill("#editor", {
  theme: "snow",
  modules: {
    toolbar: [
      ["bold", "italic", "underline", "strike"], // Text formatting
      [{ header: 1 }, { header: 2 }], // Headers
      [{ list: "ordered" }, { list: "bullet" }], // Lists
      ["clean"], // Remove formatting
    ],
  },
  placeholder: "Enter text to speak...",
});

// DOM Elements
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
let words = []; // Array of words
let wordPositions = []; // Array of word positions (start and end indices)
let currentWordIndex = 0;
let isSpeaking = false;
let isPaused = false; // Track if speech is paused
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

// Function to precompute word positions
function precomputeWordPositions(text) {
  const words = text.split(" ");
  const positions = [];
  let currentIndex = 0;

  words.forEach((word) => {
    const startIndex = text.indexOf(word, currentIndex);
    const endIndex = startIndex + word.length;
    positions.push({ word, start: startIndex, end: endIndex });
    currentIndex = endIndex + 1; // Move to the next word
  });

  return positions;
}

// Function to speak the next word
function speakNextWord() {
  if (currentWordIndex < words.length && isSpeaking && !isPaused) {
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
    highlightCurrentWord(currentWordIndex);

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
          isPaused = false;
          updateControls();
        }
      }, delay);
    };
  }
}

// Function to highlight the current word in the editor
function highlightCurrentWord(wordIndex) {
  if (wordIndex < wordPositions.length) {
    const { start, end } = wordPositions[wordIndex];

    // Remove existing highlights
    quill.formatText(0, quill.getLength(), { background: "" });

    // Highlight the current word
    quill.formatText(start, end - start, { background: "yellow" });

    // Scroll to the highlighted word smoothly
    const scrollContainer = document.querySelector(".ql-editor");
    const wordElement = quill.getBounds(start); // Get the position of the word
    if (wordElement && scrollContainer) {
      const wordTop = wordElement.top;
      const wordBottom = wordElement.bottom;
      const containerHeight = scrollContainer.clientHeight;
      const scrollTop = scrollContainer.scrollTop;

      // Calculate the new scroll position
      if (wordTop < scrollTop) {
        // Word is above the visible area
        scrollContainer.scrollTo({ top: wordTop, behavior: "smooth" });
      } else if (wordBottom > scrollTop + containerHeight) {
        // Word is below the visible area
        scrollContainer.scrollTo({
          top: wordBottom - containerHeight,
          behavior: "smooth",
        });
      }
    }
  }
}

// Function to update control buttons
function updateControls() {
  startButton.disabled = isSpeaking;
  pauseButton.disabled = !isSpeaking || isPaused;
  resumeButton.disabled = !isSpeaking || !isPaused;
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
    const text = quill.getText().trim(); // Get plain text from Quill
    if (text !== "") {
      // Precompute word positions
      wordPositions = precomputeWordPositions(text);
      words = wordPositions.map((wp) => wp.word); // Extract words from positions

      // Get the current selection
      const selection = quill.getSelection();
      if (selection && selection.index >= 0) {
        // Find the word at the selection start
        const selectedWordIndex = wordPositions.findIndex(
          (wp) => wp.start <= selection.index && wp.end >= selection.index
        );
        if (selectedWordIndex >= 0) {
          currentWordIndex = selectedWordIndex; // Start from the selected word
        }
      } else {
        // If no selection, start from the beginning
        currentWordIndex = 0;
      }

      isSpeaking = true;
      isPaused = false;
      wordCountDisplay.textContent = words.length;
      updateControls();
      speakNextWord();
    }
  }
});

pauseButton.addEventListener("click", () => {
  if (isSpeaking && !isPaused) {
    synth.pause();
    clearTimeout(timeoutId); // Clear the delay timeout
    isPaused = true; // Set paused state
    updateControls();
  }
});

resumeButton.addEventListener("click", () => {
  if (isSpeaking && isPaused) {
    isPaused = false;
    updateControls();
    speakNextWord(); // Continue speaking
    synth.resume();
  }
});

stopButton.addEventListener("click", () => {
  synth.cancel();
  clearTimeout(timeoutId); // Clear the delay timeout
  isSpeaking = false;
  isPaused = false;
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

// Move cursor to the start of the first word after pasting
quill.root.addEventListener("paste", (event) => {
  // Allow the paste event to complete
  setTimeout(() => {
    const text = quill.getText().trim(); // Get plain text from Quill
    if (text !== "") {
      // Find the start of the first word
      const firstWordStart = text.search(/\S/); // Find the first non-whitespace character
      if (firstWordStart >= 0) {
        // Move the cursor to the start of the first word
        quill.setSelection(firstWordStart, 0);
      }
    }
  }, 10); // Small delay to ensure the paste operation is complete
});

// Load voices when the API is ready
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = loadVoices;
}
