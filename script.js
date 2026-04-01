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

// Local edge-tts server
const TTS_SERVER_BASE = "http://127.0.0.1:8787";

// Browser SpeechSynthesis fallback
const synth = window.speechSynthesis;

let words = []; // Array of words
let wordPositions = []; // Array of word positions (start and end indices)
let currentWordIndex = 0;
let isSpeaking = false;
let isPaused = false; // Track if speech is paused
let voices = []; // currently loaded voices for the selected mode
let voiceMode = "browser"; // "edge" | "browser"

let audioEl = null;
let timeoutId = null; // delay timer between words
let inFlightAbort = null; // AbortController for fetch
let currentUtterance = null;

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
  const words = [];
  const positions = [];
  let currentIndex = 0;

  // Split text by spaces and newlines
  const tokens = text.split(/(\s+|\n)/); // Split by spaces or newlines

  tokens.forEach((token) => {
    if (token.trim() !== "") {
      const startIndex = text.indexOf(token, currentIndex);
      const endIndex = startIndex + token.length;
      words.push(token);
      positions.push({ word: token, start: startIndex, end: endIndex });
      currentIndex = endIndex;
    }
  });

  return { words, positions };
}

function resetHighlight() {
  quill.formatText(0, quill.getLength(), { background: "" });
}

function getSelectedVoiceShortName() {
  const idx = parseInt(voiceSelect.value, 10);
  const v = voices[idx];
  return v ? v.shortName : null;
}

function getSelectedBrowserVoice() {
  const idx = parseInt(voiceSelect.value, 10);
  const v = voices[idx];
  return v || null;
}

function clearInFlight() {
  if (inFlightAbort) {
    try {
      inFlightAbort.abort();
    } catch {
      // ignore
    }
  }
  inFlightAbort = null;
}

function stopAudio() {
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.src = "";
    } catch {
      // ignore
    }
  }
  audioEl = null;
}

function clearTimers() {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
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

async function loadVoices() {
  voiceSelect.disabled = true;
  voiceSelect.innerHTML = `<option value="">Loading voices...</option>`;
  // Try edge-tts server first (fast timeout), else fall back to browser voices
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 800);
    const res = await fetch(`${TTS_SERVER_BASE}/voices`, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`voices HTTP ${res.status}`);
    const edgeVoices = await res.json(); // [{shortName,name,gender,locale}]
    if (!Array.isArray(edgeVoices) || edgeVoices.length === 0) {
      throw new Error("no edge voices");
    }

    voiceMode = "edge";
    voices = edgeVoices;
    voiceSelect.innerHTML = "";
    voices.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${voice.name} (${voice.locale || "?"})`;
      voiceSelect.appendChild(option);
    });

    const preferred = voices.findIndex((v) =>
      String(v.shortName || "").includes("en-US-AriaNeural"),
    );
    if (preferred >= 0) voiceSelect.value = String(preferred);
    voiceSelect.disabled = false;
    return;
  } catch {
    // ignore and fall back
  }

  voiceMode = "browser";
  voices = synth.getVoices();
  voiceSelect.innerHTML = "";
  voices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });
  voiceSelect.disabled = voices.length === 0;
}

function speakNextWordBrowser() {
  if (!isSpeaking || isPaused) return;
  if (currentWordIndex >= words.length) {
    isSpeaking = false;
    isPaused = false;
    updateControls();
    return;
  }

  const word = words[currentWordIndex];
  currentUtterance = new SpeechSynthesisUtterance(word);
  currentUtterance.rate = parseFloat(speedControl.value);

  const selected = getSelectedBrowserVoice();
  if (selected) currentUtterance.voice = selected;

  highlightCurrentWord(currentWordIndex);
  synth.speak(currentUtterance);

  currentUtterance.onend = () => {
    if (!isSpeaking || isPaused) return;
    const delay = calculateDelay(word);
    timeoutId = setTimeout(() => {
      currentWordIndex++;
      speakNextWordBrowser();
    }, delay);
  };
}

async function speakNextWord() {
  if (!isSpeaking || isPaused) return;
  if (currentWordIndex >= words.length) {
    isSpeaking = false;
    isPaused = false;
    updateControls();
    return;
  }

  if (voiceMode === "browser") {
    speakNextWordBrowser();
    return;
  }

  const voice = getSelectedVoiceShortName();
  if (!voice) {
    // edge mode but no voice (or server down) => try fallback
    await loadVoices();
    if (voiceMode === "browser") {
      speakNextWordBrowser();
      return;
    }
    isSpeaking = false;
    isPaused = false;
    updateControls();
    return;
  }

  const word = words[currentWordIndex];
  highlightCurrentWord(currentWordIndex);

  clearInFlight();
  clearTimers();
  stopAudio();

  try {
    const ac = new AbortController();
    inFlightAbort = ac;
    const res = await fetch(`${TTS_SERVER_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: word,
        voice,
        rate: parseFloat(speedControl.value),
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`tts HTTP ${res.status}`);
    const data = await res.json();

    if (!isSpeaking || isPaused) return;
    audioEl = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
    audioEl.preload = "auto";

    audioEl.onended = () => {
      if (!isSpeaking || isPaused) return;
      const delay = calculateDelay(word);
      timeoutId = setTimeout(() => {
        currentWordIndex++;
        speakNextWord();
      }, delay);
    };

    await audioEl.play();
  } catch (e) {
    // If server disappears mid-run, fall back to browser voices for next run
    await loadVoices();
    if (!isSpeaking) return;
    isSpeaking = false;
    isPaused = false;
    updateControls();
  } finally {
    inFlightAbort = null;
  }
}

// Event Listeners
startButton.addEventListener("click", async () => {
  if (!isSpeaking) {
    const text = quill.getText().trim(); // Get plain text from Quill
    if (text !== "") {
      // Precompute word positions
      const { words: newWords, positions: newPositions } =
        precomputeWordPositions(text);
      words = newWords;
      wordPositions = newPositions;

      // Get the current selection
      const selection = quill.getSelection();
      if (selection && selection.index >= 0) {
        // Find the word at the selection start
        const selectedWordIndex = wordPositions.findIndex(
          (wp) => wp.start <= selection.index && wp.end >= selection.index,
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

      resetHighlight();
      await loadVoices(); // choose edge if available, else browser
      speakNextWord();
    }
  }
});

pauseButton.addEventListener("click", () => {
  if (isSpeaking && !isPaused) {
    clearTimers();
    clearInFlight();
    if (voiceMode === "browser") {
      try {
        synth.pause();
      } catch {
        // ignore
      }
    } else {
      if (audioEl) audioEl.pause();
    }
    isPaused = true; // Set paused state
    updateControls();
  }
});

resumeButton.addEventListener("click", () => {
  if (isSpeaking && isPaused) {
    isPaused = false;
    updateControls();
    if (voiceMode === "browser") {
      try {
        synth.resume();
      } catch {
        // ignore
      }
      speakNextWordBrowser();
      return;
    }

    if (audioEl && audioEl.paused) audioEl.play();
    else speakNextWord();
  }
});

stopButton.addEventListener("click", () => {
  clearTimers();
  clearInFlight();
  stopAudio();
  try {
    synth.cancel();
  } catch {
    // ignore
  }
  isSpeaking = false;
  isPaused = false;
  currentWordIndex = 0;
  updateControls();
  resetHighlight();
});

speedControl.addEventListener("input", () => {
  speedValue.textContent = speedControl.value;
});

// Update delay value display
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

// Load voices on page load (edge if available, else browser)
loadVoices();
