// Voice-over audio enhancement catalogue. One effect definition drives all three
// places the narration is heard or rendered:
//
//   • ffmpeg export  → voiceFxFilterString() gives the -af/-filter_complex chain
//   • live preview   → buildVoiceFxNodes(ctx) gives the WebAudio node chain
//   • WebCodecs export → createVoiceFxProcessor() gives a streaming sample DSP
//
// Strength is always a 0–100 slider; each effect maps it onto its own parameter
// so 0 = neutral. Effects are kept biquad/filter-based so the ffmpeg chain, the
// WebAudio graph and the JS DSP stay audibly close.

export const VOICE_FX = [
  { id: "bass", label: "Bass Boost", desc: "Adds low-end weight around 110 Hz for a fuller voice." },
  { id: "clarity", label: "Clarity", desc: "Brightens speech around 3 kHz so the narration reads crisper." },
  { id: "compress", label: "Compression", desc: "Smooths uneven levels so loud and quiet lines sit closer together." },
  { id: "radio", label: "Radio Effect", desc: "Retro telephone band — beefs up, then narrows the top end for a lo-fi radio voice." },
];

// Normalize an arbitrary value into a safe { effect, strength } or null.
export function sanitizeVoiceFx(value) {
  if (!value || typeof value !== "object") return null;
  const effect = VOICE_FX.some((e) => e.id === value.effect) ? value.effect : null;
  if (!effect) return null;
  const strength = Math.max(0, Math.min(100, Number(value.strength) || 0));
  return { effect, strength };
}

// ---- ffmpeg ---------------------------------------------------------------
// Returns a comma-joined audio filter chain (e.g. "bass=g=6.00:f=110") or "".
export function voiceFxFilterString(fx) {
  const v = sanitizeVoiceFx(fx);
  if (!v || v.strength <= 0) return "";
  const s = v.strength;
  switch (v.effect) {
    case "bass": {
      const g = (s / 100) * 12;
      return `bass=g=${g.toFixed(2)}:f=110`;
    }
    case "clarity": {
      const g = (s / 100) * 8;
      return `equalizer=f=3200:t=q:w=1.0:g=${g.toFixed(2)}`;
    }
    case "compress": {
      const thresholdDb = -2 - (s / 100) * 22;
      // The bundled ffmpeg 6.0 acompressor expects threshold in LINEAR level
      // (0–1, 1 = 0 dBFS), so convert from the dB parameterization used by the
      // WebAudio / WebCodecs paths.
      const threshold = Math.pow(10, thresholdDb / 20);
      const ratio = 1.5 + (s / 100) * 6.5;
      const makeup = (s / 100) * 2;
      return `acompressor=threshold=${threshold.toFixed(4)}:ratio=${ratio.toFixed(2)}:attack=12:release=150:makeup=${makeup.toFixed(1)}`;
    }
    case "radio": {
      const hi = 8000 - (s / 100) * (8000 - 3200);
      return `highpass=f=300,lowpass=f=${hi.toFixed(0)}`;
    }
    default:
      return "";
  }
}

// ---- WebAudio (live preview) ----------------------------------------------
// Returns the node list for one effect, already configured but NOT connected
// (the caller owns the chain wiring). Empty array = passthrough.
export function buildVoiceFxNodes(ctx, fx) {
  const v = sanitizeVoiceFx(fx);
  if (!v || v.strength <= 0 || !ctx || !ctx.createBiquadFilter) return [];
  const s = v.strength;
  const nodes = [];
  const biquad = (type, frequency, gain = 0, q = 1) => {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = frequency; n.Q.value = q; n.gain.value = gain;
    return n;
  };
  switch (v.effect) {
    case "bass":
      nodes.push(biquad("lowshelf", 110, (s / 100) * 12));
      break;
    case "clarity":
      nodes.push(biquad("peaking", 3200, (s / 100) * 8));
      break;
    case "compress": {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -2 - (s / 100) * 22;
      c.ratio.value = 1.5 + (s / 100) * 6.5;
      c.knee.value = 10;
      c.attack.value = 0.012;
      c.release.value = 0.15;
      nodes.push(c);
      const make = ctx.createGain();
      make.gain.value = Math.pow(10, ((s / 100) * 2) / 20); // makeup in dB
      nodes.push(make);
      break;
    }
    case "radio": {
      const hi = 8000 - (s / 100) * (8000 - 3200);
      nodes.push(biquad("highpass", 300, 0, Math.SQRT1_2));
      nodes.push(biquad("lowpass", hi, 0, Math.SQRT1_2));
      break;
    }
    default:
      return [];
  }
  return nodes;
}

