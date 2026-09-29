// Captions: parse an uploaded timestamped transcript into short caption cues,
// draw them on the preview canvas, and build the ffmpeg drawtext chain that
// burns them into the render. Preview and render share the same font + styles
// so what you see is what you get.

// ---- style presets (shared by preview canvas + ffmpeg drawtext) ----
// `fill`/`stroke`/`box` drive the canvas preview; `dt(bw)` returns the
// drawtext colour/box options for the burn-in.
export const CAPTION_STYLES = {
  classic: {
    id: "classic", label: "Classic outline",
    fill: "#ffffff", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=white:borderw=${bw}:bordercolor=black@0.9`,
  },
  boxed: {
    id: "boxed", label: "Boxed",
    fill: "#ffffff", stroke: null, box: "rgba(0,0,0,0.6)",
    dt: (bw, fs) => `fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=${Math.max(3, Math.round(fs * 0.16))}`,
  },
  yellow: {
    id: "yellow", label: "Yellow classic",
    fill: "#ffd400", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=0xFFD400:borderw=${bw}:bordercolor=black@0.9`,
  },
  red: {
    id: "red", label: "Red classic",
    fill: "#ff5252", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=0xFF5252:borderw=${bw}:bordercolor=black@0.9`,
  },
  blue: {
    id: "blue", label: "Blue classic",
    fill: "#4da6ff", stroke: "#000000", box: null,
    dt: (bw) => `fontcolor=0x4DA6FF:borderw=${bw}:bordercolor=black@0.9`,
  },
  ink: {
    id: "ink", label: "Black on white",
    fill: "#000000", stroke: null, box: "rgba(255,255,255,0.92)",
    dt: (bw, fs) => `fontcolor=black:box=1:boxcolor=white@0.92:boxborderw=${Math.max(3, Math.round(fs * 0.16))}`,
  },
  shadow: {
    id: "shadow", label: "Shadowed",
    fill: "#ffffff", stroke: null, box: null, shadow: "rgba(0,0,0,0.85)",
    dt: (bw, fs) => {
      const sw = Math.max(1, Math.round(fs * 0.045));
      return `fontcolor=white:shadowcolor=black@0.85:shadowx=${sw}:shadowy=${sw}`;
    },
  },
};
export const CAPTION_STYLE_LIST = Object.keys(CAPTION_STYLES).map((id) => CAPTION_STYLES[id]);

export const CAPTION_SIZES = { sm: 0.042, md: 0.052, lg: 0.064 };
export const CAPTION_FONT = "caption.ttf";          // path in the ffmpeg FS
export const captionCueFile = (i) => `cap${i}.txt`;  // per-cue textfile in the FS

// ---- caption fonts (preview @font-face + ffmpeg fontfile) ----
// `file` is the name copied into the ffmpeg job dir; `family` is the CSS
// font-family used by the canvas preview (loaded via @font-face in globals.css).
export const CAPTION_FONTS = [
  { id: "classic", label: "Classic", file: "caption.ttf", family: "CaptionFont" },
  { id: "anton", label: "Anton", file: "font-anton.ttf", family: "Anton" },
  { id: "archivo", label: "Archivo Black", file: "font-archivo.ttf", family: "Archivo Black" },
];
export const captionFont = (fontId) => CAPTION_FONTS.find((f) => f.id === fontId) || CAPTION_FONTS[0];

// Karaoke highlight color per style (spoken words); upcoming words use `fill`.
const KARAOKE_HI = {
  classic: "#ffd400", boxed: "#ffd400", yellow: "#ffffff",
  red: "#ffffff", blue: "#ffffff", ink: "#1a73e8", shadow: "#ffd400",
};
export const captionKaraokeHi = (styleId) => KARAOKE_HI[styleId] || KARAOKE_HI.classic;

// Word-level animations (karaoke/pop/typewriter) need per-word timings.
export const WORD_ANIMATIONS = new Set(["karaoke", "pop", "typewriter"]);
export const isWordAnimation = (animation) => WORD_ANIMATIONS.has(animation);

// ---- caption entrance animations (shared by preview canvas + ffmpeg drawtext) ----
// drawtext burns these with alpha= (fade) and y= (slide) expressions, so the
// rendered MP4 matches the canvas preview. The timings below are duplicated in
// server/captions.js — keep them in sync.
export const CAPTION_ANIMATIONS = {
  none:  { id: "none",  label: "None" },
  fade:  { id: "fade",  label: "Fade" },
  slide: { id: "slide", label: "Slide up" },
  karaoke: { id: "karaoke", label: "Karaoke" },
  pop:   { id: "pop",   label: "Pop" },
  typewriter: { id: "typewriter", label: "Typewriter" },
};
export const CAPTION_ANIMATION_LIST = Object.keys(CAPTION_ANIMATIONS).map((id) => CAPTION_ANIMATIONS[id]);
export const CAPTION_ANIM_TIMING = { fadeIn: 0.25, fadeOut: 0.15, slide: 0.35, slideDist: 0.45 };
// Smoothstep ease used by every animation (matches the drawtext `p*p*(3-2*p)`).
export const captionAnimEase = (p) => p * p * (3 - 2 * p);

export function captionFontPx(height, sizeId, customScale) {
  const frac = customScale > 0 ? customScale : (CAPTION_SIZES[sizeId] || CAPTION_SIZES.md);
  return Math.round(height * frac);
}

const MAX_LINE = 42;       // chars before wrapping to a second line
const MAX_CUE_CHARS = 84;  // chars before starting a new caption cue
const MARGIN_FACTOR = 0.07;

// ---- timestamp helpers ----
function hms(str) {
  const m = String(str).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!m) return null;
  const h = +(m[1] || 0), mi = +m[2], se = +m[3];
  const ms = m[4] ? +m[4].padEnd(3, "0") : 0;
  return h * 3600 + mi * 60 + se + ms / 1000;
}

// SRT / VTT — cues carry explicit start AND end.
function parseArrow(text) {
  const out = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim())
      .filter((l) => l && l !== "WEBVTT" && !/^\d+$/.test(l));
    const tl = lines.find((l) => l.includes("-->"));
    if (!tl) continue;
    const ts = tl.match(/(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/g);
    if (!ts || ts.length < 2) continue;
    const txt = lines.filter((l) => l !== tl).join(" ").trim();
    if (txt) out.push({ start: hms(ts[0]), end: hms(ts[1]), text: txt });
  }
  return out;
}

// NoteGPT-style range blocks: "HH:MM:SS - HH:MM:SS" then a paragraph.
function parseRanges(text) {
  const re = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—]\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*$/;
  const out = [];
  let cur = null;
  for (const ln of text.split("\n")) {
    const m = ln.match(re);
    if (m) {
      if (cur && cur.text.trim()) out.push(cur);
      cur = { start: hms(m[1]), end: hms(m[2]), text: "" };
    } else if (cur) {
      const t = ln.trim();
      if (t) cur.text += (cur.text ? " " : "") + t;
    }
  }
  if (cur && cur.text.trim()) out.push(cur);
  return out;
}

// Inline markers anywhere in the text: "(0:03) text ... (0:20) more".
// Each marker owns the text up to the next marker, across line breaks.
function parseMarkers(text) {
  const re = /[([]\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*[)\]]/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ start: hms(m[1]), from: re.lastIndex, at: m.index });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const to = i + 1 < marks.length ? marks[i + 1].at : text.length;
    const txt = text.slice(marks[i].from, to).replace(/\s+/g, " ").trim();
    if (txt) out.push({ start: marks[i].start, end: null, text: txt });
  }
  return out;
}

// Inline: "[0:03] text" or "0:03 text" per line.
function parseInline(text) {
  const re = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.*\S)\s*$/;
  const out = [];
  for (const ln of text.split("\n")) {
    const m = ln.match(re);
    if (m) out.push({ start: hms(m[1]), end: null, text: m[2].trim() });
  }
  return out;
}

// Wrap a caption string onto (at most) two balanced lines.
function wrap(str) {
  if (str.length <= MAX_LINE) return str;
  const words = str.split(" ");
  const half = str.length / 2;
  let a = "", b = "";
  for (const w of words) {
    if (!b && a.length + w.length <= half) a = a ? `${a} ${w}` : w;
    else b = b ? `${b} ${w}` : w;
  }
  return b ? `${a}\n${b}` : a;
}

// Reflow a caption into balanced lines that each fit the frame WIDTH at the given
// font size. Unlike the fixed-char wrap() used at parse time, this is width-aware,
// so 9:16 (portrait) captions don't overflow the sides. It's resolution-
// independent: W and fontPx scale together, so preview (full res) and render
// (e.g. 720p) wrap the same way = WYSIWYG.
export function captionMaxChars(W, fontPx) {
  return Math.max(8, Math.floor((W * 0.90) / (fontPx * 0.58)));
}
export function wrapToWidth(text, maxChars) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  // Greedy fill: every line is guaranteed to stay within maxChars (except a lone
  // word longer than a line), so nothing ever overflows the frame width.
  const words = clean.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && cand.length > maxChars) { lines.push(cur); cur = w; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Split a word list into lines with the same greedy rule as wrapToWidth, so the
// ASS burn (which lays words out per line) wraps exactly like the preview.
export function wordsToLines(words, maxChars) {
  const lines = [];
  let cur = [];
  const len = () => cur.join(" ").length;
  for (const w of words) {
    const cand = cur.length ? len() + 1 + w.length : w.length;
    if (cur.length && cand > maxChars) { lines.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// Per-word timings for a cue. Auto-transcribed cues carry `words`; uploaded
// transcripts don't, so fall back to an even split across the cue duration.
export function cueWords(cue) {
  if (cue && Array.isArray(cue.words) && cue.words.length) {
    return cue.words.map((w) => ({
      w: String(w.w ?? w.text ?? ""),
      start: +w.start, end: +w.end,
    })).filter((w) => w.w);
  }
  const words = String(cue.text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const span = Math.max(0.1, cue.end - cue.start);
  return words.map((w, i) => ({
    w,
    start: cue.start + (span * i) / words.length,
    end: cue.start + (span * (i + 1)) / words.length,
  }));
}

// Split one timed segment into caption cues, timed proportionally to length.
function chunkSegment(seg, cues) {
  const words = seg.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return;
  const chunks = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > MAX_CUE_CHARS && cur) { chunks.push(cur); cur = w; }
    else cur = cand;
    if (/[.!?]["')]?$/.test(w) && cur.length >= MAX_CUE_CHARS * 0.5) { chunks.push(cur); cur = ""; }
  }
  if (cur) chunks.push(cur);

  const totalChars = chunks.reduce((a, c) => a + c.length, 0) || 1;
  const span = Math.max(0.2, seg.end - seg.start);
  let t = seg.start;
  for (const c of chunks) {
    const d = span * (c.length / totalChars);
    const end = c === chunks[chunks.length - 1] ? seg.end : t + d;
    cues.push({ start: t, end, text: wrap(c) });
    t = end;
  }
}

// Parse raw transcript text into caption cues. `duration` (audio length) is used
// only to close the final segment. Returns { cues, error }.
export function parseTranscript(raw, duration = 0) {
  if (!raw || !raw.trim()) return { cues: [], error: "The file is empty." };
  const text = raw.replace(/\r/g, "");

  let segs = text.includes("-->") ? parseArrow(text) : parseRanges(text);
  if (!segs.length) segs = parseMarkers(text);
  if (!segs.length) segs = parseInline(text);
  segs = segs.filter((s) => s.start != null && s.text);
  if (!segs.length) {
    return { cues: [], error: "No timestamps found — use an SRT/VTT or a timestamped transcript." };
  }

  segs.sort((a, b) => a.start - b.start);
  for (let i = 0; i < segs.length; i++) {
    const nextStart = i + 1 < segs.length
      ? segs[i + 1].start
      : (duration || segs[i].start + segs[i].text.split(/\s+/).length / 2.5);
    let end = segs[i].end != null ? Math.min(segs[i].end, nextStart) : nextStart;
    if (!(end > segs[i].start)) end = Math.max(nextStart, segs[i].start + 0.4);
    segs[i].end = end;
  }

  const cues = [];
  for (const s of segs) chunkSegment(s, cues);
  return { cues, error: cues.length ? null : "Could not build any caption lines." };
}

// The caption cue active at time t (null if none).
export function captionCueAt(cues, t) {
  if (!cues) return null;
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i].start && t < cues[i].end) return cues[i];
  }
  return null;
}

// Current caption text for time t (empty string if none).
export function captionAt(cues, t) {
  const c = captionCueAt(cues, t);
  return c ? c.text : "";
}

// Line-height factor (top-to-top). Boxed captions need extra spacing so the
// per-line background boxes keep a visible gap instead of touching/overlapping.
const lineHeightFactor = (st) => (st && st.box ? 1.5 : 1.16);
// The default line spacing for a style (what the UI slider starts at).
export function captionLineHeightDefault(styleId) {
  return lineHeightFactor(CAPTION_STYLES[styleId] || CAPTION_STYLES.classic);
}

// Vertical slot (top y) for line i of an n-line caption, bottom-anchored.
const lineTop = (H, fontPx, n, i, lhf = 1.16) =>
  Math.round(H - H * MARGIN_FACTOR - (n - i) * fontPx * lhf);

// ---- preview: draw the current caption onto the canvas ----
// Every line is centered individually (and boxed individually for the boxed
// style) so the preview matches the per-line drawtext burn-in exactly.
// Pop timing (mirrors the ASS \t transforms in buildCaptionASS): punch to 125%
// over 0.18s, then settle back to 100% by 0.35s.
const POP_UP = 0.18, POP_DOWN = 0.35, POP_PEAK = 1.25;
export function popScaleAt(local) {
  if (local < 0) return 0;
  if (local < POP_UP) { const p = local / POP_UP; return 0.5 + (POP_PEAK - 0.5) * (1 - (1 - p) * (1 - p)); }
  if (local < POP_DOWN) { const p = (local - POP_UP) / (POP_DOWN - POP_UP); return POP_PEAK + (1 - POP_PEAK) * captionAnimEase(p); }
  return 1;
}

// ---- preview: word-level caption animations (karaoke / pop / typewriter) ----
// Draws each word from the cue's timings so the canvas preview matches the ASS
// burn (buildCaptionASS). `t` is the absolute timeline time.
function drawWordCaption(ctx, cue, W, H, st, fontId, fontPx, lineHeight, animation, t) {
  const font = captionFont(fontId);
  const words = cueWords(cue);
  if (!words.length) return;
  const maxChars = captionMaxChars(W, fontPx);
  const lineStrs = wordsToLines(words.map((w) => w.w), maxChars);
  const n = lineStrs.length;
  const lhf = lineHeight > 0 ? lineHeight : lineHeightFactor(st);
  const hi = captionKaraokeHi(st.id);
  const spaceW = (() => {
    ctx.save();
    ctx.font = `700 ${fontPx}px "${font.family}", system-ui, sans-serif`;
    const w = ctx.measureText(" ").width;
    ctx.restore();
    return w;
  })();

  ctx.save();
  ctx.font = `700 ${fontPx}px "${font.family}", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  let wi = 0;
  for (let i = 0; i < n; i++) {
    const count = lineStrs[i].length;
    const lineWords = words.slice(wi, wi + count);
    wi += count;
    // Measure the full line so it stays centered.
    let lineW = 0;
    const widths = lineWords.map((wd) => { const w = ctx.measureText(wd.w).width; lineW += w; return w; });
    lineW += spaceW * Math.max(0, lineWords.length - 1);
    const top = lineTop(H, fontPx, n, i, lhf);
    const base = top + fontPx * 0.82;

    // Boxed style: one snug box per line behind the words (as in drawCaption).
    if (st.box) {
      const padX = fontPx * 0.38, padY = fontPx * 0.12;
      ctx.fillStyle = st.box;
      ctx.fillRect((W - lineW) / 2 - padX, base - fontPx * 0.78 - padY, lineW + padX * 2, fontPx * 0.98 + padY * 2);
    }

    let x = (W - lineW) / 2;
    for (let j = 0; j < lineWords.length; j++) {
      const wd = lineWords[j];
      const ww = widths[j];
      if (animation === "karaoke") {
        const spoken = t >= wd.start;
        ctx.fillStyle = spoken ? hi : st.fill;
        if (st.stroke && !spoken) {
          ctx.lineWidth = Math.max(2, fontPx / 7);
          ctx.strokeStyle = st.stroke;
          ctx.strokeText(wd.w, x, base);
        }
        ctx.fillText(wd.w, x, base);
      } else if (animation === "pop") {
        const s = popScaleAt(t - wd.start);
        if (s > 0) {
          ctx.save();
          ctx.translate(x + ww / 2, base - fontPx * 0.35);
          ctx.scale(s, s);
          const bx = -ww / 2, by = fontPx * 0.35;
          if (st.stroke) {
            ctx.lineWidth = Math.max(2, fontPx / 7);
            ctx.strokeStyle = st.stroke;
            ctx.strokeText(wd.w, bx, by);
          }
          ctx.fillStyle = st.fill;
          ctx.fillText(wd.w, bx, by);
          ctx.restore();
        }
      } else { // typewriter: reveal characters as their word is spoken
        let shown = wd.w;
        if (t < wd.start) shown = "";
        else if (t < wd.end && wd.end > wd.start) {
          shown = wd.w.slice(0, Math.max(1, Math.ceil(wd.w.length * (t - wd.start) / (wd.end - wd.start))));
        }
        if (shown) {
          if (st.stroke) {
            ctx.lineWidth = Math.max(2, fontPx / 7);
            ctx.strokeStyle = st.stroke;
            ctx.strokeText(shown, x, base);
          }
          ctx.fillStyle = st.fill;
          ctx.fillText(shown, x, base);
        }
      }
      x += ww + spaceW;
    }
  }
  ctx.restore();
}

export function drawCaption(ctx, text, W, H, styleId, fontPx, lineHeight, animation = "none", elapsed = 0, duration = 0, fontId = "classic", cue = null) {
  if (!text) return;
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.classic;
  // Word-level animations (karaoke/pop/typewriter) draw per word from the cue's
  // timings; everything else draws the whole cue at once (as before).
  if (isWordAnimation(animation) && cue) {
    drawWordCaption(ctx, cue, W, H, st, fontId, fontPx, lineHeight, animation, cue.start + elapsed);
    return;
  }
  const font = captionFont(fontId);
  const lines = wrapToWidth(text, captionMaxChars(W, fontPx));
  const n = lines.length;
  const lhf = lineHeight > 0 ? lineHeight : lineHeightFactor(st);

  // Entrance animation: fade-in (+ fade-out) and an optional slide-up. Values
  // mirror the drawtext alpha=/y= burn exactly (buildCaptionBurn), so the
  // canvas preview matches the rendered MP4. `elapsed` = t - cue.start.
  const anim = CAPTION_ANIMATIONS[animation] || CAPTION_ANIMATIONS.none;
  let alpha = 1, dy = 0;
  if (anim.id !== "none" && duration > 0) {
    const T = CAPTION_ANIM_TIMING;
    const span = anim.id === "slide" ? T.slide : T.fadeIn;
    const p = elapsed <= 0 ? 0 : Math.min(1, elapsed / span);
    const ease = captionAnimEase(p);
    const out = T.fadeOut > 0 ? Math.min(1, Math.max(0, (duration - elapsed) / T.fadeOut)) : 1;
    alpha = ease * out;
    if (anim.id === "slide") dy = Math.round(fontPx * T.slideDist * (1 - ease));
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  if (dy) ctx.translate(0, dy);
  ctx.font = `700 ${fontPx}px "${font.family}", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (let i = 0; i < n; i++) {
    const ln = lines[i];
    const top = lineTop(H, fontPx, n, i, lhf);
    const base = top + fontPx * 0.82;
    // Hard offset shadow (mirrors drawtext shadowx/shadowy in the burn, scaled
    // by font px so preview matches the render at any resolution).
    if (st.shadow) {
      const sw = Math.max(1, Math.round(fontPx * 0.045));
      ctx.shadowColor = st.shadow;
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = sw;
      ctx.shadowOffsetY = sw;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    if (st.box) {
      const w = ctx.measureText(ln).width;
      const padX = fontPx * 0.38, padY = fontPx * 0.12;
      // A snug box around the glyphs (not the whole line slot) so two boxes keep a gap.
      const boxTop = base - fontPx * 0.78 - padY;
      const boxH = fontPx * 0.98 + padY * 2;
      ctx.fillStyle = st.box;
      ctx.fillRect((W - w) / 2 - padX, boxTop, w + padX * 2, boxH);
    }
    if (st.stroke) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(2, fontPx / 7);
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(ln, W / 2, base);
    }
    ctx.fillStyle = st.fill;
    ctx.fillText(ln, W / 2, base);
  }
  ctx.restore();
}

// ---- render: one centered drawtext per LINE (so each line is centered) ----
// Returns the filter chain plus the per-line textfiles to write into the FS.
const escapeFilter = (s) => s.replace(/(?<!\\)\,/g, "\\,");

function buildAnimExprs(animation, s, e) {
  if (!animation || animation === "none") return { ease: "", out: "" };
  const T = CAPTION_ANIM_TIMING;
  const span = animation === "slide" ? T.slide : T.fadeIn;
  const p = `min(1\\,max(0\\,(t-${s})/${span.toFixed(3)}))`;
  const ease = `(${p}*${p}*(3-2*${p}))`;
  const out = `min(1\\,max(0\\,(${e}-t)/${T.fadeOut.toFixed(3)}))`;
  return { ease, out };
}

export function buildCaptionBurn(cues, styleId, width, height, sizeId, lineHeight, fontScale, animation = "none", fontId = "classic") {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.classic;
  const font = captionFont(fontId);
  const fs = captionFontPx(height, sizeId, fontScale);
  const bw = Math.max(2, Math.round(fs / 9));
  const lhf = lineHeight > 0 ? lineHeight : lineHeightFactor(st);
  const files = [];
  const filters = [];
  let li = 0;
  for (const c of cues) {
    const lines = wrapToWidth(c.text, captionMaxChars(width, fs));
    const n = lines.length;
    const s = c.start.toFixed(3), e = c.end.toFixed(3);
    const anim = buildAnimExprs(animation, s, e);
    for (let i = 0; i < n; i++) {
      const name = captionCueFile(li++);
      files.push({ name, text: sanitizeCueText(lines[i]) });
      const y = lineTop(height, fs, n, i, lhf);
      let yParam = `${y}`, alphaParam = "";
      if (animation === "slide") {
        yParam = `${y}+${Math.round(fs * CAPTION_ANIM_TIMING.slideDist)}*(1-${anim.ease})`;
        alphaParam = `:alpha=${anim.ease}*${anim.out}`;
      } else if (animation === "fade") {
        alphaParam = `:alpha=${anim.ease}*${anim.out}`;
      }
      const raw =
        `drawtext=fontfile=${font.file}:textfile=${name}:${st.dt(bw, fs)}` +
        `:fontsize=${fs}:x=(w-text_w)/2:y=${yParam}${alphaParam}:enable=between(t,${s},${e})`;
      filters.push(escapeFilter(raw));
    }
  }
  return { filter: filters.join(","), files };
}

// ---- ASS burn for the word-level animations (karaoke / pop / typewriter) ----
// libass renders these natively (\k sweeps, \t scale transforms), which
// drawtext cannot do per word. Preview (drawWordCaption) mirrors this exactly.
function assTime(s) {
  s = Math.max(0, +s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  const p2 = (v) => String(v).padStart(2, "0");
  return `${h}:${p2(m)}:${p2(sec)}.${p2(cs)}`;
}
// ASS colours are &HAABBGGRR (alpha first, 00 = opaque).
function assColor(hex, alphaHex = "00") {
  const h = String(hex || "#ffffff").replace("#", "");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}
function assEscape(s) {
  return String(s).replace(/\\/g, "").replace(/{/g, "(").replace(/}/g, ")").replace(/%/g, "percent");
}
// Parse an "rgba(r,g,b,a)" box colour into [hex, alphaHex].
function parseRgbaBox(box) {
  const m = String(box || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return ["#000000", "99"];
  const toHex = (v) => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, "0");
  const a = m[4] == null ? "00" : Math.round((1 - parseFloat(m[4])) * 255).toString(16).padStart(2, "0");
  return [`#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`, a];
}

export function buildCaptionASS(cues, styleId, fontId, width, height, sizeId, lineHeight, fontScale, animation) {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.classic;
  const font = captionFont(fontId);
  const fs = captionFontPx(height, sizeId, fontScale);
  const hi = captionKaraokeHi(styleId);
  const marginV = Math.round(height * MARGIN_FACTOR);

  // Karaoke: spoken words sweep to the highlight colour, upcoming stay base.
  // Typewriter: unrevealed chars are transparent (revealed = fill).
  const primary = assColor(animation === "karaoke" ? hi : st.fill);
  const secondary = animation === "karaoke" ? assColor(st.fill) : assColor("#000000", "FF");
  const outlineC = st.stroke ? assColor(st.stroke) : assColor("#000000", "FF");
  const [boxHex, boxA] = parseRgbaBox(st.box);
  const backC = st.box ? assColor(boxHex, boxA) : assColor("#000000", "FF");
  const borderStyle = st.box ? 3 : 1;
  const outlineW = st.box ? 1 : Math.max(2, Math.round(fs / 9));

  const header =
`[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${font.family},${fs},${primary},${secondary},${outlineC},${backC},-1,0,0,0,100,100,0,0,${borderStyle},${outlineW},0,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const maxChars = captionMaxChars(width, fs);
  const events = [];
  for (const c of cues) {
    const words = cueWords(c);
    if (!words.length) continue;
    const lines = wordsToLines(words.map((w) => w.w), maxChars);
    let wi = 0;
    for (const lineStrs of lines) {
      const lineWords = words.slice(wi, wi + lineStrs.length);
      wi += lineStrs.length;
      let text = "";
      if (animation === "pop") {
        // Line-level punch-in: 125% by 0.18s, settle to 100% by 0.35s
        // (mirrors popScaleAt in the canvas preview).
        text = `{\\t(0,180,\\fscx125\\fscy125)\\t(180,350,\\fscx100\\fscy100)}${assEscape(lineStrs.join(" "))}`;
      } else if (animation === "typewriter") {
        // Per-character karaoke sweep; unrevealed chars are transparent.
        // \k runs sequentially from the event start, so pad inter-word gaps
        // with invisible \h fillers to keep absolute timing.
        const parts = [];
        let cursor = 0;
        for (const wd of lineWords) {
          const startCs = Math.round((wd.start - c.start) * 100);
          if (startCs > cursor) { parts.push(`{\\k${startCs - cursor}}\\h`); cursor = startCs; }
          const chars = [...wd.w];
          const dur = Math.max(1, Math.round(((wd.end - wd.start) / Math.max(1, chars.length)) * 100));
          for (const ch of chars) { parts.push(`{\\k${dur}}${assEscape(ch)}`); cursor += dur; }
          parts.push("{\\k1} "); cursor += 1;
        }
        text = parts.join("");
      } else { // karaoke: per-word highlight sweep, gap-aligned like above
        const parts = [];
        let cursor = 0;
        for (const wd of lineWords) {
          const startCs = Math.round((wd.start - c.start) * 100);
          if (startCs > cursor) { parts.push(`{\\k${startCs - cursor}}\\h`); cursor = startCs; }
          const cs = Math.max(1, Math.round((wd.end - wd.start) * 100));
          parts.push(`{\\k${cs}}${assEscape(wd.w)}`);
          cursor += cs;
        }
        text = parts.join(" ");
      }
      events.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,0,,${text}`);
    }
  }
  return header + events.join("\n") + "\n";
}

