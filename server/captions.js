// Render-side caption helpers, copied verbatim from lib/captions.js so the
// burned-in text matches the frontend preview exactly. Only the render-side
// pieces are here — transcript parsing and canvas drawing stay in the frontend.

// ---- style presets (shared by preview canvas + ffmpeg drawtext) ----
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

export const CAPTION_SIZES = { sm: 0.042, md: 0.052, lg: 0.064 };
export const CAPTION_FONT = "caption.ttf";          // path in the ffmpeg FS
export const captionCueFile = (i) => `cap${i}.txt`;  // per-cue textfile in the FS

// ---- caption fonts (must match lib/captions.js) ----
export const CAPTION_FONTS = [
  { id: "classic", label: "Classic", file: "caption.ttf", family: "CaptionFont" },
  { id: "anton", label: "Anton", file: "font-anton.ttf", family: "Anton" },
  { id: "archivo", label: "Archivo Black", file: "font-archivo.ttf", family: "Archivo Black" },
];
export const captionFont = (fontId) => CAPTION_FONTS.find((f) => f.id === fontId) || CAPTION_FONTS[0];

const KARAOKE_HI = {
  classic: "#ffd400", boxed: "#ffd400", yellow: "#ffffff",
  red: "#ffffff", blue: "#ffffff", ink: "#1a73e8", shadow: "#ffd400",
};
export const captionKaraokeHi = (styleId) => KARAOKE_HI[styleId] || KARAOKE_HI.classic;

// Word-level animations (karaoke/pop/typewriter) burn via ASS (buildCaptionASS),
// not drawtext. Duplicated from lib/captions.js — keep them in sync.
export const WORD_ANIMATIONS = new Set(["karaoke", "pop", "typewriter"]);
export const isWordAnimation = (animation) => WORD_ANIMATIONS.has(animation);

// ---- caption entrance animations (shared by preview canvas + ffmpeg drawtext) ----
// Burned with drawtext alpha= (fade) and y= (slide) expressions so the MP4 matches
// the canvas preview. Duplicated from lib/captions.js — keep them in sync.
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
export const captionAnimEase = (p) => p * p * (3 - 2 * p);

export function captionFontPx(height, sizeId, customScale) {
  const frac = customScale > 0 ? customScale : (CAPTION_SIZES[sizeId] || CAPTION_SIZES.md);
  return Math.round(height * frac);
}

const MARGIN_FACTOR = 0.07;

// Width-aware caption wrapping (must match lib/captions.js so preview == render).
// Reflows a caption into balanced lines that each fit the frame WIDTH, so 9:16
// portrait doesn't overflow. Resolution-independent (W and fontPx scale together).
function captionMaxChars(W, fontPx) {
  return Math.max(8, Math.floor((W * 0.90) / (fontPx * 0.58)));
}
function wrapToWidth(text, maxChars) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  // Greedy fill: every line stays within maxChars, so nothing overflows.
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
function wordsToLines(words, maxChars) {
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
function cueWords(cue) {
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

// Boxed captions need a bit more line spacing so their per-line boxes keep a gap.
const lineHeightFactor = (st) => (st && st.box ? 1.5 : 1.16);

// Vertical slot (top y) for line i of an n-line caption, bottom-anchored.
const lineTop = (H, fontPx, n, i, lhf = 1.16) =>
  Math.round(H - H * MARGIN_FACTOR - (n - i) * fontPx * lhf);

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

export function buildCaptionBurn(cues, styleId, width, height, sizeId, lineHeight, fontScale, animation = "none", fontId = "classic", prefix = "") {
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
      const name = prefix + captionCueFile(li++);
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
// drawtext cannot do per word. Duplicated from lib/captions.js — keep in sync.
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

// ---- render: timed text overlays (user-placed titles/labels) ----
// One centered drawtext per item, enabled between its start/end, so the MP4
// matches the canvas drawTextOverlays preview (center-anchored x/y fractions,
// font height = size × frame height). Returns the filter chain + textfiles.
export function buildTextOverlayBurn(items, width, height, prefix = "") {
  if (!Array.isArray(items) || !items.length) return { filter: "", files: [] };
  const files = [];
  const filters = [];
  let li = 0;
  for (const it of items) {
    const text = sanitizeCueText(String(it.text ?? "").trim());
    if (!text) continue;
    const fs = Math.max(12, Math.round(height * Math.min(0.5, Math.max(0.01, it.size ?? 0.06))));
    const x = ((it.x ?? 0.5) * width).toFixed(2);
    const y = ((it.y ?? 0.5) * height).toFixed(2);
    const s = (it.start ?? 0).toFixed(3), e = (it.end ?? 0).toFixed(3);
    const color = String(it.color || "#ffffff").replace("#", "");
    const alpha = Math.min(1, Math.max(0, it.opacity ?? 1)).toFixed(3);
    const name = `${prefix}txt${li}.txt`;
    files.push({ name, text });
    const raw =
      `drawtext=fontfile=${CAPTION_FONT}:textfile=${name}:fontsize=${fs}` +
      `:fontcolor=0x${color}@${alpha}:x=${x}-text_w/2:y=${y}-text_h/2` +
      `:enable=between(t,${s},${e})`;
    filters.push(escapeFilter(raw));
    li++;
  }
  return { filter: filters.join(","), files };
}
