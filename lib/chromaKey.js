// Live chroma keying for lower-third clips — no re-encode.
//
// The key runs per frame while previewing and while exporting, so the maths is
// kept pure and DOM-free (unit tested) with the canvas work layered on top.
//
// Distance is the ANGLE between the pixel's chroma vector and the key colour's,
// not a straight RGB or chroma-magnitude distance. Magnitude was tried first and
// fails badly: it ranks bright green (#00ff00, dist .251) *closer* to studio
// green than mid grey (#808080, dist .328), so it keys grey clothing and keeps
// the backdrop. Angle puts every green inside 0.11 while skin lands at 0.65+ and
// red at 0.79, which separates cleanly. Neutrals have no chroma direction at
// all, so they are rejected by a magnitude floor rather than by the angle.
//
// Luma is largely excluded on purpose: scaling a green's channels keeps its hue,
// so a dim backdrop keys like a bright one instead of leaving shadows behind.
// It is not perfect — a heavily washed-out green drifts toward the neutral axis
// and gains angle, which the magnitude floor then treats as near-neutral.

// Rec.601 luma weights — the same matrix the browser uses for YUV.
export function rgbToChroma(r, g, b) {
  return {
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

// Parse "#rgb" / "#rrggbb" into 0..255 channels. Returns null when unparseable
// so a bad colour string falls back to the default instead of keying to black.
export function parseHexColor(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// How colourful a pixel is: 0 for pure grey/white/black, ~0.5 for a saturated
// primary. Used only to reject neutrals, never to decide key membership.
export function chromaMagnitude(cb, cr) {
  return Math.hypot(cb - 128, cr - 128) / 255;
}

// Angle between two chroma vectors, normalised so 0..1 spans 0..180 degrees.
export function chromaAngleDistance(cb, cr, keyCb, keyCr) {
  let d = (Math.atan2(cr - 128, cb - 128) - Math.atan2(keyCr - 128, keyCb - 128)) * 180 / Math.PI;
  d = Math.abs(d) % 360;
  if (d > 180) d = 360 - d;
  return d / 180;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Opacity for one pixel. `similarity` sets how wide an angular band around the
// key colour still counts as backdrop (higher = more aggressive); `smoothness`
// is the width of the soft edge that feathers hair and motion blur instead of
// cutting a hard stencil.
export function keyAlpha(angleDist, similarity, smoothness) {
  const inner = Math.max(0, similarity);
  const outer = inner + Math.max(smoothness, 1e-3);
  return clamp01((angleDist - inner) / (outer - inner));
}

// Pull the key channel back toward the other two. A green screen bounces green
// light onto the subject's edges; without this the rim of hair and shoulders
// keeps a green fringe even where alpha is already high. despill 0 leaves the
// pixel alone, 1 clamps the channel all the way to the max of the other two.
export function despillChannel(r, g, b, despill, isGreenKey) {
  if (!isGreenKey || despill <= 0 || g <= r || g <= b) return g;
  const limit = Math.max(r, b);
  return limit + (g - limit) * (1 - despill);
}

// Full per-pixel pass over an ImageData, in place. Returns how many pixels were
// made fully transparent — the tests assert on that to prove the key bites.
export function keyImageData(img, opts = {}) {
  const key = parseHexColor(opts.keyColor) || { r: 0, g: 177, b: 64 };
  const { cb: keyCb, cr: keyCr } = rgbToChroma(key.r, key.g, key.b);
  const similarity = opts.similarity ?? 0.18;
  const smoothness = opts.smoothness ?? 0.1;
  const despill = opts.despill ?? 0.6;
  const minChroma = opts.minChroma ?? 0.04;
  // Blue/cyan screens need the red channel pulled down instead; rather than
  // guess a second despill formula, despill stays off for non-green keys.
  const isGreenKey = key.g >= key.r && key.g >= key.b;
  const d = img.data;
  let cleared = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const { cb, cr } = rgbToChroma(r, g, b);
    // Greys sit on the neutral axis with no hue to compare, so they are kept
    // outright rather than keyed by a meaningless angle.
    const a = chromaMagnitude(cb, cr) < minChroma
      ? 1
      : keyAlpha(chromaAngleDistance(cb, cr, keyCb, keyCr), similarity, smoothness);
    if (a <= 0) cleared++;
    d[i + 3] = Math.round(d[i + 3] * a);
    d[i + 1] = Math.round(despillChannel(r, g, b, despill, isGreenKey));
  }
  return cleared;
}

// Precise seek used by the export. Unlike the preview — which tolerates drawing
// a slightly stale frame while scrubbing — an export must land on the exact
// frame, so this resolves only once the decoder has actually produced it.
export function seekVideo(video, time) {
  const dur = Number.isFinite(video.duration) ? video.duration : 0;
  const target = Math.min(Math.max(time, 0), dur > 0 ? Math.max(dur - 1e-3, 0) : time);
  if (Math.abs(video.currentTime - target) < 1e-3 && video.readyState >= 2) {
    return Promise.resolve(video);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      resolve(video);
    };
    video.addEventListener("seeked", finish, { once: true });
    // A stuck seek must not hang the whole export; draw the current frame.
    setTimeout(finish, 2000);
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

// --- canvas layer -----------------------------------------------------------

// Reused across frames so the key pass never allocates a canvas per frame.
let scratch = null;
function getScratch(w, h) {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
}

export function releaseScratch() {
  scratch = null;
}

// Draw `source` into `ctx` at (x, y, w, h), keying it first when
// `opts.keyEnabled`. The source is sampled into a scratch canvas at the
// destination size, so per-pixel cost is bounded by the lower third's on-screen
// size rather than the source resolution — a 4K source costs the same as 720p.
export function drawKeyedSource(ctx, source, x, y, w, h, opts = {}) {
  const sw = Math.max(1, Math.round(w));
  const sh = Math.max(1, Math.round(h));
  if (!opts.keyEnabled) {
    ctx.drawImage(source, x, y, w, h);
    return;
  }
  const sctx = getScratch(sw, sh).getContext("2d", { willReadFrequently: true });
  sctx.clearRect(0, 0, sw, sh);
  sctx.drawImage(source, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  keyImageData(img, opts);
  sctx.putImageData(img, 0, 0);
  ctx.drawImage(scratch, x, y, w, h);
}
