import { describe, it, expect } from "vitest";
import {
  firstSpeechOnset,
  computeVoiceOnsets,
  pairClipsToCues,
  syncClipsToVoiceover,
  alignedClipCount,
} from "../syncAudio.js";

// Build a tiny mono PCM-16 WAV so computeVoiceOnsets can stream it back (the WAV
// reader needs no AudioContext, so it works in the node test runner).
function wavFrom(samples, rate = 48000) {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); wstr(8, "WAVE");
  wstr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wstr(36, "data"); dv.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  }
  return new File([buf], "voice.wav", { type: "audio/wav" });
}

// 12 s of −60 dBFS noise with two tonal "lines" at 3.0s and 7.5s.
function voice() {
  const rate = 48000;
  const len = rate * 12;
  const s = new Float32Array(len);
  for (let i = 0; i < len; i++) s[i] = (Math.random() * 2 - 1) * 0.001;
  const tone = (from, dur, freq = 400, amp = 0.5) => {
    for (let i = Math.floor(from * rate); i < Math.floor((from + dur) * rate); i++) {
      s[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
    }
  };
  tone(3.0, 0.9);
  tone(7.5, 0.9);
  return s;
}

describe("firstSpeechOnset", () => {
  it("skips quiet audio and returns where sustained speech begins", () => {
    const step = 528; // ~11 ms at 48 kHz
    const rate = 48000;
    const env = new Float32Array(rate * 3 / step).fill(0.001); // silence for 3 s
    const startIdx = Math.floor((rate * 1.5) / step);          // speech at 1.5 s
    for (let i = startIdx; i < env.length; i++) env[i] = 0.4;  // sustained 0.3+
    const t = firstSpeechOnset(env, step, rate, 0, 3, 0.05);
    expect(t).not.toBeNull();
    expect((t * step * 0 + Math.abs(t - 1.5))).toBeLessThan(0.2);
  });

  it("returns null when the window is silent", () => {
    const env = new Float32Array(1000).fill(0.0005);
    expect(firstSpeechOnset(env, 44, 44100, 0, 1, 0.05)).toBeNull();
  });
});

describe("computeVoiceOnsets", () => {
  it("finds where each line actually speaks, not the cue times", async () => {
    const cues = [{ start: 4 }, { start: 8.5 }, { start: 10.8 }];
    const onsets = await computeVoiceOnsets(wavFrom(voice()), cues);
    expect(onsets).toHaveLength(3);
    expect(Math.abs(onsets[0].onset - 3.0)).toBeLessThan(0.15);
    expect(Math.abs(onsets[1].onset - 7.5)).toBeLessThan(0.15);
    expect(onsets[2].onset).toBeNull(); // window past all speech → silent
  });
});

describe("syncClipsToVoiceover", () => {
  const clip = (name, start, duration, gap = false) => ({ name, start, duration, gap });

  it("snaps images to onsets, rebuilds durations, keeps coverage", () => {
    const clips = [
      clip("a", 0, 10),
      clip("x", 10, 5, true), // a gap (removed/empty slot)
      clip("b", 15, 5),
    ];
    const onsets = [
      { cueStart: 0.2, onset: 0.4 },
      { cueStart: 15.1, onset: 12.8 }, // b arrives ~2.3s early, into the gap
    ];
    const out = syncClipsToVoiceover(clips, onsets);

    expect(out[0]).toBe(clips[0]);            // opener unchanged (clamped → no hole)
    expect(out[0].start).toBe(0);
    expect(out[1].start).toBe(10);            // gap slot itself doesn't move
    expect(out[2].start).toBe(12.8);
    expect(out[2].duration).toBeCloseTo(7.2, 3); // ends at the original total (20)
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i].start + out[i].duration).toBeLessThanOrEqual(out[i + 1].start + 1e-9);
    }
    expect(out[out.length - 1].start + out[out.length - 1].duration).toBeCloseTo(20, 3);
  });

  it("keeps images without a detected onset at their filename time", () => {
    const clips = [clip("a", 0, 6), clip("b", 6, 6), clip("c", 12, 6)];
    const onsets = [
      { cueStart: 0.1, onset: null }, // nothing detectable for a
      { cueStart: 6.2, onset: 4.1 },
    ];
    const out = syncClipsToVoiceover(clips, onsets);
    expect(out[0].start).toBe(0);   // onset null + opener → unchanged
    expect(out[1].start).toBe(4.1); // b pulled to speech − clamped to ≥ a end (0→+0.05) fine
    expect(out[2].start).toBe(12);  // unmatched → unchanged
    expect(out[2].duration).toBe(6);
  });

  it("returns the original array when there is nothing to align", () => {
    const clips = [clip("a", 0, 5)];
    expect(syncClipsToVoiceover(clips, [])).toBe(clips);
    expect(syncClipsToVoiceover(clips, null)).toBe(clips);
  });

  it("pairs each image to its nearest cue within slack", () => {
    const clips = [clip("a", 0, 5), clip("b", 5, 5)];
    const onsets = [{ cueStart: 0.1, onset: 0.2 }, { cueStart: 2, onset: 2.3 }];
    const pairs = pairClipsToCues(clips, onsets);
    expect(pairs[0].cueStart).toBe(0.1);
    expect(pairs[1].cueStart).toBe(2); // b grabs the leftover cue 2 (|2-5|=3 ≤ slack)
  });

  it("drops cues farther than the slack from every image", () => {
    const clips = [clip("a", 0, 5), clip("b", 5, 5)];
    const onsets = [{ cueStart: 0.1, onset: 0.2 }, { cueStart: 99, onset: 99 }];
    const pairs = pairClipsToCues(clips, onsets);
    expect(pairs[0].cueStart).toBe(0.1);
    expect(pairs[1]).toBeNull(); // 99s is out of slack and no earlier cue is left
  });

  it("counts images actually moved", () => {
    const clips = [clip("a", 0, 5), clip("b", 5, 5)];
    const onsets = [{ cueStart: 0.2, onset: 0.1 }, { cueStart: 5.1, onset: 3.2 }];
    expect(alignedClipCount(clips, onsets)).toBe(1); // a stays (onset earlier than 0), b moves
  });

  it("is idempotent and never mutates the onsets it is given", () => {
    const clips = [clip("a", 0, 6), clip("b", 6, 6), clip("c", 12, 6)];
    const onsets = [
      { cueStart: 0.1, onset: 0.2 },
      { cueStart: 6.4, onset: 4.1 },
      { cueStart: 12.5, onset: 9.9 },
    ];
    const before = JSON.stringify(onsets); // must be unchanged afterwards
    const first = syncClipsToVoiceover(clips, onsets);
    const reRun = pairClipsToCues(clips, onsets); // same inputs again
    const second = syncClipsToVoiceover(clips, onsets);
    expect(JSON.stringify(onsets)).toBe(before); // no _used flag leaked onto the source array
    expect(JSON.stringify(reRun)).toBe(JSON.stringify(pairClipsToCues(clips, onsets))); // deterministic
    expect(first.map((c) => c.start)).toEqual(second.map((c) => c.start)); // twice gives the same timeline
  });
});