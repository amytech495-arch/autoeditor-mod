import { describe, it, expect } from "vitest";
import {
  sanitizeVoiceFx, voiceFxFilterString, biquadCoeffs, createVoiceFxProcessor,
} from "./voiceFx";

describe("sanitizeVoiceFx", () => {
  it("returns null for garbage and for a 'none' effect", () => {
    expect(sanitizeVoiceFx(null)).toBeNull();
    expect(sanitizeVoiceFx(undefined)).toBeNull();
    expect(sanitizeVoiceFx("bass")).toBeNull();
    expect(sanitizeVoiceFx({})).toBeNull();
    expect(sanitizeVoiceFx({ effect: "bogus", strength: 50 })).toBeNull();
  });

  it("clamps strength to 0–100", () => {
    expect(sanitizeVoiceFx({ effect: "bass", strength: 300 })).toEqual({ effect: "bass", strength: 100 });
    expect(sanitizeVoiceFx({ effect: "bass", strength: -5 })).toEqual({ effect: "bass", strength: 0 });
    expect(sanitizeVoiceFx({ effect: "bass", strength: "bad" })).toEqual({ effect: "bass", strength: 0 });
  });

  it("maps strength to the ffmpeg chains", () => {
    expect(voiceFxFilterString({ effect: "bass", strength: 50 })).toBe("bass=g=6.00:f=110");
    expect(voiceFxFilterString({ effect: "clarity", strength: 100 })).toBe("equalizer=f=3200:t=q:w=1.0:g=8.00");
    expect(voiceFxFilterString({ effect: "compress", strength: 100 })).toBe("acompressor=threshold=0.0631:ratio=8.00:attack=12:release=150:makeup=2.0");
    expect(voiceFxFilterString({ effect: "compress", strength: 0 })).toBe("");
    expect(voiceFxFilterString({ effect: "radio", strength: 100 })).toBe("highpass=f=300,lowpass=f=3200");
    expect(voiceFxFilterString({ effect: "radio", strength: 0 })).toBe("");
    expect(voiceFxFilterString(null)).toBe("");
  });
});

describe("biquadCoeffs", () => {
  it("produces finite, normalised coefficients for the shelf/peak/band kinds", () => {
    for (const kind of ["lowshelf", "peaking", "highpass", "lowpass"]) {
      const c = biquadCoeffs(kind, 1000, 48000, { gainDb: 6 });
      for (const k of ["b0", "b1", "b2", "a1", "a2"]) {
        expect(Number.isFinite(c[k])).toBe(true);
        expect(Math.abs(c[k])).toBeLessThan(4);
      }
    }
  });
});

describe("createVoiceFxProcessor", () => {
  it("returns null when there is no effect", () => {
    expect(createVoiceFxProcessor(null, 48000)).toBeNull();
    expect(createVoiceFxProcessor({ effect: "bass", strength: 0 }, 48000)).toBeNull();
  });

  it("bass boost changes the samples but keeps length", () => {
    const proc = createVoiceFxProcessor({ effect: "bass", strength: 100 }, 48000);
    const ch = new Float32Array([0, 0.1, -0.2, 0.3, -0.4, 0.5]);
    const before = Float32Array.from(ch);
    const out = proc.process([ch])[0];
    expect(out.length).toBe(before.length);
    // a low-shelf boost should move low-energy samples away from their input
    let diff = 0;
    for (let i = 0; i < out.length; i++) diff += Math.abs(out[i] - before[i]);
    expect(diff).toBeGreaterThan(1e-3);
  });

  it("compression lowers a constant loud input below its pre-makeup level", () => {
    const proc = createVoiceFxProcessor({ effect: "compress", strength: 100 }, 48000);
    const ch = new Float32Array(4800).fill(0.9); // ~100ms of loud constant tone
    proc.process([ch]);
    // Attack (12 ms) lets ~the first 576 samples through at makeup gain. After the
    // envelope locks on, threshold -24 dB ≈ 0.063 with ratio 8 → steady output
    // ≈ 0.9 × 10^(-20 dB) × makeup ≈ 0.11, well below the 0.9 input.
    const steady = ch.slice(2000);
    const peak = Math.max(...steady.map((x) => Math.abs(x)));
    expect(peak).toBeLessThan(0.5);
  });

  it("radio band narrows the spectrum (damps DC and high content)", () => {
    const proc = createVoiceFxProcessor({ effect: "radio", strength: 100 }, 48000);
    // A DC-ish long pulse and a burst: bandpass 300–3200 Hz keeps the mid content.
    const src = new Float32Array(48000).fill(0.5); // pure DC → fully rejected
    proc.process([src]);
    // After the highpass ramp-in the steady-state output should be near zero.
    const tail = src.slice(24000).reduce((s, x) => s + Math.abs(x), 0) / 24000;
    expect(tail).toBeLessThan(0.05);
  });
});