// Resolve output frame size (even numbers, required by libx264) from the chosen
// aspect. "auto" matches a sample image's natural size.
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

export function resolveDimensions(aspect, sample) {
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  if (aspect === "auto" && sample && sample.width && sample.height) {
    return { width: even(sample.width), height: even(sample.height) };
  }
  return { width: 1920, height: 1080 }; // 16:9 default (and auto fallback)
}

// Scale a resolution down to a 720p box (short side ≤ 720, long side ≤ 1280),
// preserving aspect and keeping even dimensions. Returns it unchanged if it
// already fits. Used by the "720p (faster)" render-quality option — ~2× less
// filter/encode work than 1080p, big win on phones.
export function capTo720(d) {
  const short = Math.min(d.width, d.height);
  const long = Math.max(d.width, d.height);
  const s = Math.min(1, 720 / short, 1280 / long);
  if (s >= 1) return d;
  return { width: even(d.width * s), height: even(d.height * s) };
}

// Scale a resolution UP to a 4K box (long side 3840, so 16:9 → 3840×2160 and
// 9:16 → 2160×3840), preserving aspect with even dimensions. Returns it
// unchanged if it's already 4K or larger. Used by the "4K (UHD)" render choice —
// the composed frame is rendered at this size, so source images upscale to it.
export function upTo4K(d) {
  const long = Math.max(d.width, d.height);
  const s = 3840 / long;
  if (s <= 1) return d;
  return { width: even(d.width * s), height: even(d.height * s) };
}
