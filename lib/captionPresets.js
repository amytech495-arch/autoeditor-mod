// Caption template presets — CapCut-style one-tap looks. Each preset bundles a
// style + font + animation (+ optional size/line-height), so picking a template
// restyles the captions instantly in preview and in the burned render.

export const CAPTION_PRESETS = [
  {
    id: "none",
    label: "None",
    style: "classic", font: "classic", animation: "none",
    desc: "Plain default captions — no template styling.",
  },
  {
    id: "default",
    label: "Default",
    style: "classic", font: "classic", animation: "none",
    desc: "Clean white text with a black outline.",
  },
  {
    id: "blackbox",
    label: "Black Box",
    style: "boxed", font: "anton", animation: "pop",
    desc: "Bold white text on a black box, words pop in.",
  },
  {
    id: "whitebox",
    label: "White Box",
    style: "ink", font: "archivo", animation: "karaoke",
    desc: "Black text on a white box, spoken words highlight blue.",
  },
  {
    id: "karaoke",
    label: "Karaoke",
    style: "classic", font: "anton", animation: "karaoke",
    desc: "Spoken words light up yellow as they're said.",
  },
  {
    id: "outline",
    label: "Outline",
    style: "shadow", font: "anton", animation: "none",
    desc: "Big bold text with a hard shadow.",
  },
  {
    id: "glow",
    label: "Glow",
    style: "yellow", font: "archivo", animation: "pop",
    desc: "Yellow glowing text, words pop in.",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    style: "boxed", font: "classic", animation: "typewriter",
    desc: "Letters reveal one by one on a black box.",
  },
  {
    id: "minimal",
    label: "Minimal",
    style: "shadow", font: "classic", animation: "fade", size: "sm",
    desc: "Small subtle captions that fade in.",
  },
];

export const captionPreset = (id) =>
  CAPTION_PRESETS.find((p) => p.id === id) || null;

// Apply a preset to the caption state setters (style/font/animation/size).
// Returns true when a preset was applied.
export function applyCaptionPreset(presetId, setters) {
  const p = captionPreset(presetId);
  if (!p) return false;
  const { setCaptionStyle, setCaptionFont, setCaptionAnimation, setCaptionSize } = setters || {};
  if (setCaptionStyle) setCaptionStyle(p.style);
  if (setCaptionFont) setCaptionFont(p.font);
  if (setCaptionAnimation) setCaptionAnimation(p.animation);
  if (setCaptionSize && p.size) setCaptionSize(p.size);
  return true;
}
