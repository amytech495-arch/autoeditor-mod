// Decode an audio File and return its duration in seconds.
// Uses a detached <audio> element (works for mp3/wav across browsers).
export function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(d) || d <= 0) reject(new Error("Could not read audio duration"));
      else resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load audio file"));
    };
    el.src = url;
  });
}

// The numeric series key of an audio filename, or null when it has no digits.
// "1.mp3" → 1, "PART 02.wav" → 2, "ai_voice_10.m4a" → 10.
export function audioSeriesKey(name) {
  if (!name) return null;
  const base = String(name).replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
  const nums = base.match(/\d+/g);
  if (!nums || !nums.length) return null;
  return parseInt(nums[nums.length - 1], 10);
}

// Write an AudioBuffer as a 16-bit PCM WAV Blob (browser-native encoder).
function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let ch = 0; ch < numCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// Order an unordered list of audio files by their embedded series number when
// every file has one (1.mp3, 2.mp3, 3.mp3…) and by natural filename order
// otherwise. Pure + deterministic, so it's testable without browser APIs.
export function sortAudioSeries(files) {
  const allNumbered = Array.from(files).every((f) => audioSeriesKey(f.name) != null);
  return Array.from(files)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      if (allNumbered) {
        const n = audioSeriesKey(a.f.name) - audioSeriesKey(b.f.name);
        if (n) return n;
      }
      return a.f.name.localeCompare(b.f.name, undefined, { numeric: true });
    })
    .map((x) => x.f);
}

// Concatenate an unordered list of audio files into one WAV file, ordered by
// their embedded series number when every file has one (1.mp3, 2.mp3, 3.mp3…)
// and by natural filename order otherwise. Returns { file, duration, count }.
// Files that fail to decode are silently skipped.
export async function concatAudioSeries(files) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || !OAC) throw new Error("This browser can't mix audio files.");
  const decodeCtx = new AC();
  const decoded = [];
  try {
    for (const f of files) {
      try {
        const arr = await f.arrayBuffer();
        decoded.push({ f, b: await decodeCtx.decodeAudioData(arr) });
      } catch { /* skip undecodable file */ }
    }
  } finally {
    if (decodeCtx.close) { try { decodeCtx.close(); } catch { /* ignore */ } }
  }
  if (!decoded.length) throw new Error("Could not decode any of the audio files.");

  const ordered = sortAudioSeries(decoded.map((d) => d.f)).map((f) => decoded.find((d) => d.f === f));

  const rate = ordered[0].b.sampleRate;
  const channels = Math.max(...ordered.map((d) => d.b.numberOfChannels));
  const totalFrames = Math.ceil(ordered.reduce((s, d) => s + d.b.duration, 0) * rate);
  const off = new OAC(channels, totalFrames, rate);
  let at = 0;
  for (const { b } of ordered) {
    const src = off.createBufferSource();
    src.buffer = b;
    src.connect(off.destination);
    src.start(at);
    at += b.duration;
  }
  const merged = await off.startRendering();
  const firstStem = String(ordered[0].f.name).replace(/\.[^.]+$/, "");
  const lastStem = String(ordered[ordered.length - 1].f.name).replace(/\.[^.]+$/, "");
  const mergedName = firstStem === lastStem
    ? `${firstStem}.wav`
    : ordered.length > 1 ? `${firstStem}–${lastStem}.wav` : `${firstStem}.wav`;
  const file = new File([encodeWav(merged)], mergedName, { type: "audio/wav" });
  return { file, duration: merged.duration, count: ordered.length };
}

// Decode an uploaded media File (audio OR video) and return its duration in seconds.
// Uses a detached <video> element, which handles both kinds of files.
export function getMediaDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(d) || d <= 0) reject(new Error("Could not read media duration"));
      else resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load media file"));
    };
    el.src = url;
  });
}
