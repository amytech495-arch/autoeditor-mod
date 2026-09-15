// Transition definitions shared by the preview (canvas) and the export (ffmpeg
// xfade). Each has an `xfade` name (null = hard cut) and a `canvas` painter so
// the preview matches the rendered result closely.

export const DEFAULT_TRANSITION_DURATION = 0.4;
export const MIN_TRANSITION_DURATION = 0.15;
export const MAX_TRANSITION_DURATION = 1.0;

// Draw an image contained in WxH, optionally zoomed by `scale` about the centre
// so transitions can blend two images at their current Ken Burns zoom.
function paint(ctx, img, W, H, scale = 1) {
  if (!img) return; // no image = black (gap / lead-in)
  // HTMLImageElement=naturalWidth; <video>=videoWidth; VideoFrame=displayWidth; ImageBitmap=width.
  const iw = img.naturalWidth || img.videoWidth || img.displayWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.displayHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(W / iw, H / ih) * scale;
  const w = iw * s;
  const h = ih * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// Each canvas painter receives a black-filled context and blends `from` -> `to`
// as progress p goes 0 -> 1. `sf`/`st` are the from/to images' zoom scales.
export const TRANSITIONS = {
  cut: {
    label: "None", icon: "⊘", xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => paint(c, t, W, H, st),
  },
  fade: {
    label: "Crossfade", icon: "✕", xfade: "fade",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.globalAlpha = p;
      paint(c, t, W, H, st);
      c.globalAlpha = 1;
    },
  },
  fadeblack: {
    label: "Fade to black", icon: "◐", xfade: "fadeblack",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      if (p < 0.5) { c.globalAlpha = 1 - 2 * p; paint(c, f, W, H, sf); }
      else { c.globalAlpha = 2 * p - 1; paint(c, t, W, H, st); }
      c.globalAlpha = 1;
    },
  },
  wipeleft: {
    label: "Wipe left", icon: "◀", xfade: "wipeleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); const x = W * (1 - p); c.rect(x, 0, W - x, H); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  wiperight: {
    label: "Wipe right", icon: "▶", xfade: "wiperight",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); c.rect(0, 0, W * p, H); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  slideleft: {
    label: "Slide left", icon: "⇐", xfade: "slideleft",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(-W * p, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W * (1 - p), 0); paint(c, t, W, H, st); c.restore();
    },
  },
  slideright: {
    label: "Slide right", icon: "⇒", xfade: "slideright",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(W * p, 0); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(-W * (1 - p), 0); paint(c, t, W, H, st); c.restore();
    },
  },
  circleopen: {
    label: "Circle open", icon: "◎", xfade: "circleopen",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * p, 0, Math.PI * 2); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  circleclose: {
    label: "Circle close", icon: "⊗", xfade: "circleclose",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath();
      c.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * (1 - p), 0, Math.PI * 2); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  wipeup: {
    label: "Wipe up", icon: "▲", xfade: "wipeup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); const y = H * (1 - p); c.rect(0, y, W, H - y); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  wipedown: {
    label: "Wipe down", icon: "▼", xfade: "wipedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      paint(c, f, W, H, sf);
      c.save(); c.beginPath(); c.rect(0, 0, W, H * p); c.clip();
      paint(c, t, W, H, st); c.restore();
    },
  },
  slideup: {
    label: "Slide up", icon: "⇑", xfade: "slideup",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(0, -H * p); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(0, H * (1 - p)); paint(c, t, W, H, st); c.restore();
    },
  },
  slidedown: {
    label: "Slide down", icon: "⇓", xfade: "slidedown",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(0, H * p); paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(0, -H * (1 - p)); paint(c, t, W, H, st); c.restore();
    },
  },
  zoomin: {
    label: "Zoom in", icon: "🔍", xfade: "zoomin",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(W / 2, H / 2); c.scale(1 + p, 1 + p); c.translate(-W / 2, -H / 2);
      paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W / 2, H / 2); c.scale(1 + (1 - p), 1 + (1 - p)); c.translate(-W / 2, -H / 2);
      paint(c, t, W, H, st); c.restore();
    },
  },
  zoomout: {
    label: "Zoom out", icon: "🔎", xfade: "zoomout",
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      c.save(); c.translate(W / 2, H / 2); c.scale(2 - p, 2 - p); c.translate(-W / 2, -H / 2);
      paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W / 2, H / 2); c.scale(1 + p, 1 + p); c.translate(-W / 2, -H / 2);
      paint(c, t, W, H, st); c.restore();
    },
  },
  flipx: {
    label: "Flip X", icon: "↔", xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const angle = Math.PI * p;
      c.save(); c.translate(W / 2, H / 2); c.scale(Math.cos(angle), 1); c.translate(-W / 2, -H / 2);
      paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W / 2, H / 2); c.scale(Math.cos(Math.PI - angle), 1); c.translate(-W / 2, -H / 2);
      paint(c, t, W, H, st); c.restore();
    },
  },
  flipy: {
    label: "Flip Y", icon: "↕", xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const angle = Math.PI * p;
      c.save(); c.translate(W / 2, H / 2); c.scale(1, Math.cos(angle)); c.translate(-W / 2, -H / 2);
      paint(c, f, W, H, sf); c.restore();
      c.save(); c.translate(W / 2, H / 2); c.scale(1, Math.cos(Math.PI - angle)); c.translate(-W / 2, -H / 2);
      paint(c, t, W, H, st); c.restore();
    },
  },
  pixelate: {
    label: "Pixelate", icon: "◼", xfade: null,
    canvas: (c, f, t, p, W, H, sf = 1, st = 1) => {
      const block = Math.max(1, 64 * (1 - p));
      c.imageSmoothingEnabled = false;
      c.save(); c.scale(1 / block, 1 / block);
      if (f) c.drawImage(f, 0, 0, W * block, H * block);
      c.restore();
      c.globalAlpha = p;
      c.save(); c.scale(1 / block, 1 / block);
      if (t) c.drawImage(t, 0, 0, W * block, H * block);
      c.restore();
      c.imageSmoothingEnabled = true;
      c.globalAlpha = 1;
    },
  },
};

