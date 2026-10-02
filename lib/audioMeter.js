// Live audio meters for the preview — peak/RMS level → a 0..1 bar position on a
// dB scale, plus the attack/decay + peak-hold smoothing that makes a meter read
// like hardware instead of flickering.
//
// The scale mirrors the HyperFrames Studio meter: the bar is split into labelled
// segments and each dB step gets an equal slice of the bar height (a "segment
// scale" rather than a true linear-dB axis), so -6 dB sits at the green/amber
// boundary and -3 dB at the amber/red one.

// dB breakpoints of the scale, top (loudest) first.
export const METER_SCALE = [0, -3, -6, -12, -24, -60];
export const FLOOR_DB = -60;

// Fraction of the bar height where the colour zones change.
const GREEN_TO_AMBER = 0.6; // -6 dB
const AMBER_TO_RED = 0.8;    // -3 dB

// linear amplitude (0..1+) → dB
export function toDb(amp) {
  if (!(amp > 0)) return -Infinity;
  return 20 * Math.log10(amp);
}

// dB → linear amplitude
export function fromDb(db) {
  if (!Number.isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

// Map a dB reading onto a 0..1 position on the segmented scale.
// Every step of METER_SCALE gets an equal slice; -60 dB is the bottom.
export function dbToPos(db) {
  if (!Number.isFinite(db)) return 0;
  if (db >= 0) return 1;
  if (db <= FLOOR_DB) return 0;
  // Walk the scale from the top down and find the segment containing db.
  for (let i = 0; i < METER_SCALE.length - 1; i++) {
    const top = METER_SCALE[i];
    const bottom = METER_SCALE[i + 1];
    if (db <= top && db >= bottom) {
      const slice = 1 / (METER_SCALE.length - 1);
      const within = (top - db) / (top - bottom);
      return 1 - (i + within) * slice;
    }
  }
  return 0;
}

// linear amplitude (from an AnalyserNode) → 0..1 bar position
export function ampToPos(amp) {
  return dbToPos(toDb(amp));
}

// Peak-hold and ballistics. A meter must jump up instantly and fall slowly, so
// the bar chases the input upwards but decays at a fixed rate; the peak line
// holds for PEAK_HOLD_MS before it, too, starts to fall.
const DECAY_PER_SEC = 0.9;
const PEAK_HOLD_MS = 1200;

// Advance one meter by dtMs. `state` is mutated and returned so callers can keep
// a plain object per channel.
export function advanceMeter(state, target, dtMs) {
  const dt = Math.max(0, Math.min(100, dtMs || 0)) / 1000;
  const decay = DECAY_PER_SEC * dt;
  // Rise instantly, fall gradually.
  if (target >= state.level) state.level = target;
  else state.level = Math.max(target, state.level - decay);
  if (target >= state.peak) {
    state.peak = target;
    state.peakAt = state.now;
  } else if (state.now - state.peakAt > PEAK_HOLD_MS) {
    state.peak = Math.max(target, state.peak - decay);
  }
  return state;
}

export function newMeterState(now = 0) {
  return { level: 0, peak: 0, peakAt: -1e9, now };
}

// Colour zone a 0..1 position falls into.
export function meterZone(pos) {
  if (pos <= 0) return "green";
  if (pos <= GREEN_TO_AMBER) return "green";
  if (pos <= AMBER_TO_RED) return "amber";
  return "red";
}

// Rendered heights for a meter's coloured zones (fractions of the bar).
export function meterZones() {
  return { green: GREEN_TO_AMBER, amber: AMBER_TO_RED - GREEN_TO_AMBER, red: 1 - AMBER_TO_RED };
}

// RMS of a time-domain buffer, used to drive a meter from an AnalyserNode.
export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

// The rail shows the narration only. Background clips and sound effects still
// run through the audio bus (they have to, to reach the speakers) but are not
// metered, so their ids exist for routing rather than for a visible strip.
export const VOICE_STRIP = "voice";
export const bgStripId = (id) => `bg:${id}`;
export const sfxStripId = (id) => `sfx:${id}`;

// Strip id the editor's meter loop knows how to read.
export const VOICE_ID = VOICE_STRIP;

// The single meter strip. setVolume reuses the editor's existing narration
// volume setter rather than inventing a second source of truth.
export function buildMeterStrips({ voiceLevel = 1, setVoiceLevel } = {}) {
  return [{
    id: VOICE_STRIP,
    label: "Voice",
    volume: voiceLevel,
    setVolume: (v) => setVoiceLevel && setVoiceLevel(v),
  }];
}