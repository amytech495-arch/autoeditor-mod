// Image effects shared by the live preview (canvas) and the WebCodecs export.
// Each effect has a CSS-filter "grade" pass (applied by re-drawing the composed
// frame through a filter) plus full-frame overlays (grain, vignette, scanlines).
// `amount` is 0–1 intensity. Effects are per-clip (fxByName) with a global
// intensity (fxAmount). The overlay pattern is seeded once per clip name, and
// grain-y effects (film grain, noise, VHS, dust) additionally mix in a per-frame
// tick so they shimmer while the clip plays; vignette and grunge stay static so
// they don't pulse or pop.

export const FX_LIST = [
  { id: "none", label: "None", icon: "⊘" },
  { id: "bw", label: "Black and white", icon: "◐" },
  { id: "sepia", label: "Sepia", icon: "🟤" },
  { id: "warm", label: "Warm", icon: "🔥" },
  { id: "cool", label: "Cool", icon: "❄️" },
  { id: "film-grain", label: "Film grain", icon: "🎞️" },
  { id: "noise", label: "Noise", icon: "📺" },
  { id: "vignette", label: "Vignette", icon: "◑" },
  { id: "vhs", label: "VHS", icon: "📼" },
  { id: "grunge", label: "Grunge", icon: "🖤" },
  { id: "dust", label: "Dust", icon: "🌫️" },
  { id: "heavy-noise", label: "Heavy noise", icon: "🌪️" },
];

export const FX_IDS = FX_LIST.map((f) => f.id);

export function fxOf(id) {
  return FX_LIST.find((f) => f.id === id) || FX_LIST[0];
}

// Deterministic PRNG (mulberry32). It's seeded ONCE per clip from the clip's name
// (see fxSeed), so the vignette/grunge/grain pattern is stable for the whole clip
// instead of re-randomizing every frame (which made effects pulse/pop on screen).
function rnd(seed) {
  let a = (seed >>> 0) + 0x6D2B79F5;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable per-clip pattern seed, derived from the clip's name so the preview and the
// export draw the exact same overlay and no frame differs from its neighbour.
export function fxSeed(name) {
  let h = 2166136261;
  const s = String(name == null ? "" : name);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) + 0x9e3779b9;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// CSS filter string for the grade pass at intensity amount (0–1). "" = no re-draw.
export function fxFilter(id, amount) {
  if (!id || id === "none" || amount <= 0) return "";
  const a = clamp(amount, 0, 1);
  switch (id) {
    case "bw": return `grayscale(${a.toFixed(3)})`;
    case "sepia": return `sepia(${a.toFixed(3)})`;
    case "warm": return `brightness(${(1 + 0.05 * a).toFixed(3)}) sepia(${(0.55 * a).toFixed(3)}) saturate(${(1 + 0.4 * a).toFixed(3)}) hue-rotate(${(-14 * a).toFixed(2)}deg)`;
    case "cool": return `brightness(${(1 + 0.04 * a).toFixed(3)}) sepia(${(0.12 * a).toFixed(3)}) saturate(${(1 - 0.3 * a).toFixed(3)}) hue-rotate(${(13 * a).toFixed(2)}deg) contrast(${(1 + 0.05 * a).toFixed(3)})`;
    case "film-grain": return `contrast(${(1 + 0.08 * a).toFixed(3)}) saturate(${(0.95 + 0.05 * a).toFixed(3)})`;
    case "noise": return `contrast(${(1 + 0.12 * a).toFixed(3)}) brightness(${(1 - 0.05 * a).toFixed(3)}) saturate(${(0.95 + 0.05 * a).toFixed(3)})`;
    case "vignette": return `brightness(${(1 - 0.06 * a).toFixed(3)})`;
    case "vhs": return `saturate(${(1 + 0.35 * a).toFixed(3)}) contrast(${(1 + 0.12 * a).toFixed(3)})`;
    case "grunge": return `grayscale(${(0.45 * a).toFixed(3)}) sepia(${(0.15 * a).toFixed(3)}) contrast(${(1 + 0.22 * a).toFixed(3)}) brightness(${(1 - 0.05 * a).toFixed(3)})`;
    case "dust": return `brightness(${(1 + 0.06 * a).toFixed(3)}) saturate(${(1 - 0.1 * a).toFixed(3)}) sepia(${(0.18 * a).toFixed(3)})`;
    case "heavy-noise": return `contrast(${(1 + 0.25 * a).toFixed(3)}) brightness(${(1 - 0.08 * a).toFixed(3)}) saturate(${(0.9 + 0.1 * a).toFixed(3)})`;
    default: return "";
  }
}

function grain(ctx, W, H, count, alpha, size, rnd) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#808080";
  for (let i = 0; i < count; i++) {
    const s = size * (0.4 + rnd() * 1.2);
    const v = Math.floor(rnd() * 148) + 32; // 32–179: soft gray, no harsh pure-white pops
    ctx.fillStyle = v > 128 ? `rgba(255,255,255,${(((v - 128) / 128) * 0.7).toFixed(3)})` : `rgba(0,0,0,${(((128 - v) / 128) * 0.7).toFixed(3)})`;
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }
  ctx.restore();
}