export const TRANSITION_LIST = Object.keys(TRANSITIONS).map((id) => ({ id, ...TRANSITIONS[id] }));

export function transitionOf(id) {
  return TRANSITIONS[id] || TRANSITIONS.cut;
}

// Assign a transition id to each of `n` cuts, chosen randomly from `picks`,
// avoiding the same id on consecutive cuts when possible. With a single pick,
// every cut gets it. rnd() is injectable for deterministic tests.
export function mixTransitions(picks, n, rnd = Math.random) {
  const out = [];
  if (!picks || !picks.length || n <= 0) return out;
  for (let i = 0; i < n; i++) {
    let pool = picks;
    if (picks.length > 1 && i > 0) pool = picks.filter((p) => p !== out[i - 1]);
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out;
}

// Motion effects for Ken Burns style animations (per-clip, not transitions)
// getTransform(lp, amount, W, H, clipIndex) -> { scale, offsetX, offsetY, rotateX, rotateY }
// lp: local progress 0-1, amount: motionAmount, W/H: canvas dims, clipIndex: for deterministic pseudo-random
export const MOTION_EFFECTS = {
  none: {
    label: "None", icon: "⊘",
    getTransform: (lp, amount) => ({ scale: 1, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 }),
  },
  zoomin: {
    label: "Zoom in", icon: "🔍",
    getTransform: (lp, amount) => ({ 
      scale: 1 + amount * lp, 
      offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 
    }),
  },
  zoomout: {
    label: "Zoom out", icon: "🔎",
    getTransform: (lp, amount) => ({ 
      scale: 1 + amount * (1 - lp), 
      offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 
    }),
  },
  // Dynamic Zoom: Smooth zoom + pan with easing (like DaVinci Resolve Dynamic Zoom)
  dynamic: {
    label: "Dynamic Zoom", icon: "🎯",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2; // ease in-out
      const scale = 1 + amount * eased;
      // Deterministic pseudo-random based on clipIndex
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.3 * (1 - eased) * W / 100;
      const panY = randY * 0.3 * (1 - eased) * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  // Parallax Zoom: Simulated parallax with foreground/background layers
  parallax: {
    label: "Parallax Zoom", icon: "🌌",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2;
      const scale = 1 + amount * eased;
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const parallaxFactor = 1.5;
      const panX = randX * 0.4 * eased * W / 100;
      const panY = randY * 0.4 * eased * H / 100;
      return { scale, offsetX: panX * parallaxFactor, offsetY: panY * parallaxFactor, rotateX: 0, rotateY: 0 };
    },
  },
  // 3D Camera: Simulated 3D rotation + zoom
  camera3d: {
    label: "3D Camera", icon: "🎥",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2;
      const scale = 1 + amount * eased * 0.5;
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const rotateX = Math.sin(lp * Math.PI) * 0.15;
      const rotateY = Math.cos(lp * Math.PI) * 0.1;
      const panX = randX * 0.2 * eased * W / 100;
      const panY = randY * 0.2 * eased * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX, rotateY };
    },
  },
  // Morph: Keyframe-based smooth animation between start/end states
  morph: {
    label: "Morph", icon: "✨",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const smooth = lp * lp * (3 - 2 * lp);
      const scale = 1 + amount * smooth;
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.5 * (1 - smooth) * W / 100;
      const panY = randY * 0.5 * (1 - smooth) * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  // Dynamic Eased Zoom with Motion Blur: Eased zoom with directional blur intensity based on zoom velocity
  easedZoomBlur: {
    label: "Eased Zoom + Blur", icon: "💫",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Custom easing: slow start, fast middle, slow end (cubic in-out)
      const eased = lp < 0.5 ? 4 * lp * lp * lp : 1 - Math.pow(-2 * lp + 2, 3) / 2;
      const scale = 1 + amount * eased;
      // Zoom velocity for blur intensity (derivative of easing)
      const velocity = lp < 0.5 ? 12 * lp * lp : 12 * (1 - lp) * (1 - lp);
      const blurIntensity = Math.min(velocity * amount * 20, 30); // max 30px blur
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.25 * (1 - eased) * W / 100;
      const panY = randY * 0.25 * (1 - eased) * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0, blur: blurIntensity };
    },
  },
  // Motion-Blurred Zoom: Continuous zoom with directional motion blur based on movement
  motionBlurZoom: {
    label: "Motion Blur Zoom", icon: "🌪️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Exponential ease-out for natural deceleration
      const eased = 1 - Math.pow(1 - lp, 3);
      const scale = 1 + amount * eased;
      // Movement vector for motion blur direction
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.4 * eased * W / 100;
      const panY = randY * 0.4 * eased * H / 100;
      // Velocity for blur (derivative of ease-out)
      const velocity = 3 * Math.pow(1 - lp, 2);
      const blurIntensity = velocity * amount * 25; // max ~25px
      // Blur angle follows movement direction
      const blurAngle = Math.atan2(panY, panX) * 180 / Math.PI;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0, blur: blurIntensity, blurAngle };
    },
  },
  // Cinematic Dolly Zoom (Vertigo effect): Zoom in while dollying out (or vice versa)
  dollyZoom: {
    label: "Dolly Zoom (Vertigo)", icon: "🎬",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Dolly zoom: scale changes opposite to position
      const eased = Math.sin(lp * Math.PI * 0.5); // ease out sine
      const scale = 1 + amount * eased;
      // Counter-movement: as we zoom in, we pan out
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = -randX * 0.35 * eased * W / 100; // negative = opposite direction
      const panY = -randY * 0.35 * eased * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  // Whip Pan Zoom: Fast whip pan with zoom at the end
  whipPanZoom: {
    label: "Whip Pan Zoom", icon: "⚡",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Whip: slow start, extremely fast middle, sudden stop
      let eased, velocity;
      if (lp < 0.15) {
        eased = lp / 0.15 * 0.05; // slow start
        velocity = 0.05 / 0.15;
      } else if (lp < 0.85) {
        const t = (lp - 0.15) / 0.7;
        eased = 0.05 + t * 0.9; // fast whip
        velocity = 0.9 / 0.7;
      } else {
        eased = 0.95 + (lp - 0.85) / 0.15 * 0.05; // sudden stop
        velocity = 0.05 / 0.15;
      }
      const scale = 1 + amount * eased;
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.5 * eased * W / 100;
      const panY = randY * 0.5 * eased * H / 100;
      const blurIntensity = velocity * amount * 30;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0, blur: blurIntensity };
    },
  },
  // Speed Ramping / Elastic Motion: Snappy start that smoothly settles toward the end
  elasticMotion: {
    label: "Elastic Motion", icon: "🎯",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Elastic ease-out: overshoots then settles
      const eased = 1 - Math.pow(1 - lp, 3) + Math.sin(lp * Math.PI * 2) * 0.1 * (1 - lp);
      const scale = 1 + amount * eased;
      const randX = Math.sin(clipIndex * 1.57) * 0.5;
      const randY = Math.cos(clipIndex * 1.57) * 0.5;
      const panX = randX * 0.2 * eased * W / 100;
      const panY = randY * 0.2 * eased * H / 100;
      return { scale, offsetX: panX, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  // Pan / Tracking (Left, Right): Smooth horizontal pan without scale change
  panLeft: {
    label: "Pan Left", icon: "⬅️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2; // ease in-out
      const panDistance = amount * W * 0.5;
      const panX = -panDistance * eased;
      return { scale: 1, offsetX: panX, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  panRight: {
    label: "Pan Right", icon: "➡️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2; // ease in-out
      const panDistance = amount * W * 0.5;
      const panX = panDistance * eased;
      return { scale: 1, offsetX: panX, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  panUp: {
    label: "Pan Up", icon: "⬆️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2; // ease in-out
      const panDistance = amount * H * 0.5;
      const panY = -panDistance * eased;
      return { scale: 1, offsetX: 0, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  panDown: {
    label: "Pan Down", icon: "⬇️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2; // ease in-out
      const panDistance = amount * H * 0.5;
      const panY = panDistance * eased;
      return { scale: 1, offsetX: 0, offsetY: panY, rotateX: 0, rotateY: 0 };
    },
  },
  // Crash Zoom / Jump Zoom: Rapid sudden zoom burst at key moments
  crashZoom: {
    label: "Crash Zoom In", icon: "💥",
    getTransform: (lp, amount, W, H, clipIndex) => {
      // Sudden burst at 30% through the clip
      let eased;
      if (lp < 0.3) {
        eased = lp / 0.3 * 0.1; // slow buildup
      } else if (lp < 0.5) {
        const t = (lp - 0.3) / 0.2;
        eased = 0.1 + t * 0.9; // CRASH!
      } else {
        eased = 1.0; // hold at max
      }
      const scale = 1 + amount * eased;
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  crashZoomOut: {
    label: "Crash Zoom Out", icon: "💨",
    getTransform: (lp, amount, W, H, clipIndex) => {
      let eased;
      if (lp < 0.3) {
        eased = lp / 0.3 * 0.1;
      } else if (lp < 0.5) {
        const t = (lp - 0.3) / 0.2;
        eased = 0.1 + t * 0.9;
      } else {
        eased = 1.0;
      }
      // Zoom out: start zoomed, end normal
      const scale = 1 + amount * (1 - eased);
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  // Easing Curves: Linear, Ease-in, Ease-out, Ease-in-out (applied to zoom)
  linearZoom: {
    label: "Linear Zoom", icon: "📏",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const scale = 1 + amount * lp; // constant speed
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  easeInZoom: {
    label: "Ease-In Zoom", icon: "📈",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp * lp; // slow start, fast end
      const scale = 1 + amount * eased;
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  easeOutZoom: {
    label: "Ease-Out Zoom", icon: "📉",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = 1 - (1 - lp) * (1 - lp); // fast start, smooth stop
      const scale = 1 + amount * eased;
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
  easeInOutZoom: {
    label: "Ease-In-Out Zoom", icon: "〰️",
    getTransform: (lp, amount, W, H, clipIndex) => {
      const eased = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2;
      const scale = 1 + amount * eased;
      return { scale, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
    },
  },
};

export const MOTION_LIST = Object.keys(MOTION_EFFECTS).map((id) => ({ id, ...MOTION_EFFECTS[id] }));

export function motionOf(id) {
  return MOTION_EFFECTS[id] || MOTION_EFFECTS.none;
}
