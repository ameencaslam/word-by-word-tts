## Word-by-Word TTS

A small browser tool to help you read text **without staring at the screen**: paste text into the editor and it will **speak word-by-word** while **highlighting the current word**.

- **Live demo**: `https://ameencaslam.github.io/word-by-word-tts/`

---

## Features

- **Word-by-word speech**: speaks one word at a time (not full sentences).
- **Word highlighting**: highlights the currently spoken word in the editor.
- **Start from cursor**: place the cursor on a word and press Start to begin from there.
- **Speed control**: adjusts speech rate.
- **Delay multiplier**: adds a configurable pause between words (useful for pacing).
- **Better voices (optional)**: supports Microsoft neural voices via a local `edge-tts` backend.
- **Auto fallback**: if the local backend is not available, it falls back to the browser’s built-in voices (`speechSynthesis`).

---

## Voice modes (how it chooses voices)

This project supports **two voice modes**:

### 1) Neural voices (best quality) via local `edge-tts` server

If a local server is running at `http://127.0.0.1:8787`, the app will load **English neural voices** (example: `en-US-AriaNeural`) and will use them for word-by-word playback.

### 2) Browser voices fallback (no server required)

If the server is not running (or not reachable), the app automatically uses the browser’s built-in voices using the **Web Speech API** (`window.speechSynthesis`).

**Important**: the dropdown always shows voices for the currently active mode.

---

## Quick start (browser-only / no Python)

1. Open `index.html` in your browser.
2. Select a voice.
3. Paste text and press **Start**.

This will use **browser voices**.

---

## Better voices (Windows) with `edge-tts` (recommended)

### Requirements

- Python 3.10+ recommended

### Install

From the project folder:

```bash
python -m pip install -r requirements.txt
```

### Run the local TTS server

```bash
python server.py
```

The server listens on:

- `http://127.0.0.1:8787/voices`
- `http://127.0.0.1:8787/tts`

### Use it

1. Start the server (command above).
2. Refresh the page (so it reloads the voice list).
3. Pick an English neural voice from the dropdown.

If you close the server later, the tool will still work (it will fall back to browser voices).

---

## How it works (high-level)

### Frontend

- The UI is plain HTML + Bootstrap + Quill editor.
- When you press **Start**, the tool:
  - splits your text into words
  - highlights the current word
  - speaks **one word**
  - waits the configured delay
  - continues with the next word

### Backend (optional)

- `server.py` exposes a small API for neural TTS using `edge-tts`.
- The frontend calls it to generate an MP3 for each word when the server is available.

---

## Troubleshooting

### Voices dropdown says “Loading…” or is empty

- **If using Python mode**: make sure `python server.py` is running, then refresh.
- **If using browser mode**: some browsers populate `speechSynthesis.getVoices()` lazily; refreshing usually helps.

### “Start the local TTS server first”

That means the app couldn’t reach `http://127.0.0.1:8787/voices`.
Start the server (`python server.py`) or just use the built-in browser voices.

### Browser blocks requests to localhost when opened as `file://`

Some browsers restrict `file://` pages from calling `http://127.0.0.1`.
If that happens, run a local static server (any one of these):

```bash
python -m http.server 8000
```

Then open:

- `http://127.0.0.1:8000/index.html`

### Audio doesn’t play

- Make sure the tab is allowed to autoplay audio (some browsers require a user gesture; pressing Start counts as one).
- Check the browser console for errors.

---

## Files

- `index.html`: UI
- `script.js`: word-by-word logic + voice mode fallback
- `styles.css`: styling
- `server.py`: optional neural TTS server (`edge-tts`)
- `requirements.txt`: Python dependencies
