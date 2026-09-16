// Timed text overlays — user-placed titles/labels/callouts drawn anywhere on
// the frame, above captions and below the watermark (the same layering the
// ffmpeg burn uses). Positions are fractions of W/H so a canvas preview, the
// WebCodecs exporter and the ffmpeg render all line up regardless of resolution.

// Match the app's default caption font so overlay words read like the captions.
const TEXT_OVERLAY_FONT = (px) => `700 ${px}px "CaptionFont", system-ui, sans-serif`;

// A new overlay item, defaulting to a centered label spanning the whole video.
export function makeTextOverlay(id, duration = 0) {
  return {
    id,
    text: "Text overlay",
    start: 0,
    end: duration > 1 ? duration : 3,
    x: 0.5,   // 0..1 fraction of frame width (center-anchored)
    y: 0.5,   // 0..1 fraction of frame height (center-anchored)
    size: 0.06, // font height as a fraction of frame height
    color: "#ffffff",
    opacity: 1,
  };
}

export function textOverlayFontPx(H, it) {
  return Math.max(12, Math.round(H * Math.min(0.5, Math.max(0.01, it.size ?? 0.06))));
}

// Draw every overlay active at time t. Canvas preview + WebCodecs burn share this.
export function drawTextOverlays(ctx, items, W, H, t) {
  if (!Array.isArray(items) || !items.length) return;
  for (const it of items) {
    if (!it) continue;
    if (t < (it.start ?? 0) || t >= (it.end ?? Number.MAX_SAFE_INTEGER)) continue;
    const text = String(it.text ?? "").trim();
    if (!text) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, it.opacity ?? 1));
    ctx.font = TEXT_OVERLAY_FONT(textOverlayFontPx(H, it));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = it.color || "#ffffff";
    ctx.fillText(text, (it.x ?? 0.5) * W, (it.y ?? 0.5) * H);
    ctx.restore();
  }
}