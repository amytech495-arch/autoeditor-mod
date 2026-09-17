// Sound-effect library + a tiny WebAudio preview engine.
//
// The library entries ship with the app (public/sfx/*), so they need no upload.
// Uploaded sounds live in the project store (see lib/projectStore) and are
// previewed from their blob URL. Both kinds are placed on the timeline's FX lane
// as markers; the export mix resolves each marker to one of these URLs.

export const SFX_LIB = [
  { id: "whoosh", label: "Whoosh", file: "/sfx/whoosh.mp3" },
  { id: "boom", label: "Boom", file: "/sfx/boom.mp3" },
  { id: "correct", label: "Correct", file: "/sfx/correct.mp3" },
  { id: "click", label: "Click", file: "/sfx/click.mp3" },
  { id: "shutter", label: "Shutter", file: "/sfx/shutter.mp3" },
  { id: "subtle", label: "Subtle", file: "/sfx/subtle.mp3" },
];

let _ctx = null;
const _decoded = new Map();   // url -> AudioBuffer
const _decoding = new Map();  // url -> Promise<AudioBuffer|null>
const _playing = new Set();   // live BufferSource nodes

function audioContext() {
  if (_ctx) return _ctx;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { _ctx = new AC(); } catch (_) { _ctx = null; }
  return _ctx;
}

// A user gesture is required before audio can start; call this from the click
// that triggers a preview so the context is running when the buffer is ready.
export function unlockSfxAudio() {
  const c = audioContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Fetch + decode once, then reuse. Corrupt/unsupported files resolve to null so
// a bad upload never breaks the panel.
export function loadSfxBuffer(url) {
  if (!url) return Promise.resolve(null);
  if (_decoded.has(url)) return Promise.resolve(_decoded.get(url));
  if (_decoding.has(url)) return _decoding.get(url);
  const c = audioContext();
  if (!c) return Promise.resolve(null);
  const p = (async () => {
    try {
      const res = await fetch(url);
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      _decoded.set(url, buf);
      return buf;
    } catch (_) {
      return null;
    } finally {
      _decoding.delete(url);
    }
  })();
  _decoding.set(url, p);
  return p;
}

export function playSfxBuffer(buffer, volume = 0.9) {
  const c = audioContext();
  if (!c || !buffer) return null;
  try {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume == null ? 0.8 : volume));
    src.connect(gain);
    gain.connect(c.destination);
    src.onended = () => _playing.delete(src);
    src.start();
    _playing.add(src);
    return src;
  } catch (_) {
    return null;
  }
}

// Play (or replay) a one-off preview. Stops any preview already in flight so
// double-clicking a row doesn't stack sounds.
export async function previewSfx(url, volume = 0.9) {
  unlockSfxAudio();
  stopSfxPreviews();
  const buf = await loadSfxBuffer(url);
  if (buf) playSfxBuffer(buf, volume);
}

export function stopSfxPreviews() {
  for (const src of _playing) { try { src.stop(); } catch (_) {} }
  _playing.clear();
}
