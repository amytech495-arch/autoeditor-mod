// Lower-third clips: an uploaded video keyed over the main picture, placed on its
// own timeline lane. Geometry is stored as fractions of the frame (never pixels)
// so the canvas preview, the WebCodecs export and any future server render all
// agree at 720p, 1080p or 4K. `x`/`y` are centre-anchored, matching the
// textOverlay convention so both overlay kinds line up.

export const LOWER_THIRD_MIN_SIZE = 0.08;
export const LOWER_THIRD_MAX_SIZE = 1;

// Studio green, the colour most lower thirds are shot against.
export const DEFAULT_KEY_COLOR = "#00b140";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export function makeLowerThird(id, opts = {}) {
  const sourceDuration = Math.max(0.2, num(opts.sourceDuration, 3));
  return {
    id,
    name: opts.name || "Lower third",
    file: opts.file || null,
    url: opts.url || null,
    thumb: opts.thumb || null,
    start: Math.max(0, num(opts.start, 0)),
    duration: sourceDuration,
    sourceDuration,
    // How far into the file the visible window starts. Only a head trim moves
    // this; it exists so trimming the start doesn't replay the cut-off frames.
    offset: Math.max(0, num(opts.offset, 0)),
    // Placement — bottom-left by default, which is where a name plate belongs.
    x: num(opts.x, 0.28),
    y: num(opts.y, 0.72),
    size: clamp(num(opts.size, 0.3), LOWER_THIRD_MIN_SIZE, LOWER_THIRD_MAX_SIZE),
    // Green screen.
    keyEnabled: opts.keyEnabled ?? true,
    keyColor: opts.keyColor || DEFAULT_KEY_COLOR,
    similarity: clamp(num(opts.similarity, 0.18), 0, 1),
    smoothness: clamp(num(opts.smoothness, 0.1), 0, 1),
    despill: clamp(num(opts.despill, 0.6), 0, 1),
    enabled: opts.enabled ?? true,
  };
}

// Keep a clip inside the timeline after a drag, trim or duration change. A clip
// longer than the project is pinned to the start rather than dropped, so a long
// import stays visible (and editable) instead of vanishing off the right edge.
export function clampLowerThird(lt, projectDuration) {
  const dur = Math.max(0.1, num(lt.duration, 1));
  const span = Math.max(dur, num(projectDuration, dur));
  // A trimmed head pushes `offset` into the file, so the visible window
  // [offset, offset+dur) must stay inside the file or we'd run off its end.
  const src = Math.max(num(lt.sourceDuration, 0), 0);
  let offset = Math.max(0, num(lt.offset, 0));
  let duration = dur;
  if (src > 0) {
    offset = Math.min(offset, Math.max(0, src - 0.1));
    duration = Math.min(dur, Math.max(0.1, src - offset));
  }
  return {
    ...lt,
    offset,
    duration,
    start: clamp(num(lt.start, 0), 0, Math.max(0, span - duration)),
  };
}

// Is this clip on screen at time t? Half-open so back-to-back clips hand over
// cleanly instead of both drawing on the boundary frame.
export function lowerThirdActiveAt(lt, t) {
  return lt.enabled !== false && t >= lt.start && t < lt.start + lt.duration;
}

// Aspect-fit the clip into the frame at its stored size/position. The video is
// fit by width and allowed to overflow the frame edge rather than being letter-
// boxed, so a keyed subject can sit flush against a bottom corner the way a
// real lower third does.
export function lowerThirdRect(lt, W, H, aspect) {
  const ar = num(aspect, 16 / 9) > 0.01 ? num(aspect, 16 / 9) : 16 / 9;
  const w = W * clamp(num(lt.size, 0.3), LOWER_THIRD_MIN_SIZE, LOWER_THIRD_MAX_SIZE);
  const h = w / ar;
  const cx = W * clamp(num(lt.x, 0.5), 0, 1);
  const cy = H * clamp(num(lt.y, 0.5), 0, 1);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// The lane's clip bounds, for the timeline drag maths.
export function lowerThirdBounds(lt, projectDuration) {
  const dur = Math.max(0.1, num(lt.duration, 1));
  const span = Math.max(dur, num(projectDuration, dur));
  return { start: clamp(num(lt.start, 0), 0, Math.max(0, span - dur)), duration: dur };
}

// Serialisable half of a lower third — the blob URL and File are session-only
// (they are far too large for localStorage), so presets keep the placement and
// key settings and re-ask for the file, exactly like the video overlay panel.
export function lowerThirdSettings(lt) {
  return {
    start: lt.start,
    duration: lt.duration,
    sourceDuration: lt.sourceDuration,
    x: lt.x,
    y: lt.y,
    size: lt.size,
    keyEnabled: lt.keyEnabled,
    keyColor: lt.keyColor,
    similarity: lt.similarity,
    smoothness: lt.smoothness,
    despill: lt.despill,
    enabled: lt.enabled,
    name: lt.name,
  };
}

// Grab a poster frame for the timeline lane. Sampled a little way in rather
// than at 0s because the first frame of an uploaded clip is often black or
// still mid-keyframe.
export async function captureThumb(video, maxW = 192) {
  const w0 = video.videoWidth;
  const h0 = video.videoHeight;
  if (!w0 || !h0) return null;
  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  const at = Math.min(Math.max(dur * 0.15, 0.05), Math.max(dur - 0.05, 0.05));
  if (Math.abs(video.currentTime - at) > 0.02) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("seeked", finish);
        resolve();
      };
      video.addEventListener("seeked", finish, { once: true });
      // Never hang the add flow on a file that refuses to seek.
      setTimeout(finish, 1200);
      try {
        video.currentTime = at;
      } catch {
        finish();
      }
    });
  }
  const scale = Math.min(1, maxW / w0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  try {
    return c.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}
