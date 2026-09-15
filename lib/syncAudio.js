// Image ↔ narration auto-sync. The tool normally places every image at the
// timestamp parsed from its FILENAME and plays the voiceover at its own internal
// times, so a voiceover that drifts from the script's absolute gaps (e.g. per-line
// TTS stitched back-to-back) shows the narration a couple of seconds BEFORE the
// matching image. This module closes that gap: it reads the actual voiceover,
// finds where each line's speech begins, and hands back per-cue onsets so the
// caller can snap image starts onto the real audio.
//
// Memory-safe like the renderer: createVoiceSource streams a WAV straight from
// the file (or decodes once and offloads to OPFS) — we never hold the whole
// decoded track. We only keep a ~10 ms RMS envelope of the whole file, which is
// a few hundred KB even for a 25-minute voiceover.
import { createVoiceSource } from "./voiceSource";

// Search window around each cue.start for its speech onset. BIASED EARLY because
// the failure mode this fixes is TTS packing lines earlier than the script gaps.
export const SYNC_LEAD_SEC = 2.5; // how far before the cue to search
export const SYNC_TAIL_SEC = 1.0; // how far after the cue to keep searching

const PAIR_SLACK = 8; // a cue farther than this from an image is not that image's line

// Fold the voiceover down to an RMS envelope: one value per ~11 ms hop, computed
// over a ~21 ms analysis window, from overlapping chunked reads (no per-frame
// seeks). Returns { env: Float32Array, step: samples per hop, rate } — or null.
async function rmsEnvelope(src) {
  const rate = src.sampleRate;
  const total = src.length;
  if (!(total > 0)) return null;
  const frame = Math.max(128, Math.round(rate * 0.021)); // ~21 ms
  const step = Math.max(64, Math.round(rate * 0.011));   // ~11 ms
  const frameCount = Math.ceil(total / step);
  const env = new Float32Array(frameCount);
  const CHUNK = 1 << 18; // samples per read (~5.5 s at 48 kHz)
  const perChunk = Math.max(1, Math.floor(CHUNK / step));
  let f = 0;
  while (f < frameCount) {
    const fEnd = Math.min(frameCount, f + perChunk);
    const startSample = f * step;
    const need = (fEnd - f - 1) * step + frame;
    let win;
    try { win = await src.read(startSample, need); } catch (_) { win = null; }
    const s = (win && win[0]) || new Float32Array(need);
    for (let j = f; j < fEnd; j++) {
      const o = j * step - startSample;
      const n = Math.min(frame, need - o);
      let sum = 0;
      const lim = o + n;
      for (let i = o; i < lim; i++) { const v = s[i] || 0; sum += v * v; }
      env[j] = n > 0 ? Math.sqrt(sum / n) : 0;
    }
    f = fEnd;
  }
  return { env, step, rate };
}

// An adaptive speech threshold: high enough to clear the background/silence floor
// of THIS file, low enough to catch quiet speech. Uses a percentile floor so a
// mostly-silent voiceover (typical) doesn't inflate it.
function speechThreshold(env) {
  const sorted = Array.from(env).sort((a, b) => a - b);
  const floor = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2))]; // 20th pct
  return {
    span: Math.max(0.003, Math.max(floor, 0) * 4), // ~0.003 ≈ −50 dBFS absolute floor
  };
}

const secToFrame = (sec, step, rate) => Math.floor((sec * rate) / step);
const frameToSec = (i, step, rate) => (i * step) / rate;

// The first moment in [fromSec, toSec] where speech energy starts AND holds:
// the candidate frame must clear the threshold and so must a majority of the next
// ~0.3 s (rules out clicks/transients). Returns seconds, or null if the window
// looks silent / is past the audio.
export function firstSpeechOnset(env, step, rate, fromSec, toSec, thr) {
  if (!env || !env.length || !(thr > 0)) return null;
  const a = Math.max(0, secToFrame(fromSec, step, rate));
  const b = Math.max(a, secToFrame(toSec, step, rate));
  const sustain = Math.max(1, Math.round((rate * 0.3) / step)); // ~0.3 s
  for (let i = a; i <= b; i++) {
    if (i >= env.length) break;
    if (env[i] < thr) continue;
    const n = Math.min(sustain, env.length - i);
    let above = 0;
    for (let j = i; j < i + n; j++) if (env[j] >= thr) above += 1;
    if (n > 0 && above / n >= 0.5) return frameToSec(i, step, rate);
  }
  return null;
}