// ---- Streaming sample DSP (WebCodecs render) ------------------------------
// The renderer mixes the narration as short per-window slices (see voiceSource.js),
// so the effect must be a streaming processor with state carried across windows —
// a full-buffer OfflineAudioContext render would defeat the memory-safe design.

// RBJ Audio-EQ-Cookbook biquad coefficients (same formulas Chrome's BiquadFilter
// uses, so the WebCodecs output matches the live preview closely).
export function biquadCoeffs(kind, f, sampleRate, { gainDb = 0, q = 1 } = {}) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const alpha = sinw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  switch (kind) {
    case "lowshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cosw + s);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw);
      b2 = A * ((A + 1) - (A - 1) * cosw - s);
      a0 = (A + 1) + (A - 1) * cosw + s;
      a1 = -2 * ((A - 1) + (A + 1) * cosw);
      a2 = (A + 1) + (A - 1) * cosw - s;
      break;
    }
    case "peaking":
      b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
      break;
    case "highpass":
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
      break;
    case "lowpass":
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
      break;
    default:
      return null;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  return { b0, b1, b2, a1, a2 };
}

// Run a biquad over `ch`, updating its internal state (in place).
function runBiquad(f, ch) {
  const { b0, b1, b2, a1, a2 } = f.c;
  const st = f.st;
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    const y = b0 * x + b1 * st.x1 + b2 * st.x2 - a1 * st.y1 - a2 * st.y2;
    st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
    ch[i] = y;
  }
}

// A streaming soft-knee-ish compressor that mirrors the ffmpeg/WebAudio
// parameterization: envelope-followed level → gain reduction above threshold.
function makeStreamCompressor(sampleRate, { thresholdDb, ratio, attackSec = 0.012, releaseSec = 0.15, makeupDb = 0 }) {
  const thr = Math.pow(10, thresholdDb / 20);
  const oneOverRatio = 1 - 1 / ratio;
  const makeup = Math.pow(10, makeupDb / 20);
  const att = 1 - Math.exp(-1 / (attackSec * sampleRate));
  const rel = 1 - Math.exp(-1 / (releaseSec * sampleRate));
  const state = { env: 0 };
  return {
    process(ch) {
      for (let i = 0; i < ch.length; i++) {
        const x = ch[i];
        const lv = Math.abs(x);
        state.env += (lv > state.env ? att : rel) * (lv - state.env);
        let g = 1;
        if (state.env > thr) {
          const overDb = 20 * Math.log10(state.env / thr);
          g = Math.pow(10, (-overDb * oneOverRatio) / 20);
        }
        ch[i] = x * g * makeup;
      }
    },
  };
}

// Returns a { process(channels) } streaming processor, or null when there is no
// active effect. `channels` is a Float32Array[] (one per source channel) that is
// processed in place.
export function createVoiceFxProcessor(fx, sampleRate) {
  const v = sanitizeVoiceFx(fx);
  if (!v || v.strength <= 0) return null;
  const sr = sampleRate || 48000;
  const s = v.strength;

  if (v.effect === "compress") {
    const comps = [];
    const makeComp = () => makeStreamCompressor(sr, {
      thresholdDb: -2 - (s / 100) * 22,
      ratio: 1.5 + (s / 100) * 6.5,
      makeupDb: (s / 100) * 2,
    });
    return {
      process(channels) {
        for (let c = 0; c < channels.length; c++) {
          if (c >= comps.length) comps.push(makeComp());
          comps[c].process(channels[c]);
        }
        return channels;
      },
    };
  }

  let spec = null;
  if (v.effect === "bass") spec = [{ kind: "lowshelf", f: 110, gainDb: (s / 100) * 12 }];
  else if (v.effect === "clarity") spec = [{ kind: "peaking", f: 3200, gainDb: (s / 100) * 8 }];
  else if (v.effect === "radio") {
    const hi = 8000 - (s / 100) * (8000 - 3200);
    spec = [{ kind: "highpass", f: 300 }, { kind: "lowpass", f: hi }];
  }
  if (!spec) return null;
  const filters = spec.map(({ kind, f, gainDb = 0 }) => ({
    c: biquadCoeffs(kind, f, sr, { gainDb }),
    st: { x1: 0, x2: 0, y1: 0, y2: 0 },
  }));
  let perChannel = null;
  return {
    process(channels) {
      if (!perChannel || perChannel.length !== channels.length) {
        perChannel = channels.map(() => filters.map((f) => ({ c: f.c, st: { x1: 0, x2: 0, y1: 0, y2: 0 } })));
      }
      for (let c = 0; c < channels.length; c++) {
        for (const f of perChannel[c]) runBiquad(f, channels[c]);
      }
      return channels;
    },
  };
}