function vignette(ctx, W, H, amount) {
  ctx.save();
  // Fixed geometry per clip (seed-driven only via placement, not this radius) so the
  // darkening never pulses. The gradient is centered on the middle of the frame.
  const inner = Math.min(W, H) * 0.4;
  const outer = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, outer);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, `rgba(0,0,0,${(0.32 * clamp(amount, 0, 1)).toFixed(3)})`);
  g.addColorStop(1, `rgba(0,0,0,${(0.5 * clamp(amount, 0, 1)).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function scanlines(ctx, W, H, amount) {
  ctx.save();
  ctx.globalAlpha = 0.22 * clamp(amount, 0, 1);
  ctx.fillStyle = "#000";
  const step = Math.max(2, Math.round(H / 360) * 3);
  for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

function dust(ctx, W, H, amount, rnd) {
  const a = clamp(amount, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  const count = Math.round((Math.min(W, H) / 1080) * 900);
  for (let i = 0; i < count; i++) {
    const s = Math.max(1, Math.min(6, 1 + rnd() * 4));
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.65).toFixed(3)})`;
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }
  ctx.restore();
  vignette(ctx, W, H, a * 0.5);
}

function grunge(ctx, W, H, amount, rnd) {
  const a = clamp(amount, 0, 1);
  grain(ctx, W, H, Math.round((Math.min(W, H) / 1080) * 1400), 0.3 * a, Math.max(1, Math.round(Math.min(W, H) / 420)), rnd);
  ctx.save();
  ctx.globalAlpha = 0.22 * a;
  ctx.fillStyle = "#2a2018";
  const blots = Math.round((Math.min(W, H) / 1080) * 26);
  for (let i = 0; i < blots; i++) {
    const r = Math.min(W, H) * (0.03 + rnd() * 0.12);
    const x = rnd() * W, y = rnd() * H;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  vignette(ctx, W, H, a * 0.55);
}

function vhs(ctx, W, H, amount, rnd) {
  const a = clamp(amount, 0, 1);
  scanlines(ctx, W, H, a);
  grain(ctx, W, H, Math.round((Math.min(W, H) / 1080) * 700), 0.16 * a, 1, rnd);
  // Drifting tracking band + glitch bars.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.25 * a;
  const bandY = rnd() * H;
  const bh = H * (0.02 + rnd() * 0.06);
  ctx.fillStyle = "rgba(220,235,255,0.5)";
  ctx.fillRect(0, bandY, W, bh);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.12 * a;
  ctx.fillStyle = "#0ff";
  ctx.fillRect(0, rnd() * H, W * rnd(), 2);
  ctx.fillStyle = "#f0f";
  ctx.fillRect(W * rnd(), rnd() * H, W * (0.2 + rnd() * 0.6), 2);
  ctx.restore();
}

// Draw the overlay-only layers of an effect. `ctx` must be the composed frame's
// context. `seed` is the per-clip pattern seed (stable for the clip's duration);
// `tick` is the frame index/time and only affects animated effects (grain, VHS,
// dust) via an extra mix into the seed — the pattern still matches per-clip.
export function fxOverlay(ctx, id, amount, W, H, seed = 0, tick = 0) {
  if (!id || id === "none" || amount <= 0) return;
  const base = seed + fxOf(id).id.length * 7919;
  const rAnim = rnd(base + Math.floor(tick) * 2654435761);
  const rStatic = rnd(base);
  switch (id) {
    case "film-grain":
      grain(ctx, W, H, Math.round((Math.min(W, H) / 1080) * 1500), 0.12 * amount, Math.max(1, Math.round(Math.min(W, H) / 600)), rAnim);
      break;
    case "noise":
      grain(ctx, W, H, Math.round((Math.min(W, H) / 1080) * 2600), 0.24 * amount, 1, rAnim);
      break;
    case "heavy-noise":
      grain(ctx, W, H, Math.round((Math.min(W, H) / 1080) * 4200), 0.4 * amount, Math.max(1, Math.round(Math.min(W, H) / 460)), rAnim);
      break;
    case "vignette":
      vignette(ctx, W, H, amount);
      break;
    case "vhs":
      vhs(ctx, W, H, amount, rAnim);
      break;
    case "grunge":
      grunge(ctx, W, H, amount, rStatic);
      break;
    case "dust":
      dust(ctx, W, H, amount, rAnim);
      break;
    case "warm":
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.55 * amount;
      ctx.fillStyle = "rgb(255,140,40)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    case "cool":
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.5 * amount;
      ctx.fillStyle = "rgb(70,120,255)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    default:
      break;
  }
}

// Apply the full effect to a composed W×H frame. `ctx` is the frame's context;
// `buf` is an offscreen 2D context of the same size used as a scratch buffer.
// `seed` is the per-clip pattern seed; `tick` is the frame index/time, passed to
// the animated overlays (grain / VHS / dust) so they move with playback.
// Returns true when something was drawn so callers can update their draw deps.
export function applyFx(ctx, buf, id, amount, W, H, seed = 0, tick = 0) {
  if (!id || id === "none" || !amount || amount <= 0) return false;
  const filter = fxFilter(id, amount);
  if (filter && buf) {
    buf.clearRect ? buf.clearRect(0, 0, W, H) : 0;
    buf.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.filter = filter;
    ctx.drawImage(buf.canvas, 0, 0);
    ctx.restore();
  }
  fxOverlay(ctx, id, amount, W, H, seed, tick);
  return true;
}