// Estimate where each transcript line's speech actually begins inside the
// voiceover. Returns an array parallel to `cues`:
//   [{ cueStart, onset }]  (onset = seconds into the audio, or null when the
//   window looked silent — callers then keep the image's original timestamp).
// Returns null if the audio can't be read at all.
export async function computeVoiceOnsets(audioFile, cues) {
  if (!audioFile || !Array.isArray(cues) || !cues.length) return null;
  const src = await createVoiceSource(audioFile, [48000, 44100]);
  if (!src) return null;
  const rate = src.sampleRate;
  const env = await rmsEnvelope(src);
  try { if (src.dispose) await src.dispose(); } catch (_) {}
  if (!env) return null;
  const { step } = env;
  const thr = speechThreshold(env.env);
  return cues.map((c) => {
    const onset = firstSpeechOnset(
      env.env, step, rate,
      Math.max(0, (c.start || 0) - SYNC_LEAD_SEC),
      (c.start || 0) + SYNC_TAIL_SEC,
      thr.span,
    );
    return { cueStart: c.start || 0, onset };
  });
}

// Which image belongs to which line: greedily pair non-gap clips to cues so that
// |cue.start − clip.start| is minimised (each cue used once, order-preserving).
// Robust to a missing image (pairing re-syncs) and to cues far off a clip.
// Returns per-clip { cueStart, onset } | null.
export function pairClipsToCues(clips, onsets, slack = PAIR_SLACK) {
  if (!Array.isArray(onsets) || !onsets.length) return clips.map(() => null);
  const sorted = onsets.slice().sort((a, b) => a.cueStart - b.cueStart);
  const usedCues = new Set();
  let ptr = 0;
  return clips.map((c) => {
    if (c.gap) return null;
    while (ptr < sorted.length && sorted[ptr].cueStart < c.start - slack) ptr += 1;
    let best = -1;
    let bestD = Infinity;
    for (let k = ptr; k < sorted.length; k++) {
      if (usedCues.has(k)) continue;
      const d = Math.abs(sorted[k].cueStart - c.start);
      if (d > slack) break; // sorted, so farther cues can only get farther
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best < 0) return null;
    usedCues.add(best);
    return { cueStart: sorted[best].cueStart, onset: sorted[best].onset };
  });
}

// Snap each non-gap clip's start onto the ACTUAL speech onset of its line (see
// computeVoiceOnsets), then rebuild durations monotonically so the timeline still
// covers [0, end] with no holes or overlaps. `onsets` = [{ cueStart, onset|null }]
// in screen order. Unpaired clips and "no speech found" cues keep their filename
// timestamps. Returns the same array (object identity preserved for unchanged
// clips) when there is nothing worth aligning.
export function syncClipsToVoiceover(clips, onsets) {
  if (!Array.isArray(clips) || !clips.length) return clips;
  if (!Array.isArray(onsets) || !onsets.length) return clips;
  const end0 = clips[clips.length - 1].start + clips[clips.length - 1].duration;
  const pairs = pairClipsToCues(clips, onsets);
  const start = [];
  let prev = -Infinity;
  clips.forEach((c, i) => {
    const p = pairs[i];
    let s = (p && p.onset != null) ? +p.onset.toFixed(3) : c.start;
    if (i === 0) s = Math.min(s, c.start); // only move the opener earlier − else a hole at t=0
    s = Math.max(i === 0 ? 0 : prev + 0.05, s); // monotonic, ≥50 ms apart
    start.push(s);
    prev = s;
  });
  return clips.map((c, i) => {
    const st = start[i];
    const next = i + 1 < start.length ? start[i + 1] : end0;
    let dur = +(next - st).toFixed(3);
    if (!(dur > 0)) dur = 0.05;
    if (c.start === st && c.duration === dur) return c;
    return { ...c, start: st, duration: dur };
  });
}

// How many non-gap clips actually moved once sync is applied (for the UI status).
export function alignedClipCount(clips, onsets) {
  if (!Array.isArray(clips) || !Array.isArray(onsets)) return 0;
  const synced = syncClipsToVoiceover(clips, onsets);
  let n = 0;
  for (let i = 0; i < clips.length; i++) {
    if (clips[i].gap) continue;
    if (Math.abs(synced[i].start - clips[i].start) > 0.05) n += 1;
  }
  return n;
}