// drawtext reads textfiles literally; strip chars its expander would choke on.
export function sanitizeCueText(text) {
  return String(text).replace(/\\/g, "").replace(/%/g, "percent");
}

// Draw a static image overlay (logo / watermark) on a W×H canvas, mirroring the
// server's ffmpeg watermarkChain exactly: aspect kept, scaled to at most `size` ×
// the smaller canvas edge (never upscaled), CENTER placed at (x*W, y*H) and
// clamped to stay fully on-screen, drawn at `opacity` alpha.
export function drawWatermark(ctx, img, W, H, { size = 0.15, x = 0.8, y = 0.88, opacity = 0.9 } = {}) {
  if (!ctx || !img) return;
  const iw = img.videoWidth || img.naturalWidth || img.width || 0;
  const ih = img.videoHeight || img.naturalHeight || img.height || 0;
  if (!iw || !ih) return;
  const cap = Math.min(W, H) * Math.min(1, Math.max(0.01, size || 0.15));
  const s = Math.max(0, Math.min(1, cap / iw)); // never upscale
  const w = iw * s, h = ih * s;
  const cx = Math.min(Math.max(x, w / (2 * W)), 1 - w / (2 * W));
  const cy = Math.min(Math.max(y, h / (2 * H)), 1 - h / (2 * H));
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.drawImage(img, cx * W - w / 2, cy * H - h / 2, w, h);
  ctx.restore();
}

// Draw a logo anchored to one of the four corners, mirroring the server's
// ffmpeg cornerChain. The logo keeps its aspect, scales to at most `size` × the
// smaller canvas edge (never upscaled), sits `margin` × W/H inside that corner,
// and is drawn at `opacity` alpha. `corner` ∈ "tl" | "tr" | "bl" | "br".
export function drawCornerLogo(ctx, img, W, H, { corner = "br", size = 0.12, opacity = 0.9, margin = 0.04 } = {}) {
  if (!ctx || !img) return;
  const iw = img.videoWidth || img.naturalWidth || img.width || 0;
  const ih = img.videoHeight || img.naturalHeight || img.height || 0;
  if (!iw || !ih) return;
  const cap = Math.min(W, H) * Math.min(1, Math.max(0.01, size || 0.12));
  const s = Math.max(0, Math.min(1, cap / iw)); // never upscale
  const w = iw * s, h = ih * s;
  const c = String(corner || "br").toLowerCase();
  const mx = W * (Math.min(1, Math.max(0, margin)) || 0.04);
  const my = H * (Math.min(1, Math.max(0, margin)) || 0.04);
  const x = c === "tl" || c === "bl" ? mx : W - w - mx;
  const y = c === "tl" || c === "tr" ? my : H - h - my;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.drawImage(img, Math.max(0, x), Math.max(0, y), w, h);
  ctx.restore();
}
