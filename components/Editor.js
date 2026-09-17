"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Timeline from "./Timeline";
import {
  TRANSITION_LIST, transitionOf,
  MIN_TRANSITION_DURATION, MAX_TRANSITION_DURATION,
  MOTION_LIST, motionOf,
} from "../lib/transitions";
import { FX_LIST, fxOf, applyFx, fxSeed } from "../lib/imageEffects";
import {
  CAPTION_STYLE_LIST, CAPTION_SIZES, CAPTION_ANIMATION_LIST,
  captionCueAt, drawCaption, captionFontPx, captionLineHeightDefault, drawWatermark,
} from "../lib/captions";
import { drawTextOverlays } from "../lib/textOverlay";
import { SFX_LIB, previewSfx, stopSfxPreviews } from "../lib/sfx";


function tc(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

function clock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Editor({
  clips, imageEls, audioUrl, duration, peaks, dims,
  aspect, setAspect, fps, setFps,
  renderQuality = "full", setRenderQuality, renderDims,
  onRender, onCancel, busy, progress, outUrl, error, warnings,
  onWebCodecsTest, onWebCodecsCancel, wcBusy, wcProgress, wcPhase, wcAvailable, serverAvailable, wcEnabled, setWcEnabled,
  replaceImage, removeImage, fillGap, resizeBoundary,
  transitionsByName, transitionDuration, setTransition, applyTransitionAll, applyTransitionMix, setTransitionDuration,
  fadeIn, setFadeIn, fadeOut, setFadeOut,
  motionByName, setMotion, applyMotionAll, applyMotionAlternate, applyMotionMix, motionAmount, setMotionAmount,
  fxByName = {}, setFx, applyFxAll, applyFxMix, fxAmount, setFxAmount,
  videoInfoByName = {}, trimByName = {}, setTrim, volumeByName = {}, setVolume,
  fitByName = {}, setFit,
  trimEnd, setTrimEnd, exportDuration,
  undo, redo, canUndo, canRedo,
  captionCues, captionsOn, setCaptionsOn, captionStyle, setCaptionStyle,
  captionSize, setCaptionSize, captionLineHeight, setCaptionLineHeight,
  captionFontScale, setCaptionFontScale,
  captionAnimation, setCaptionAnimation,
  captionName, captionError, onCaptionFile,
  syncOn, setSyncOn, syncStatus, syncAligned,
  audioLayers, setAudioLayers, updateAudioLayer, removeAudioLayer, moveAudioLayer, addAudioLayer,
  addAudioClipToLayer, removeAudioClip, updateAudioClip,
  sfx = [], addSfx, moveSfx, setSfxVolume, removeSfx, uploadSfx, removeSfxUpload,
  selectedSound, setSelectedSound, sfxUploads = [], sfxOpen, setSfxOpen,
  sfxMaster = 1, setSfxMaster,
  overlayUrl, overlayDuration,
  setOverlayFile, setOverlayUrl, setOverlayDuration,
  overlayOpacity, setOverlayOpacity,
  overlayBlendMode, setOverlayBlendMode,
  overlayLoop, setOverlayLoop,
  overlayEnabled, setOverlayEnabled,
  onOverlay,
  watermarkUrl,
  setWatermarkFile, setWatermarkUrl,
  watermarkSize, setWatermarkSize,
  watermarkX, setWatermarkX,
  watermarkY, setWatermarkY,
  watermarkOpacity, setWatermarkOpacity,
  watermarkEnabled, setWatermarkEnabled,
  onWatermark,
  textOverlays = [], addTextOverlay, updateTextOverlay, removeTextOverlay,
}) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const audioLayerRefs = useRef({}); // layerId -> { clipId -> <audio> element }
  const overlayVideoRef = useRef(null); // overlay video element for preview
  const watermarkImgRef = useRef(null); // watermark image element for preview
  const fxBufRef = useRef(null); // offscreen canvas for the image-effect filter pass
  const watermarkInputRef = useRef(null);
  const rafRef = useRef(0);
  const fileInputRef = useRef(null);
  const capInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const audioLayerInputRef = useRef(null);
  const sfxInputRef = useRef(null);
  const sfxAudioRefs = useRef(new Map()); // marker id -> <audio> element (preview playback)
  const sfxPrevRef = useRef(0);           // playhead time at the previous RAF frame, for crossing detection
  const sfxResolvedRef = useRef([]);      // latest resolved markers (read by the RAF loop)
  const overlayInputRef = useRef(null);
  const pending = useRef(null); // gap-fill target name
  const trimEndRef = useRef(exportDuration);
  const vidRefs = useRef({});     // clip name -> offscreen <video> for live preview
  const drawRef = useRef(null);   // latest draw fn (so video 'seeked' can redraw)
  const timeRef = useRef(0);      // latest playhead time
  const modalVideoRef = useRef(null); // the trim scrubber <video> in the inspector
  const timelineScrollRef = useRef(null); // scroll container of the timeline, for skip-to-ends
  useEffect(() => { trimEndRef.current = exportDuration; }, [exportDuration]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds spent in the current render
  const [selectedCut, setSelectedCut] = useState(null); // selected clip name (drives transition)
  const [currentType, setCurrentType] = useState("fade");
  const [currentMotion, setCurrentMotion] = useState("dynamic"); // drives "Apply … to all" in Advanced Motion
  const [currentFx, setCurrentFx] = useState("none"); // drives "Apply … to all" in Image Effects
  const [warn4k, setWarn4k] = useState(false); // transient "4K is heavy" toast on quality select
  const warnTimer = useRef(null);
  useEffect(() => () => clearTimeout(warnTimer.current), []);
  // Sound-effect previews are one-shots — silence any still playing on unmount.
  useEffect(() => () => stopSfxPreviews(), []);

  // Resolve each placed marker's source to a playable URL (library preset or upload).
  const sfxUrlFor = useCallback((src) => {
    if (!src) return null;
    if (src.kind === "lib") return src.file;
    const up = sfxUploads.find((u) => u.mediaId === src.mediaId);
    return up ? up.url : null;
  }, [sfxUploads]);
  const sfxResolved = useMemo(
    () => sfx.map((s) => ({ id: s.id, at: s.at, volume: s.volume, url: sfxUrlFor(s.src) })),
    [sfx, sfxUrlFor]
  );
  useEffect(() => { sfxResolvedRef.current = sfxResolved; }, [sfxResolved]);

  // One <audio> element per placed marker, reused across frames. Created lazily and
  // volume-scaled by the lane's master gain; removed when its marker disappears.
  useEffect(() => {
    const refs = sfxAudioRefs.current;
    const live = new Set(sfxResolved.map((s) => s.id));
    for (const [id, el] of [...refs]) {
      if (!live.has(id)) { try { el.pause(); el.src = ""; } catch (_) {} refs.delete(id); }
    }
    for (const s of sfxResolved) {
      let el = refs.get(s.id);
      if (el && el.dataset.url !== (s.url || "")) {
        try { el.pause(); el.src = ""; } catch (_) {}
        refs.delete(s.id); el = null;
      }
      if (!el && s.url) {
        el = new Audio(s.url);
        el.preload = "auto";
        el.dataset.url = s.url;
        refs.set(s.id, el);
      }
      if (el) el.volume = Math.max(0, Math.min(1, (s.volume == null ? 0.8 : s.volume) * sfxMaster));
    }
  }, [sfxResolved, sfxMaster]);
  const [inspect, setInspect] = useState(null);   // slot name open in the inspector
  const [dismissedWarn, setDismissedWarn] = useState(() => new Set()); // hidden warning texts
  const [timelineZoom, setTimelineZoom] = useState(1); // 0.5 to 4
  // On touch devices, accept="image/*"/"video/*" makes Android open Google Photos,
  // which renames files and breaks the timestamp. Dropping accept opens the Files
  // picker instead (keeps 0-04.mp4). onPick* still filter by type, so nothing bad
  // gets through. Same trick as Dropzone.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    try { setCoarse(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch { /* ignore */ }
  }, []);
  const [pendFile, setPendFile] = useState(null);  // chosen replacement, not yet applied
  const [pendUrl, setPendUrl] = useState(null);
  const [mixMode, setMixMode] = useState(false); // Transitions panel in random-mix mode
  const [mixPicks, setMixPicks] = useState(() => new Set()); // ephemeral: chosen transitions for the random mix
  const toggleMix = useCallback((id) => {
    setMixPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const useFavStore = (key) => {
    const [favs, setFavs] = useState(() => {
      try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
    });
    const toggle = useCallback((id) => {
      setFavs((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
    }, [key]);
    return [favs, toggle];
  };
  const [favTransitions, toggleFavTransition] = useFavStore("ae.fav.transitions");
  const [favMotion, toggleFavMotion] = useFavStore("ae.fav.motion");
  const [favFx, toggleFavFx] = useFavStore("ae.fav.fx");

  const [mixMotionMode, setMixMotionMode] = useState(false);
  const [mixMotionPicks, setMixMotionPicks] = useState(() => new Set());
  const toggleMixMotion = useCallback((id) => {
    setMixMotionPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const [fxMixMode, setFxMixMode] = useState(false);
  const [fxMixPicks, setFxMixPicks] = useState(() => new Set());
  const toggleFxMix = useCallback((id) => {
    setFxMixPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const askAdd = useCallback((name) => {
    pending.current = name;
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const onPickFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file && pending.current && fillGap) fillGap(pending.current, file);
    e.target.value = "";
    pending.current = null;
  }, [fillGap]);

  const onPickAudioLayer = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("audio/")) return;
    if (addAudioLayer) await addAudioLayer([file]);
  }, [addAudioLayer]);

  // Clip inspector: click a clip → preview → optionally pick a replacement,
  // preview it, then Apply (or Remove the image).
  const clearPend = useCallback(() => {
    setPendUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setPendFile(null);
  }, []);
  const openInspect = useCallback((name) => { clearPend(); setInspect(name); }, [clearPend]);
  const closeInspect = useCallback(() => { clearPend(); setInspect(null); }, [clearPend]);
  const onPickReplacement = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return;
    setPendFile(file);
    setPendUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(file); });
  }, []);
  const applyReplacement = useCallback(() => {
    if (inspect && pendFile && replaceImage) replaceImage(inspect, pendFile);
    closeInspect();
  }, [inspect, pendFile, replaceImage, closeInspect]);
  const removeInspected = useCallback(() => {
    if (inspect && removeImage) removeImage(inspect);
    closeInspect();
  }, [inspect, removeImage, closeInspect]);

  useEffect(() => {
    if (!inspect) return;
    const onEsc = (e) => { if (e.key === "Escape") closeInspect(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [inspect, closeInspect]);

  const onPickCaption = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (file && onCaptionFile) onCaptionFile(file);
    e.target.value = "";
  }, [onCaptionFile]);

  // Keep one offscreen <video> per video clip so the preview can draw live frames
  // (not just the poster). Created/torn down as clips come and go.
  useEffect(() => {
    const map = vidRefs.current;
    for (const [name, info] of Object.entries(videoInfoByName)) {
      if (!map[name] && info && info.url) {
        const v = document.createElement("video");
        v.src = info.url; v.muted = true; v.playsInline = true; v.preload = "auto";
        const redraw = () => { if (drawRef.current) drawRef.current(timeRef.current); };
        v.addEventListener("seeked", redraw);
        v.addEventListener("loadeddata", redraw);
        map[name] = v;
      }
    }
    for (const name of Object.keys(map)) {
      if (!videoInfoByName[name]) { try { map[name].pause(); } catch { /* ignore */ } delete map[name]; }
    }
  }, [videoInfoByName]);

  // Where in the source video to show for a clip at playhead t: the trim in-point
  // plus elapsed × speed (fast-forward). Mirrors the render math in page.js.
  const videoParams = useCallback((name, slotDur) => {
    const info = videoInfoByName[name];
    if (!info) return null;
    const dur = info.duration || 0;
    // Default by length: longer-than-slot trims (1x), shorter fills the slot ("fit").
    const mode = fitByName[name] || (dur > slotDur ? "trim" : "fit");
    if (mode === "fit" && slotDur > 0 && dur > 0 && Math.abs(dur - slotDur) > 0.05) return { trimStart: 0, speed: dur / slotDur };
    return { trimStart: trimByName[name] || 0, speed: 1 };
  }, [videoInfoByName, fitByName, trimByName]);

  const draw = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    let activeVideo = null; // clip name whose video should be playing this frame

    // Per-clip motion transform at time tt (gaps never animate). Progress is clamped so
    // an outgoing image keeps its end-of-clip transform through the transition.
    const transformAt = (ci, tt) => {
      const c = clips[ci];
      if (!c || c.gap) return { scale: 1, offsetX: 0, offsetY: 0, rotateX: 0, rotateY: 0 };
      const m = (motionByName && motionByName[c.name]) || "none";
      const motion = motionOf(m);
      const lp = Math.min(1, Math.max(0, (tt - c.start) / c.duration));
      const t = motion.getTransform(lp, motionAmount, W, H, ci);
      return {
        scale: t.scale,
        offsetX: t.offsetX || 0,
        offsetY: t.offsetY || 0,
        rotateX: t.rotateX || 0,
        rotateY: t.rotateY || 0,
      };
    };

    // Start/keep a clip's offscreen <video> playing in sync with the playhead and
    // mark it active (so it isn't paused). Returns the element to draw, or null if
    // it isn't a ready-to-draw video. Called both while a clip is showing AND
    // during the transition INTO it, so the video is already warm when revealed.
    const primeVideo = (c, tt, wantDraw) => {
      const vinfo = videoInfoByName[c.name];
      if (!vinfo) return null;
      const v = vidRefs.current[c.name];
      const pr = videoParams(c.name, c.duration);
      if (!v || !pr) return null;
      const srcTime = Math.min(vinfo.duration || 0, Math.max(0, pr.trimStart + (tt - c.start) * pr.speed));
      const clipVol = volumeByName[c.name] == null ? 0.5 : volumeByName[c.name];
      v.volume = Math.min(1, Math.max(0, clipVol));
      v.muted = clipVol <= 0;
      v.playbackRate = Math.min(16, Math.max(0.0625, pr.speed));
      if (v.paused) { try { v.currentTime = srcTime; } catch { /* ignore */ } v.play().catch(() => {}); }
      else if (Math.abs(v.currentTime - srcTime) > 0.6) { try { v.currentTime = srcTime; } catch { /* ignore */ } }
      activeVideo = c.name;
      return (wantDraw && v.readyState >= 2 && !v.seeking) ? v : null;
    };

    let fx = "";
    let fxName = null;
    if (clips.length) {
      let idx = clips.findIndex((c) => t >= c.start && t < c.start + c.duration);
      if (idx === -1) idx = clips.length - 1;
      const clip = clips[idx];
      fx = (fxByName && fxByName[clip.name]) || "none";
      fxName = clip.name;
      const type = idx > 0 ? (transitionsByName[clip.name] || "cut") : "cut";
      const tdur = type === "cut" ? 0 : Math.min(transitionDuration, clip.duration);

      if (idx > 0 && tdur > 0 && t < clip.start + tdur) {
        // Inside a transition: blend the previous image into this one, each at
        // its own current zoom so nothing snaps back to normal size.
        const p = Math.min(1, Math.max(0, (t - clip.start) / tdur));
        const fromT = transformAt(idx - 1, t);
        const toT = transformAt(idx, t);
        transitionOf(type).canvas(
          ctx, imageEls[clips[idx - 1].name] || null, imageEls[clip.name] || null, p, W, H,
          fromT.scale, toT.scale
        );
        ctx.globalAlpha = 1;
        // Warm up the incoming video during the transition so it's already
        // decoding/playing when it takes over — fixes the stall-then-smooth start.
        if (playing) primeVideo(clip, t, false);
      } else {
        // While PLAYING, draw live video frames (kept warm since the transition);
        // paused/scrubbing shows the still poster — seeking a paused, offscreen
        // video flashes black on many (mobile) browsers, so we don't seek it.
        let drawable = imageEls[clip.name];
        if (playing) { const vEl = primeVideo(clip, t, true); if (vEl) drawable = vEl; }
        const dw = (drawable && (drawable.videoWidth || drawable.naturalWidth)) || 0;
        const dh = (drawable && (drawable.videoHeight || drawable.naturalHeight)) || 0;
        if (drawable && dw && dh) {
          const tform = transformAt(idx, t);
          const baseScale = Math.min(W / dw, H / dh);
          const scale = baseScale * tform.scale;
          const w = dw * scale, h = dh * scale;
          // Apply transform: translate to center, rotate, translate back, then draw
          ctx.save();
          ctx.translate(W / 2 + tform.offsetX, H / 2 + tform.offsetY);
          if (tform.rotateX || tform.rotateY) {
            // Simulate 3D rotation with scale transform
            ctx.scale(1 - Math.abs(tform.rotateY), 1 - Math.abs(tform.rotateX));
          }
          ctx.drawImage(drawable, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
    }

    // Image effects: burn the clip's grade + overlays in under the overlay/captions.
    if (fx && fx !== "none" && fxAmount > 0) {
      let buf = fxBufRef.current;
      if (!buf || buf.W !== W || buf.H !== H) {
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        buf = { canvas: c, ctx: c.getContext("2d"), W, H };
        fxBufRef.current = buf;
      }
      applyFx(ctx, buf.ctx, fx, fxAmount, W, H, fxName ? fxSeed(fxName) : 0, Math.floor(t * 24));
    }

    // Only the clip under the playhead plays; pause every other clip's video.
    for (const [nm, v] of Object.entries(vidRefs.current)) {
      if (nm !== activeVideo && !v.paused) { try { v.pause(); } catch { /* ignore */ } }
    }

    // Draw overlay video (old film texture, etc.)
    if (overlayEnabled && overlayVideoRef.current && overlayUrl) {
      const ov = overlayVideoRef.current;
      if (ov.readyState >= 2 && !ov.seeking && ov.videoWidth && ov.videoHeight) {
        ctx.save();
        ctx.globalAlpha = overlayOpacity;
        ctx.globalCompositeOperation = overlayBlendMode;
        const ovW = ov.videoWidth, ovH = ov.videoHeight;
        const scale = Math.max(W / ovW, H / ovH); // cover
        const w = ovW * scale, h = ovH * scale;
        ctx.drawImage(ov, (W - w) / 2, (H - h) / 2, w, h);
        ctx.restore();
      }
    }

    // Captions burn in before the fades, so the fade dims them too.
    if (captionsOn && captionCues && captionCues.length) {
      const cue = captionCueAt(captionCues, t);
      if (cue) drawCaption(ctx, cue.text, W, H, captionStyle, captionFontPx(H, captionSize, captionFontScale), captionLineHeight, captionAnimation, t - cue.start, cue.end - cue.start);
    }

    // Timed text overlays (titles/labels) — same layer as WebCodecs + ffmpeg burn.
    if (Array.isArray(textOverlays) && textOverlays.length) drawTextOverlays(ctx, textOverlays, W, H, t);

    // Scene fades (opening / ending).
    if (fadeIn > 0 && t < fadeIn) {
      ctx.globalAlpha = Math.max(0, 1 - t / fadeIn);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    const outStart = exportDuration - fadeOut;
    if (fadeOut > 0 && t > outStart) {
      ctx.globalAlpha = Math.min(1, (t - outStart) / fadeOut);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }

    // Static image overlay (logo / watermark) on top of everything, like the render.
    const wImg = watermarkImgRef.current;
    if (watermarkEnabled && wImg && watermarkUrl) {
      drawWatermark(ctx, wImg, W, H, { size: watermarkSize, x: watermarkX, y: watermarkY, opacity: watermarkOpacity });
    }
  }, [clips, imageEls, transitionsByName, transitionDuration, motionByName, motionAmount, fxByName, fxAmount,
      fadeIn, fadeOut, duration, exportDuration, playing, videoInfoByName, videoParams, volumeByName,
      captionsOn, captionCues, captionStyle, captionSize, captionLineHeight, captionFontScale, captionAnimation,
      overlayEnabled, overlayUrl, overlayOpacity, overlayBlendMode, overlayDuration,
      watermarkEnabled, watermarkUrl, watermarkSize, watermarkX, watermarkY, watermarkOpacity, textOverlays]);

  useEffect(() => { drawRef.current = draw; }, [draw]);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => { draw(time); }, [time, draw]);
  useEffect(() => { setTime(0); }, [audioUrl]);

  // Elapsed render timer.
  useEffect(() => {
    if (!busy && !wcBusy) { setElapsed(0); return; }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => clearInterval(id);
  }, [busy, wcBusy]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const loop = () => {
      if (a.paused) return; // Only run when playing
      const end = trimEndRef.current;
      if (end > 0 && a.currentTime >= end) {
        a.pause();
        a.currentTime = end;
        setTime(end);
        return;
      }
      setTime(a.currentTime);
      // FX-lane sound effects: fire each marker once, the frame the playhead crosses it.
      const mainT = a.currentTime;
      const prevT = sfxPrevRef.current;
      sfxPrevRef.current = mainT;
      for (const s of sfxResolvedRef.current) {
        if (prevT <= s.at && mainT > s.at) {
          const el = sfxAudioRefs.current.get(s.id);
          if (el) { try { el.currentTime = 0; } catch (_) {} el.play().catch(() => {}); }
        }
      }
      // Sync audio layer clips to main audio position
      for (const [layerId, clipRefs] of Object.entries(audioLayerRefs.current)) {
        const layer = audioLayers.find((l) => l.id === layerId);
        if (!layer || layer.muted) {
          for (const clipEl of Object.values(clipRefs)) {
            if (!clipEl.paused) clipEl.pause();
          }
          continue;
        }
        const mainTime = a.currentTime;
        for (const clip of layer.clips) {
          const clipEl = clipRefs[clip.id];
          if (!clipEl) continue;
          const clipTime = mainTime - clip.start;
          if (clipTime >= 0 && clipTime < clip.duration) {
            if (Math.abs(clipEl.currentTime - clipTime) > 0.1) {
              try { clipEl.currentTime = clipTime; } catch (_) {}
            }
            if (clipEl.paused) clipEl.play().catch(() => {});
          } else if (!clipEl.paused) {
            clipEl.pause();
          }
        }
      }
      // Sync overlay video
      if (overlayEnabled && overlayVideoRef.current && overlayUrl) {
        const ov = overlayVideoRef.current;
        const mainTime = a.currentTime;
        let overlayTime = mainTime % (overlayDuration || 1);
        if (Math.abs(ov.currentTime - overlayTime) > 0.1) {
          try { ov.currentTime = overlayTime; } catch (_) {}
        }
        if (ov.paused) ov.play().catch(() => {});
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      // Start crossing detection from the current position (never retro-fire markers).
      sfxPrevRef.current = a.currentTime;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    const onStop = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setTime(a.currentTime);
      for (const el of sfxAudioRefs.current.values()) { if (!el.paused) { try { el.pause(); } catch (_) {} } }
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioUrl, audioLayers, overlayEnabled, overlayUrl, overlayDuration, overlayLoop]);

  // Create/cleanup audio layer elements (now per-clip)
  // Track clip properties to detect changes
  const clipPropsRef = useRef(new Map()); // clipId -> { start, duration, url }

  useEffect(() => {
    const currentLayerIds = new Set(audioLayers.map((l) => l.id));
    // Remove old layer elements
    for (const [layerId, clipRefs] of Object.entries(audioLayerRefs.current)) {
      if (!currentLayerIds.has(layerId)) {
        for (const [clipId, el] of Object.entries(clipRefs)) {
          try { el.pause(); el.src = ""; } catch (_) {}
        }
        delete audioLayerRefs.current[layerId];
        clipPropsRef.current.delete(layerId);
        continue;
      }
      const layer = audioLayers.find((l) => l.id === layerId);
      if (!layer) continue;
      const currentClipIds = new Set(layer.clips.map((c) => c.id));
      
      if (!clipPropsRef.current.has(layerId)) {
        clipPropsRef.current.set(layerId, new Map());
      }
      const layerProps = clipPropsRef.current.get(layerId);
      
      // Remove old clip elements
      for (const [clipId, el] of Object.entries(clipRefs)) {
        if (!currentClipIds.has(clipId)) {
          try { el.pause(); el.src = ""; } catch (_) {}
          delete clipRefs[clipId];
          layerProps.delete(clipId);
        }
      }
      // Create new clip elements or recreate if props changed
      if (!audioLayerRefs.current[layerId]) {
        audioLayerRefs.current[layerId] = {};
      }
      for (const clip of layer.clips) {
        const prevProps = layerProps.get(clip.id);
        const propsChanged = prevProps && (prevProps.start !== clip.start || prevProps.duration !== clip.duration || prevProps.url !== clip.url);
        
        if (!clipRefs[clip.id] || propsChanged) {
          // Recreate if new or props changed
          if (clipRefs[clip.id]) {
            try { clipRefs[clip.id].pause(); clipRefs[clip.id].src = ""; } catch (_) {}
          }
          if (clip.url) {
            const el = new Audio(clip.url);
            el.volume = clip.volume * layer.volume;
            el.muted = layer.muted;
            el.preload = "auto";
            clipRefs[clip.id] = el;
          }
        } else if (clipRefs[clip.id]) {
          const el = clipRefs[clip.id];
          el.volume = clip.volume * layer.volume;
          el.muted = layer.muted;
        }
        // Update tracked props
        layerProps.set(clip.id, { start: clip.start, duration: clip.duration, url: clip.url });
      }
      // Clean up deleted clip props
      for (const [clipId] of layerProps) {
        if (!currentClipIds.has(clipId)) {
          layerProps.delete(clipId);
        }
      }
    }
    // Create new layer elements
    for (const layer of audioLayers) {
      if (!audioLayerRefs.current[layer.id]) {
        audioLayerRefs.current[layer.id] = {};
        clipPropsRef.current.set(layer.id, new Map());
        for (const clip of layer.clips) {
          if (clip.url) {
            const el = new Audio(clip.url);
            el.volume = clip.volume * layer.volume;
            el.muted = layer.muted;
            el.preload = "auto";
            audioLayerRefs.current[layer.id][clip.id] = el;
            clipPropsRef.current.get(layer.id).set(clip.id, { start: clip.start, duration: clip.duration, url: clip.url });
          }
        }
      }
    }
  }, [audioLayers]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }, []);

  // Coalesce rapid scrub seeks: while a seek is still settling (slow for WAV),
  // remember the latest target and apply it on 'seeked', so the drag's release
  // position always wins instead of being dropped mid-seek.
  const pendingSeekRef = useRef(null);
  const seek = useCallback((t) => {
    const a = audioRef.current;
    if (!a) return;
    const c = Math.min(Math.max(t, 0), duration || t || 0);
    setTime(c);
    // A seek repositions the playhead: silence in-flight effects and rebase the
    // crossing detector so nothing fires for markers we skipped over.
    sfxPrevRef.current = c;
    for (const el of sfxAudioRefs.current.values()) { if (!el.paused) { try { el.pause(); } catch (_) {} } }
    if (a.seeking) pendingSeekRef.current = c;
    else {
      pendingSeekRef.current = null;
      try { a.currentTime = c; } catch (_) {}
      // Seek audio layer clips
      for (const [layerId, clipRefs] of Object.entries(audioLayerRefs.current)) {
        const layer = audioLayers.find((l) => l.id === layerId);
        if (!layer || layer.muted) continue;
        for (const clip of layer.clips) {
          const clipEl = clipRefs[clip.id];
          if (!clipEl) continue;
          const clipTime = c - clip.start;
          if (clipTime >= 0 && clipTime < clip.duration) {
            try { clipEl.currentTime = clipTime; } catch (_) {}
          }
        }
      }
    }
  }, [duration, audioLayers]);

  const goToStart = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) { try { a.pause(); } catch (_) {} }
    seek(0);
    const el = timelineScrollRef.current;
    if (el) el.scrollTo({ left: 0, behavior: "smooth" });
  }, [seek]);

  const goToEnd = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) { try { a.pause(); } catch (_) {} }
    seek(exportDuration || duration || 0);
    const el = timelineScrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [seek, exportDuration, duration]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onSeeked = () => {
      const p = pendingSeekRef.current;
      if (p != null) { pendingSeekRef.current = null; if (Math.abs(a.currentTime - p) > 0.02) { try { a.currentTime = p; } catch (_) {} } }
    };
    a.addEventListener("seeked", onSeeked);
    return () => a.removeEventListener("seeked", onSeeked);
  }, [audioUrl]);

// Scrubbing a *playing* WAV backward doesn't take — the seek fights live
  // playback and the release position is lost (MP3 settles fast enough to hide
  // this). So pause on grab, let the drag seek freely, then resume from the
  // release point once the pointer is up.
  const scrubResumeRef = useRef(false);
  const onScrubStart = useCallback(() => {
    const a = audioRef.current;
    scrubResumeRef.current = !!(a && !a.paused);
    if (a && !a.paused) { try { a.pause(); } catch (_) {} }
    // Pause audio layer clips
    for (const clipRefs of Object.values(audioLayerRefs.current)) {
      for (const clipEl of Object.values(clipRefs)) {
        if (!clipEl.paused) { try { clipEl.pause(); } catch (_) {} }
      }
    }
    // Silence any in-flight sound effects while scrubbing.
    for (const el of sfxAudioRefs.current.values()) { if (!el.paused) { try { el.pause(); } catch (_) {} } }
  }, []);
  const onScrubEnd = useCallback(() => {
    const a = audioRef.current;
    // Rebase crossing detection at the release position (no retro-fire on resume).
    if (a) sfxPrevRef.current = a.currentTime;
    if (a && scrubResumeRef.current) { scrubResumeRef.current = false; a.play().catch(() => {}); }
    // Resume audio layer clips
    for (const [layerId, clipRefs] of Object.entries(audioLayerRefs.current)) {
      const layer = audioLayers.find((l) => l.id === layerId);
      if (!layer || layer.muted) continue;
      for (const clip of layer.clips) {
        const clipEl = clipRefs[clip.id];
        if (!clipEl) continue;
        const clipTime = a.currentTime - clip.start;
        if (clipTime >= 0 && clipTime < clip.duration) {
          try { clipEl.currentTime = clipTime; clipEl.play().catch(() => {}); } catch (_) {}
        }
      }
    }
  }, [audioLayers]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); seek(time + (e.shiftKey ? 5 : 1)); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); seek(time - (e.shiftKey ? 5 : 1)); }
      else if (e.key === "Home") { e.preventDefault(); seek(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, time]);

  const active = clips.find((c) => time >= c.start && time < c.start + c.duration) || clips[clips.length - 1];
  const badClips = useMemo(
    () => new Set(clips.filter((c) => c.duration <= 0.0001).map((c) => c.name)),
    [clips]
  );
  const imageClips = useMemo(() => clips.filter((c) => !c.gap), [clips]);
  const imageCount = imageClips.length;
  const gapCount = clips.length - imageCount;
  const activeIndex = active && !active.gap ? imageClips.indexOf(active) + 1 : 0;

  const selectClip = useCallback((name) => {
    setSelectedCut(name);
    setCurrentType(transitionsByName[name] || "cut");
    setCurrentMotion(motionByName[name] || "dynamic");
    setCurrentFx(fxByName[name] || "none");
  }, [transitionsByName, motionByName, fxByName]);

  const pickType = useCallback((type) => {
    setCurrentType(type);
    if (selectedCut) setTransition(selectedCut, type);
  }, [selectedCut, setTransition]);

  const pickMotion = useCallback((type) => {
    setCurrentMotion(type);
    if (selectedCut) setMotion(selectedCut, type);
  }, [selectedCut, setMotion]);

  const pickFx = useCallback((id) => {
    setCurrentFx(id);
    if (selectedCut) setFx(selectedCut, id);
  }, [selectedCut, setFx]);

  const selectedClip = selectedCut && clips.find((c) => c.name === selectedCut);
  const selectedIndex = selectedClip ? clips.indexOf(selectedClip) : -1;
  const selectedImageNum = selectedClip && !selectedClip.gap ? imageClips.indexOf(selectedClip) + 1 : 0;

  return (
    <section className="editor">
      <div className="main">
        <div className="viewer">
          <div className="viewer__frame">
            <canvas ref={canvasRef} width={dims.width} height={dims.height} className="viewer__canvas" />
          </div>

          <div className="transport">
            <div className="transport__end" />
            <div className="transport__center">
              <span className="time__now">{tc(time)}</span>
              <button
                className="skip" onClick={goToStart}
                title="Go to start (0:00)" aria-label="Go to start"
              >⏮</button>
              <button className="play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? "❚❚" : "►"}
              </button>
              <button
                className="skip" onClick={goToEnd}
                title="Go to end" aria-label="Go to end"
              >⏭</button>
              <span className="time__total">{tc(exportDuration)}</span>
            </div>
            <div className="transport__end transport__end--right">
              <div className="history">
                <button
                  className="hbtn" onClick={undo} disabled={!canUndo}
                  title="Undo (Ctrl+Z)" aria-label="Undo"
                >↺</button>
                <button
                  className="hbtn" onClick={redo} disabled={!canRedo}
                  title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
                >↻</button>
              </div>
              <div className="history" style={{ marginLeft: 8 }}>
                <button
                  className="hbtn" onClick={() => setTimelineZoom(Math.max(0.5, timelineZoom - 0.5))} title="Zoom out"
                >−</button>
                <span style={{ padding: '0 8px', fontSize: 11, minWidth: 36, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Math.round(timelineZoom * 100)}%</span>
                <button
                  className="hbtn" onClick={() => setTimelineZoom(Math.min(4, timelineZoom + 0.5))} title="Zoom in"
                >+</button>
<button
  className="hbtn" onClick={() => setTimelineZoom(1)} title="Reset zoom"
>🔍</button>
              </div>
              {active && (
                <div className="nowclip">
                  <span className="nowclip__k">now</span>
                  {active.gap ? "empty gap" : `image ${activeIndex} / ${imageCount}`}
                </div>
              )}
            </div>
          </div>

          <audio ref={audioRef} src={audioUrl} hidden />
          <video
            ref={overlayVideoRef}
            src={overlayUrl}
            muted
            loop={overlayLoop}
            playsInline
            preload="auto"
            hidden
          />
          <img ref={watermarkImgRef} src={watermarkUrl} alt="" hidden />
        </div>

        {(() => {
          const shown = warnings.filter((w) => !dismissedWarn.has(w));
          if (!shown.length) return null;
          return (
            <div className="notes notes--compact">
              {shown.length > 1 && (
                <button
                  type="button" className="notes__clear"
                  onClick={() => setDismissedWarn(new Set(warnings))}
                >Dismiss all ({shown.length})</button>
              )}
              {shown.map((w) => (
                <div className="note note--dismissable" key={w}>
                  <span>{w}</span>
                  <button
                    type="button" className="note__x" aria-label="Dismiss"
                    onClick={() => setDismissedWarn((prev) => new Set(prev).add(w))}
                  >✕</button>
                </div>
              ))}
            </div>
          );
        })()}

        <Timeline
          clips={clips}
          imageEls={imageEls}
          duration={duration}
          time={time}
          peaks={peaks}
          activeName={active && active.name}
          badClips={badClips}
          transitionsByName={transitionsByName}
          motionByName={motionByName}
          selectedName={selectedCut}
          onSelect={selectClip}
          onSeek={seek}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          onOpen={openInspect}
          onAdd={askAdd}
          onResizeBoundary={resizeBoundary}
          trimEnd={trimEnd}
          onTrimChange={setTrimEnd}
          audioLayers={audioLayers}
          updateAudioClip={updateAudioClip}
          zoom={timelineZoom}
          scrollRef={timelineScrollRef}
          onAddAudioClip={(layerId, files, start) => addAudioClipToLayer && addAudioClipToLayer(layerId, files, start)}
          sfx={sfx}
          onSfxAdd={addSfx}
          onSfxMove={moveSfx}
          onSfxOpen={setSfxOpen}
        />
      </div>

      <aside className="side">
        <div className="panel export">
          <h2 className="panel__h">Export</h2>

          <div className="ctrl-row">
            <label className="ctrl">
              <span className="ctrl__label">Aspect</span>
              <span className="selectwrap">
                <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  <option value="16:9">16:9 — 1920×1080</option>
                  <option value="9:16">9:16 — 1080×1920</option>
                  <option value="auto">Auto — match</option>
                </select>
              </span>
            </label>
            <label className="ctrl">
              <span className="ctrl__label">FPS</span>
              <span className="selectwrap">
                <select value={fps} onChange={(e) => setFps(+e.target.value)}>
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </span>
            </label>
            <label className="ctrl">
              <span className="ctrl__label">Quality</span>
              <span className="selectwrap">
                <select value={renderQuality} onChange={(e) => {
                  const v = e.target.value;
                  setRenderQuality && setRenderQuality(v);
                  if (v === "4k") {
                    setWarn4k(true);
                    clearTimeout(warnTimer.current);
                    warnTimer.current = setTimeout(() => setWarn4k(false), 6500);
                  }
                }}>
                  <option value="full">Full — {dims.width}×{dims.height}</option>
                  <option value="720p">720p — faster</option>
                  <option value="4k">4K — UHD</option>
                </select>
              </span>
            </label>
          </div>

          <dl className="specs">
            <div className="spec"><dt>Resolution</dt><dd>{(renderDims || dims).width}×{(renderDims || dims).height}{renderQuality === "720p" ? " · faster" : renderQuality === "4k" ? " · UHD" : ""}</dd></div>
            <div className="spec"><dt>Images</dt><dd>{imageCount}</dd></div>
            <div className="spec spec--length">
              <dt>Length</dt>
              <dd>
                {tc(exportDuration)}
                {exportDuration < duration && (
                  <span className="spec__trim">trimmed from {tc(duration)}</span>
                )}
              </dd>
            </div>
          </dl>

          {gapCount > 0 && (
            <div className="note note--gap">
              {gapCount} empty {gapCount === 1 ? "gap" : "gaps"} render black — fill with the <b>+</b>.
            </div>
          )}

          {false && wcAvailable && serverAvailable && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, opacity: (busy || wcBusy) ? 0.5 : 1 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.85 }}>
                ⚡ Fast render <span className="cap-meta__name">{wcEnabled ? "· WebCodecs (GPU)" : "· ffmpeg (server)"}</span>
              </span>
              <button
                type="button"
                className={`cap-switch ${wcEnabled ? "is-on" : ""}`}
                onClick={() => setWcEnabled && setWcEnabled((v) => !v)}
                disabled={busy || wcBusy}
                aria-pressed={!!wcEnabled}
                aria-label="Fast GPU render (WebCodecs)"
                title="Render on the GPU via WebCodecs — faster for image-only projects (beta)"
              >
                <span className="cap-switch__box" />
              </button>
            </div>
          )}
          {!(busy || wcBusy) ? (
            (wcAvailable || serverAvailable) ? (
              <button
                className="render"
                onClick={wcAvailable ? onWebCodecsTest : onRender}
              >Render MP4</button>
            ) : (
              <div className="note">Rendering needs Chrome, Edge, or Safari 16.4+ (WebCodecs) in this browser.</div>
            )
          ) : (
            <>
              <button className="render render--busy" disabled>
                {wcBusy ? (wcPhase || "Rendering") : "Rendering"}… {Math.round((wcBusy ? wcProgress : progress) * 100)}%
              </button>
              <div className="progress"><i style={{ width: `${Math.round((wcBusy ? wcProgress : progress) * 100)}%` }} /></div>
              <div className="render-meta">
                <span>{clock(elapsed)} elapsed</span>
                {(wcBusy ? wcProgress : progress) > 0.03 && <span>~{clock(elapsed * (1 - (wcBusy ? wcProgress : progress)) / (wcBusy ? wcProgress : progress))} left</span>}
              </div>
              <button className="cancel" onClick={wcBusy ? onWebCodecsCancel : onCancel}>Cancel</button>
            </>
          )}
          {outUrl && <a className="download" href={outUrl} download="story.mp4">↓ Download MP4</a>}
          {error && <div className="note note--bad">{error}</div>}
        </div>

        <div className="panel transitions">
          <div className="transitions__head">
            <div className="transitions__titlerow">
              <span className="panel__h">Transitions</span>
              <button
                type="button"
                className={`cap-switch ${mixMode ? "is-on" : ""}`}
                onClick={() => setMixMode((v) => !v)}
                aria-pressed={mixMode}
                title="Randomly apply a set of transitions across all cuts"
              >
                <span className="cap-switch__box" />
                Random mix
              </button>
            </div>
            <span className="transitions__target">
              {selectedIndex > 0
                ? `Into image ${selectedImageNum || "—"} · ${tc(selectedClip.start)}`
                : selectedIndex === 0
                  ? "First image — no incoming transition"
                  : "Tap a ◇ cut above to set its transition"}
            </span>
          </div>

          <div className="transitions__chips">
            {TRANSITION_LIST.map((tr) => {
              const on = mixMode ? mixPicks.has(tr.id) : currentType === tr.id;
              const fav = favTransitions.has(tr.id);
              return (
                <span key={tr.id} className="trchip-wrap">
                  <button
                    type="button"
                    className={`trchip ${on ? "is-on" : ""}`}
                    onClick={() => (mixMode ? toggleMix(tr.id) : pickType(tr.id))}
                  >
                    <span className="trchip__icon">{tr.icon}</span>{tr.label}
                  </button>
                  <button
                    type="button"
                    className={`trchip-star ${fav ? "is-fav" : ""}`}
                    onClick={() => toggleFavTransition(tr.id)}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                    aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                </span>
              );
            })}
          </div>

          <label className="trdur">
            <span>Duration</span>
            <input
              type="range" min={MIN_TRANSITION_DURATION} max={MAX_TRANSITION_DURATION} step={0.05}
              value={transitionDuration}
              onChange={(e) => setTransitionDuration(+e.target.value)}
            />
            <span className="trdur__val">{transitionDuration.toFixed(2)}s</span>
          </label>

          {!mixMode ? (
            <button
              type="button" className="trall"
              onClick={() => applyTransitionAll(currentType, clips.map((c) => c.name))}
            >
              Apply “{transitionOf(currentType).label}” to all cuts
            </button>
          ) : (
            <div className="trmix-foot">
              <span className="trmix-count">
                {mixPicks.size ? `Picked ${mixPicks.size}` : "All transitions"}
              </span>
              <span className="trmix-btns">
                <button
                  type="button" className="trall trmix-apply"
                  onClick={() => applyTransitionMix(
                    mixPicks.size ? [...mixPicks] : TRANSITION_LIST.filter((t) => t.id !== "cut").map((t) => t.id),
                    clips.map((c) => c.name),
                  )}
                >
                  Apply random mix to video
                </button>
                <button
                  type="button" className="mbtn mbtn--danger trmix-clear"
                  onClick={() => {
                    setMixPicks(new Set());
                    applyTransitionAll("cut", clips.map((c) => c.name));
                  }}
                  title="Clear the applied random mix"
                >
                  Clear
                </button>
              </span>
            </div>
          )}

          <button
            type="button" className="trall trall--fav"
            disabled={!favTransitions.size}
            onClick={() => applyTransitionMix([...favTransitions], clips.map((c) => c.name))}
            title={favTransitions.size ? "Randomly apply your favorite transitions across all cuts" : "Star some transitions first"}
          >
            ★ Apply favorites randomly
          </button>
        </div>

        <div className="panel">
          <h2 className="panel__h">Motion — Ken Burns zoom</h2>
          <div className="mini-h">Click an image on the timeline to set its zoom. Set the depth, or apply to all here.</div>
          <label className="trdur">
            <span>Zoom depth</span>
            <input type="range" min={0.02} max={0.2} step={0.01} value={motionAmount}
              onChange={(e) => setMotionAmount(+e.target.value)} />
            <span className="trdur__val">{Math.round(motionAmount * 100)}%</span>
          </label>
          <div className="seg" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => applyMotionAll("zoomin", imageClips.map((c) => c.name))}>Zoom in all</button>
            <button type="button" onClick={() => applyMotionAll("zoomout", imageClips.map((c) => c.name))}>Zoom out all</button>
          </div>
          <div className="seg" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => applyMotionAlternate(imageClips.map((c) => c.name))}>Alternate</button>
            <button type="button" onClick={() => applyMotionAll("none", imageClips.map((c) => c.name))}>Clear</button>
          </div>
        </div>

        <div className="panel">
          <div className="transitions__titlerow">
            <h2 className="panel__h">Advanced Motion Effects</h2>
            <button
              type="button"
              className={`cap-switch ${mixMotionMode ? "is-on" : ""}`}
              onClick={() => setMixMotionMode((v) => !v)}
              aria-pressed={mixMotionMode}
              title="Randomly apply a set of motion effects across all images"
            >
              <span className="cap-switch__box" />
              Random mix
            </button>
          </div>
          <div className="mini-h" style={{ marginTop: 6 }}>
            {mixMotionMode
              ? "Pick the effects to mix, then apply them randomly across all images."
              : "Click an effect to pick it (applies to the selected clip), then use “Apply to all”."}
          </div>
          <div className="transitions__chips" style={{ marginTop: 8 }}>
            {MOTION_LIST.map((m) => {
              const on = mixMotionMode ? mixMotionPicks.has(m.id) : currentMotion === m.id;
              const fav = favMotion.has(m.id);
              return (
                <span key={m.id} className="trchip-wrap">
                  <button
                    type="button"
                    className={`trchip ${on ? "is-on" : ""}`}
                    onClick={() => (mixMotionMode ? toggleMixMotion(m.id) : pickMotion(m.id))}
                    title={m.label}
                  >
                    <span className="trchip__icon">{m.icon}</span>{m.label}
                  </button>
                  <button
                    type="button"
                    className={`trchip-star ${fav ? "is-fav" : ""}`}
                    onClick={() => toggleFavMotion(m.id)}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                    aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                </span>
              );
            })}
          </div>
          <label className="trdur" style={{ marginTop: 8 }}>
            <span>Intensity</span>
            <input type="range" min={0.02} max={0.3} step={0.01} value={motionAmount}
              onChange={(e) => setMotionAmount(+e.target.value)} />
            <span className="trdur__val">{Math.round(motionAmount * 100)}%</span>
          </label>
          {!mixMotionMode ? (
            <>
              <div className="seg" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => applyMotionAll(currentMotion, imageClips.map((c) => c.name))}
                >
                  Apply “{motionOf(currentMotion).label}” to all
                </button>
              </div>
              <div className="seg" style={{ marginTop: 6 }}>
                <button type="button" onClick={() => applyMotionAll("none", imageClips.map((c) => c.name))}>Clear all</button>
              </div>
            </>
          ) : (
            <div className="trmix-foot">
              <span className="trmix-count">
                {mixMotionPicks.size ? `Picked ${mixMotionPicks.size}` : "All effects"}
              </span>
              <span className="trmix-btns">
                <button
                  type="button" className="trall trmix-apply"
                  onClick={() => applyMotionMix(
                    mixMotionPicks.size ? [...mixMotionPicks] : MOTION_LIST.filter((m) => m.id !== "none").map((m) => m.id),
                    imageClips.map((c) => c.name),
                  )}
                >
                  Apply random mix to images
                </button>
                <button
                  type="button" className="mbtn mbtn--danger trmix-clear"
                  onClick={() => {
                    setMixMotionPicks(new Set());
                    applyMotionAll("none", imageClips.map((c) => c.name));
                  }}
                  title="Clear the applied random mix"
                >
                  Clear
                </button>
              </span>
            </div>
          )}

          <button
            type="button" className="trall trall--fav"
            disabled={!favMotion.size}
            onClick={() => applyMotionMix([...favMotion], imageClips.map((c) => c.name))}
            title={favMotion.size ? "Randomly apply your favorite motion effects across all images" : "Star some effects first"}
          >
            ★ Apply favorites randomly
          </button>
        </div>

        <div className="panel">
          <div className="transitions__titlerow">
            <h2 className="panel__h">Image Effects</h2>
            <button
              type="button"
              className={`cap-switch ${fxMixMode ? "is-on" : ""}`}
              onClick={() => setFxMixMode((v) => !v)}
              aria-pressed={fxMixMode}
              title="Randomly apply a set of image effects across all images"
            >
              <span className="cap-switch__box" />
              Random mix
            </button>
          </div>
          <div className="mini-h" style={{ marginTop: 6 }}>
            {fxMixMode
              ? "Pick the effects to mix, then apply them randomly across all images."
              : "Click an effect to pick it (applies to the selected clip), then use “Apply to all”."}
          </div>
          <div className="transitions__chips" style={{ marginTop: 8 }}>
            {FX_LIST.map((f) => {
              const on = fxMixMode ? fxMixPicks.has(f.id) : currentFx === f.id;
              const fav = favFx.has(f.id);
              return (
                <span key={f.id} className="trchip-wrap">
                  <button
                    type="button"
                    className={`trchip ${on ? "is-on" : ""}`}
                    onClick={() => (fxMixMode ? toggleFxMix(f.id) : pickFx(f.id))}
                    title={f.label}
                  >
                    <span className="trchip__icon">{f.icon}</span>{f.label}
                  </button>
                  <button
                    type="button"
                    className={`trchip-star ${fav ? "is-fav" : ""}`}
                    onClick={() => toggleFavFx(f.id)}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                    aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                </span>
              );
            })}
          </div>
          <label className="trdur" style={{ marginTop: 8 }}>
            <span>Intensity</span>
            <input type="range" min={0} max={1} step={0.05} value={fxAmount}
              onChange={(e) => setFxAmount(+e.target.value)} />
            <span className="trdur__val">{Math.round(fxAmount * 100)}%</span>
          </label>
          {!fxMixMode ? (
            <>
              <div className="seg" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => applyFxAll(currentFx, imageClips.map((c) => c.name))}
                >
                  Apply “{fxOf(currentFx).label}” to all
                </button>
              </div>
              <div className="seg" style={{ marginTop: 6 }}>
                <button type="button" onClick={() => applyFxAll("none", imageClips.map((c) => c.name))}>Clear all</button>
              </div>
            </>
          ) : (
            <div className="trmix-foot">
              <span className="trmix-count">
                {fxMixPicks.size ? `Picked ${fxMixPicks.size}` : "All effects"}
              </span>
              <span className="trmix-btns">
                <button
                  type="button" className="trall trmix-apply"
                  onClick={() => applyFxMix(
                    fxMixPicks.size ? [...fxMixPicks] : FX_LIST.filter((f) => f.id !== "none").map((f) => f.id),
                    imageClips.map((c) => c.name),
                  )}
                >
                  Apply random mix to images
                </button>
                <button
                  type="button" className="mbtn mbtn--danger trmix-clear"
                  onClick={() => {
                    setFxMixPicks(new Set());
                    applyFxAll("none", imageClips.map((c) => c.name));
                  }}
                  title="Clear the applied random mix"
                >
                  Clear
                </button>
              </span>
            </div>
          )}

          <button
            type="button" className="trall trall--fav"
            disabled={!favFx.size}
            onClick={() => applyFxMix([...favFx], imageClips.map((c) => c.name))}
            title={favFx.size ? "Randomly apply your favorite image effects across all images" : "Star some effects first"}
          >
            ★ Apply favorites randomly
          </button>
        </div>

        <div className="panel">
          <h2 className="panel__h">Scene fades</h2>
          <div className="mini-h">Fade the opening and ending (video &amp; audio).</div>
          <label className="trdur">
            <span>Fade in</span>
            <input type="range" min={0} max={2} step={0.1} value={fadeIn} onChange={(e) => setFadeIn(+e.target.value)} />
            <span className="trdur__val">{fadeIn > 0 ? `${fadeIn.toFixed(1)}s` : "off"}</span>
          </label>
          <label className="trdur">
            <span>Fade out</span>
            <input type="range" min={0} max={2} step={0.1} value={fadeOut} onChange={(e) => setFadeOut(+e.target.value)} />
            <span className="trdur__val">{fadeOut > 0 ? `${fadeOut.toFixed(1)}s` : "off"}</span>
          </label>
        </div>

        <div className="panel captions">
          <h2 className="panel__h">Captions</h2>
          {!(captionCues && captionCues.length) ? (
            <div className="cap-empty">
              <button type="button" className="cap-upload" onClick={() => capInputRef.current && capInputRef.current.click()}>
                <span className="cap-upload__i">⤒</span> Upload timestamped script
              </button>
              <p className="cap-hint">
                An <code>.srt</code>, <code>.vtt</code>, or timestamped <code>.txt</code> — inline
                markers like <code>(0:03)</code>, NoteGPT ranges, or <code>[0:03]</code> lines all
                work. Captions sync to the audio and burn into the MP4. Uploading a script also
                enables <b>Image↔narration sync</b>, which finds each line's real speech onset in
                the voiceover and snaps the matching image onto it — so images stay locked to what
                is actually spoken.
              </p>
              {captionError && <div className="note note--bad">{captionError}</div>}
            </div>
          ) : (
            <>
              <div className="cap-bar">
                <button
                  type="button"
                  className={`cap-switch ${captionsOn ? "is-on" : ""}`}
                  onClick={() => setCaptionsOn(!captionsOn)}
                  aria-pressed={captionsOn}
                >
                  <span className="cap-switch__box" />
                  {captionsOn ? "On" : "Off"}
                </button>
                <span className="cap-meta">
                  <span className="cap-meta__name">{captionName || "captions"}</span>
                  {captionCues.length} lines ·{" "}
                  <button type="button" className="cap-replace" onClick={() => capInputRef.current && capInputRef.current.click()}>replace</button>
                </span>
              </div>

              <div className="cap-bar" style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <button
                  type="button"
                  className={`cap-switch ${syncOn ? "is-on" : ""}`}
                  onClick={() => setSyncOn && setSyncOn((v) => !v)}
                  disabled={!!(syncStatus && syncStatus.decoding)}
                  aria-pressed={!!syncOn}
                  title="Find each line's real speech onset in the voiceover and snap the matching image onto it"
                >
                  <span className="cap-switch__box" />
                  Image↔narration sync
                </button>
                <span className="cap-meta">
                  <span className="cap-meta__name">
                    {syncStatus && syncStatus.decoding
                      ? "analysing voiceover…"
                      : syncOn
                        ? `${syncAligned || 0} image${syncAligned === 1 ? "" : "s"} moved to narration`
                        : "off — images keep filename timestamps"}
                  </span>
                </span>
              </div>
              {syncStatus && syncStatus.error && (
                <div className="note note--bad" style={{ marginTop: 8 }}>{syncStatus.error}</div>
              )}

              <div className="cap-body" aria-disabled={!captionsOn}>
                <div className="mini-h">Style</div>
                <div className="transitions__chips">
                  {CAPTION_STYLE_LIST.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      className={`trchip ${captionStyle === st.id ? "is-on" : ""}`}
                      onClick={() => setCaptionStyle(st.id)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="mini-h" style={{ marginTop: 12 }}>Entrance Animation</div>
                <div className="transitions__chips">
                  {CAPTION_ANIMATION_LIST.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`trchip ${captionAnimation === a.id ? "is-on" : ""}`}
                      onClick={() => setCaptionAnimation(a.id)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                <div className="mini-h" style={{ marginTop: 12 }}>Size</div>
                <div className="seg">
                  {[["sm", "Small"], ["md", "Medium"], ["lg", "Large"]].map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      className={captionFontScale == null && captionSize === id ? "is-on" : ""}
                      onClick={() => { setCaptionSize(id); setCaptionFontScale && setCaptionFontScale(null); }}
                    >{lbl}</button>
                  ))}
                </div>

                <div className="mini-h cap-row" style={{ marginTop: 12 }}>
                  <span>Font size (fine-tune)</span>
                  {captionFontScale != null && (
                    <button type="button" className="cap-replace" onClick={() => setCaptionFontScale && setCaptionFontScale(null)}>
                      Reset
                    </button>
                  )}
                </div>
                <label className="trdur">
                  <input
                    type="range" min={0.03} max={0.10} step={0.002}
                    value={captionFontScale != null ? captionFontScale : (CAPTION_SIZES[captionSize] || CAPTION_SIZES.md)}
                    onChange={(e) => setCaptionFontScale && setCaptionFontScale(+e.target.value)}
                  />
                  <span className="trdur__val">
                    {Math.round((captionFontScale != null ? captionFontScale : (CAPTION_SIZES[captionSize] || CAPTION_SIZES.md)) * 1000) / 10}%
                  </span>
                </label>

                <div className="mini-h cap-row" style={{ marginTop: 12 }}>
                  <span>Line spacing (2-line captions)</span>
                  {captionLineHeight != null && (
                    <button type="button" className="cap-replace" onClick={() => setCaptionLineHeight && setCaptionLineHeight(null)}>
                      Reset
                    </button>
                  )}
                </div>
                <label className="trdur">
                  <input
                    type="range" min={1.0} max={2.2} step={0.05}
                    value={captionLineHeight != null ? captionLineHeight : captionLineHeightDefault(captionStyle)}
                    onChange={(e) => setCaptionLineHeight && setCaptionLineHeight(+e.target.value)}
                  />
                  <span className="trdur__val">
                    {(captionLineHeight != null ? captionLineHeight : captionLineHeightDefault(captionStyle)).toFixed(2)}×
                  </span>
                </label>
              </div>
              {captionError && <div className="note note--bad">{captionError}</div>}
            </>
          )}
        </div>

        <div className="panel sound-effects">
          <h2 className="panel__h">Sound effects</h2>
          <div className="mini-h">
            Select a sound, then click the <b>FX</b> track to place it. Drag a marker
            to move it; click it to set volume or remove.
          </div>
          <div className="mini-h" style={{ marginTop: 12 }}>Master volume</div>
          <label className="trdur" style={{ marginTop: 0 }}>
            <span>Vol</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={sfxMaster}
              onChange={(e) => setSfxMaster && setSfxMaster(+e.target.value)}
            />
            <span className="trdur__val">{Math.round(sfxMaster * 100)}%</span>
          </label>
          <div className="mini-h" style={{ marginTop: 12 }}>Library</div>
          <div className="sfxlist">
            {SFX_LIB.map((s) => {
              const isOn = !!(selectedSound && selectedSound.url === s.file);
              return (
                <div key={s.id} className={`sfxrow${isOn ? " is-on" : ""}`}>
                  <button
                    type="button" className="sfxrow__play" title="Preview"
                    onClick={(e) => { e.stopPropagation(); previewSfx(s.file, 0.9 * sfxMaster); }}
                  >▶</button>
                  <button
                    type="button" className="sfxrow__name"
                    onClick={() => setSelectedSound && setSelectedSound({ name: s.label, url: s.file, src: { kind: "lib", file: s.file } })}
                  >{s.label}</button>
                </div>
              );
            })}
          </div>
          {sfxUploads.length > 0 && (
            <>
              <div className="mini-h" style={{ marginTop: 12 }}>Your uploads</div>
              <div className="sfxlist">
                {sfxUploads.map((u) => {
                  const isOn = !!(selectedSound && selectedSound.url === u.url);
                  return (
                    <div key={u.mediaId} className={`sfxrow${isOn ? " is-on" : ""}`}>
                      <button
                        type="button" className="sfxrow__play" title="Preview"
                        onClick={(e) => { e.stopPropagation(); previewSfx(u.url, 0.9 * sfxMaster); }}
                      >▶</button>
                      <button
                        type="button" className="sfxrow__name"
                        onClick={() => setSelectedSound && setSelectedSound({ name: u.label, url: u.url, src: { kind: "upload", mediaId: u.mediaId } })}
                      >{u.label}</button>
                      <button
                        type="button" className="sfxrow__del" title="Remove upload"
                        onClick={(e) => { e.stopPropagation(); removeSfxUpload && removeSfxUpload(u.mediaId); }}
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <button
            type="button" className="trall" style={{ marginTop: 12 }}
            onClick={() => sfxInputRef.current && sfxInputRef.current.click()}
          >⤒ Upload .mp3 / .wav</button>
          <input
            ref={sfxInputRef} type="file" accept="audio/*,.mp3,.wav" hidden
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = "";
              if (f && uploadSfx) uploadSfx(f);
            }}
          />
        </div>

        <div className="panel audio-layers">
          <h2 className="panel__h">Audio Layers</h2>
          <div className="mini-h">Add background music or additional voice tracks. Drag clips on the timeline to position them.</div>
          <input
            type="file" accept="audio/*" hidden
            ref={audioLayerInputRef}
            onChange={onPickAudioLayer}
          />
          <button
            type="button"
            className="trall"
            onClick={() => audioLayerInputRef.current && audioLayerInputRef.current.click()}
          >
            + Add Audio Layer
          </button>
          {audioLayers && audioLayers.length > 0 && (
            <div className="audio-layers-list" style={{ marginTop: 12 }}>
              {audioLayers.map((layer) => (
                <div key={layer.id} className="audio-layer-item" style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div className="tl__audio-label" style={{ flex: 1, fontSize: 12 }}>
                      {layer.name}
                      {layer.solo && <span className="tl__solo-badge" style={{ marginLeft: 4, padding: "1px 4px", background: "var(--accent)", color: "white", borderRadius: 3, fontSize: 9 }}>S</span>}
                    </div>
                    <label className="trdur" style={{ flex: 1, minWidth: 180, maxWidth: "none" }}>
                      <span style={{ fontSize: 11, marginRight: 8 }}>Vol</span>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={layer.volume}
                        onChange={(e) => updateAudioLayer && updateAudioLayer(layer.id, { volume: +e.target.value })}
                        style={{ flex: 1, minWidth: 100 }}
                      />
                      <span className="trdur__val" style={{ fontSize: 11, marginLeft: 6, minWidth: 36 }}>{Math.round(layer.volume * 100)}%</span>
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className={`cap-switch ${layer.muted ? "is-on" : ""}`}
                        onClick={() => updateAudioLayer && updateAudioLayer(layer.id, { muted: !layer.muted })}
                        title={layer.muted ? "Unmute" : "Mute"}
                        style={{ width: 32, height: 20 }}
                      >
                        <span className="cap-switch__box" />
                      </button>
                      <button
                        type="button"
                        className={`cap-switch ${layer.solo ? "is-on" : ""}`}
                        onClick={() => {
                          const newLayers = audioLayers.map((l) => l.id === layer.id ? { ...l, solo: !l.solo, muted: false } : { ...l, solo: false, muted: !l.solo });
                          setAudioLayers && setAudioLayers(newLayers);
                        }}
                        title={layer.solo ? "Unsolo" : "Solo"}
                        style={{ width: 32, height: 20 }}
                      >
                        <span className="cap-switch__box" />
                      </button>
                      <button
                        type="button"
                        className="mbtn mbtn--danger"
                        onClick={() => removeAudioLayer && removeAudioLayer(layer.id)}
                        title="Remove layer"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >✕</button>
                    </div>
                  </div>
                  {layer.clips && layer.clips.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {layer.clips.map((clip) => (
                        <div key={clip.id} className="audio-clip-item" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 8, background: "var(--bg2)", borderRadius: 4, marginBottom: 6, fontSize: 11, minWidth: 0 }}>
                          <span style={{ flex: "1 1 100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                            {clip.name} ({clip.duration.toFixed(1)}s)
                          </span>
                          <label className="trdur" style={{ flex: "1 1 180px", maxWidth: "none", minWidth: 180 }}>
                            <span style={{ marginRight: 8 }}>Vol</span>
                            <input
                              type="range" min={0} max={1} step={0.05}
                              value={clip.volume}
                              onChange={(e) => updateAudioClip && updateAudioClip(layer.id, clip.id, { volume: +e.target.value })}
                              style={{ flex: 1, minWidth: 100 }}
                            />
                            <span className="trdur__val" style={{ fontSize: 10, marginLeft: 6, minWidth: 36 }}>{Math.round(clip.volume * 100)}%</span>
                          </label>
                          <label className="trdur" style={{ flex: "1 1 180px", maxWidth: "none", minWidth: 180 }}>
                            <span style={{ marginRight: 8 }}>Start</span>
                            <input
                              type="range" min={0} max={duration} step={0.1}
                              value={clip.start}
                              onChange={(e) => updateAudioClip && updateAudioClip(layer.id, clip.id, { start: +e.target.value })}
                              style={{ flex: 1, minWidth: 100 }}
                            />
                            <input
                              type="number" min={0} max={Math.round(duration)} step={0.1}
                              value={+clip.start.toFixed(1)}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isNaN(v)) {
                                  updateAudioClip && updateAudioClip(layer.id, clip.id, { start: Math.min(duration, Math.max(0, v)) });
                                }
                              }}
                              title="Type the exact start time in seconds"
                              style={{
                                width: 56, padding: "2px 4px", fontSize: 10,
                                fontFamily: "var(--font-mono)", textAlign: "right",
                                color: "var(--text)", background: "var(--elev)",
                                border: "1px solid var(--line)", borderRadius: 4,
                              }}
                            />
                            <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>s</span>
                          </label>
                          <button
                            type="button"
                            className="mbtn mbtn--danger"
                            onClick={() => removeAudioClip && removeAudioClip(layer.id, clip.id)}
                            title="Remove clip"
                            style={{ padding: "4px 8px", fontSize: 10 }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel video-overlay">
          <h2 className="panel__h">Video Overlay</h2>
          <div className="mini-h">Add a texture overlay (e.g., old film, light leaks, grain) that plays over the entire video.</div>
          <input
            type="file" accept="video/*" hidden
            ref={overlayInputRef}
            onChange={(e) => onOverlay(e.target.files)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="trall"
              onClick={() => overlayInputRef.current && overlayInputRef.current.click()}
              disabled={overlayEnabled && !overlayUrl}
            >
              {overlayEnabled ? "Replace Overlay" : "+ Add Overlay Video"}
            </button>
            {overlayEnabled && (
              <button
                type="button"
                className="mbtn mbtn--danger"
                onClick={() => {
                  setOverlayEnabled(false);
                  setOverlayFile(null);
                  setOverlayUrl(null);
                  setOverlayDuration(0);
                }}
                style={{ padding: "6px 12px" }}
              >
                Remove
              </button>
            )}
          </div>
          {overlayEnabled && overlayUrl && (
            <div style={{ marginTop: 12 }}>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Opacity</span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(+e.target.value)}
                />
                <span className="trdur__val" style={{ fontSize: 11 }}>{Math.round(overlayOpacity * 100)}%</span>
              </label>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Blend Mode</span>
                <select
                  value={overlayBlendMode}
                  onChange={(e) => setOverlayBlendMode(e.target.value)}
                  style={{ flex: 1, minWidth: 140, marginLeft: 8, padding: "4px 8px", fontSize: 11 }}
                >
                  <option value="overlay">Overlay</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="soft-light">Soft Light</option>
                  <option value="hard-light">Hard Light</option>
                  <option value="difference">Difference</option>
                  <option value="exclusion">Exclusion</option>
                </select>
              </label>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Loop</span>
                <input
                  type="checkbox"
                  checked={overlayLoop}
                  onChange={(e) => setOverlayLoop(e.target.checked)}
                  style={{ marginLeft: 8, width: 16, height: 16, accentColor: "var(--accent)" }}
                />
              </label>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                Duration: {overlayDuration.toFixed(1)}s {overlayLoop ? "(loops)" : "(plays once)"}
              </div>
            </div>
          )}
        </div>

        <div className="panel video-overlay">
          <h2 className="panel__h">Image Overlay</h2>
          <div className="mini-h">Overlay a logo or transparent PNG anywhere on the video — resize it and slide it around freely.</div>
          <input
            type="file" accept="image/*" hidden
            ref={watermarkInputRef}
            onChange={(e) => onWatermark(e.target.files)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="trall"
              onClick={() => watermarkInputRef.current && watermarkInputRef.current.click()}
              disabled={watermarkEnabled && !watermarkUrl}
            >
              {watermarkEnabled ? "Replace Image" : "+ Add Image Overlay"}
            </button>
            {watermarkEnabled && (
              <button
                type="button"
                className="mbtn mbtn--danger"
                onClick={() => {
                  setWatermarkEnabled(false);
                  setWatermarkFile(null);
                  setWatermarkUrl(null);
                }}
                style={{ padding: "6px 12px" }}
              >
                Remove
              </button>
            )}
          </div>
          {watermarkEnabled && watermarkUrl && (
            <div style={{ marginTop: 12 }}>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Size</span>
                <input
                  type="range" min={0.02} max={0.6} step={0.01}
                  value={watermarkSize}
                  onChange={(e) => setWatermarkSize(+e.target.value)}
                />
                <span className="trdur__val" style={{ fontSize: 11 }}>{Math.round(watermarkSize * 100)}%</span>
              </label>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>X position</span>
                <input
                  type="range" min={0} max={1} step={0.005}
                  value={watermarkX}
                  onChange={(e) => setWatermarkX(+e.target.value)}
                />
                <span className="trdur__val" style={{ fontSize: 11 }}>{Math.round(watermarkX * 100)}</span>
              </label>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Y position</span>
                <input
                  type="range" min={0} max={1} step={0.005}
                  value={watermarkY}
                  onChange={(e) => setWatermarkY(+e.target.value)}
                />
                <span className="trdur__val" style={{ fontSize: 11 }}>{Math.round(watermarkY * 100)}</span>
              </label>
              <label className="trdur" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11 }}>Opacity</span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(+e.target.value)}
                />
                <span className="trdur__val" style={{ fontSize: 11 }}>{Math.round(watermarkOpacity * 100)}%</span>
              </label>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                The image stays inside the frame; X/Y position its center.
              </div>
            </div>
          )}

        </div>
        {/* --- Text overlays --- */}
        <div className="panel video-overlay">
          <h2 className="panel__h">Text overlays</h2>
          <div className="panel__body">
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
              Timed titles, labels, or call-outs layered over the video.
            </div>
            <button type="button" className="trall" onClick={addTextOverlay}>+ Add text overlay</button>

            {Array.isArray(textOverlays) && textOverlays.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                {textOverlays.map((o) => (
                  <div key={o.id} className="text-overlay" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                    <div className="trdur" style={{ marginBottom: 6 }}>
                      <span style={{ width: 60 }}>Text</span>
                      <input
                        type="text" value={o.text}
                        placeholder="Overlay text"
                        onChange={(e) => updateTextOverlay(o.id, { text: e.target.value })}
                      />
                      <button type="button" onClick={() => removeTextOverlay(o.id)} aria-label="Remove text overlay"
                        title="Remove"
                        style={{ marginLeft: -4, border: 0, background: "none", cursor: "pointer", fontFamily: "system-ui", fontSize: 14, color: "var(--muted)", lineHeight: 1, padding: 0, alignSelf: "center", flexShrink: 0 }}>⊗</button>
                    </div>

                    <div className="trdur">
                      <span>Start</span>
                      <input type="text" value={o.start}
                        placeholder="Seconds"
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v)) updateTextOverlay(o.id, { start: Math.min(Math.max(0, v), o.end) });
                        }} />
                      <b className="trdur__val">s</b>
                    </div>
                    <div className="trdur">
                      <span>End</span>
                      <input type="text" value={o.end}
                        placeholder="Seconds"
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v)) updateTextOverlay(o.id, { end: Math.max(v, o.start) });
                        }} />
                      <b className="trdur__val">s</b>
                    </div>
                    <div className="trdur">
                      <span>X</span>
                      <input type="range" min={0} max={1} step={0.01} value={o.x}
                        onChange={(e) => updateTextOverlay(o.id, { x: +e.target.value })} />
                      <b className="trdur__val">{Math.round(o.x * 100)}%</b>
                    </div>
                    <div className="trdur">
                      <span>Y</span>
                      <input type="range" min={0} max={1} step={0.01} value={o.y}
                        onChange={(e) => updateTextOverlay(o.id, { y: +e.target.value })} />
                      <b className="trdur__val">{Math.round(o.y * 100)}%</b>
                    </div>
                    <div className="trdur">
                      <span>Size</span>
                      <input type="range" min={0.005} max={0.25} step={0.005} value={o.size}
                        onChange={(e) => updateTextOverlay(o.id, { size: +e.target.value })} />
                      <b className="trdur__val">{Math.round(o.size * 100)}%</b>
                    </div>
                    <div className="trdur">
                      <span>Opacity</span>
                      <input type="range" min={0} max={1} step={0.05} value={o.opacity}
                        onChange={(e) => updateTextOverlay(o.id, { opacity: +e.target.value })} />
                      <b className="trdur__val">{Math.round(o.opacity * 100)}%</b>
                    </div>
                    <div className="trdur">
                      <span>Color</span>
                      <input type="color" value={o.color}
                        onChange={(e) => updateTextOverlay(o.id, { color: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                No text overlays yet.
              </div>
            )}
          </div>
        </div>

      </aside>

      <input
        ref={fileInputRef} type="file" accept={coarse ? undefined : "image/*,video/*"} hidden
        onChange={onPickFile}
      />
      <input
        ref={replaceInputRef} type="file" accept={coarse ? undefined : "image/*,video/*"} hidden
        onChange={onPickReplacement}
      />
      <input
        ref={capInputRef} type="file" accept=".srt,.vtt,.txt,text/plain" hidden
        onChange={onPickCaption}
      />

      {inspect && (() => {
        const insClip = clips.find((c) => c.name === inspect);
        const el = imageEls[inspect];
        const num = insClip ? imageClips.indexOf(insClip) + 1 : 0;
        const curUrl = pendUrl || (el && el.url);
        const pendIsVid = !!(pendFile && pendFile.type && pendFile.type.startsWith("video/"));
        const isVid = !!(el && el.isVideo) && !pendUrl;
        const vinfo = videoInfoByName[inspect] || {};
        const vol = volumeByName[inspect] == null ? 0.5 : volumeByName[inspect];
        const inPt = trimByName[inspect] || 0;
        const kind = isVid ? "Video" : "Image";
        const slotDur = (insClip && insClip.duration) || 0;
        const vdur = vinfo.duration || 0;
        const longer = !!(vdur && insClip && vdur > slotDur + 0.05);
        const shorter = !!(vdur && insClip && vdur < slotDur - 0.05);
        const diff = longer || shorter;
        // Default by length: longer clip trims (1x), shorter fills the slot (fit/slow).
        const fitMode = fitByName[inspect] || (longer ? "trim" : "fit");
        const speed = (diff && slotDur > 0) ? (vdur / slotDur) : 1;
        return (
          <div className="modal" role="dialog" aria-modal="true" onClick={closeInspect}>
            <div className="modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="modal__head">
                <span className="modal__title">
                  {num ? `${kind} ${num} of ${imageCount}` : kind}
                  {insClip && <span className="modal__at"> · {tc(insClip.start)}</span>}
                </span>
                <button className="modal__x" onClick={closeInspect} aria-label="Close">✕</button>
              </div>

              <div className="modal__stage">
                {pendUrl ? (
                  // A chosen-but-not-applied replacement: a video needs a <video>,
                  // not an <img> (an <img> with a video URL just shows black).
                  pendIsVid
                    ? <video src={pendUrl} className="modal__stagevid" controls muted playsInline preload="metadata" />
                    : <img src={pendUrl} alt="" />
                ) : isVid && vinfo.url ? (
                  <video
                    ref={modalVideoRef} src={vinfo.url} className="modal__stagevid"
                    controls muted playsInline preload="metadata"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      try { v.currentTime = inPt; } catch { /* ignore */ }
                      v.playbackRate = (diff && fitMode === "fit") ? Math.min(16, Math.max(0.0625, speed)) : 1;
                    }}
                  />
                ) : (curUrl && <img src={curUrl} alt="" />)}
                {pendUrl && <span className="modal__flag">New — not applied yet</span>}
              </div>
              <div className="modal__file">
                {pendFile ? pendFile.name : (el && el.fileName) || ""}
              </div>

              {insClip && !insClip.gap && (
                <div className="modal__motion">
                  <span className="modal__motion-label">Motion (Ken Burns zoom)</span>
                  <div className="seg">
                    {[["none", "None"], ["zoomin", "Zoom in"], ["zoomout", "Zoom out"]].map(([id, lbl]) => (
                      <button
                        key={id}
                        type="button"
                        className={((motionByName && motionByName[inspect]) || "none") === id ? "is-on" : ""}
                        onClick={() => setMotion && setMotion(inspect, id)}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
              )}

              {insClip && !insClip.gap && isVid && (
                <div className="modal__vid">
                  {diff && (
                    <div className="modal__fit">
                      <span className="modal__motion-label">
                        {longer ? "Clip is longer than its slot" : "Clip is shorter than its slot"} · {vinfo.duration.toFixed(1)}s clip, {insClip.duration.toFixed(1)}s slot
                      </span>
                      <div className="seg">
                        <button
                          type="button" className={fitMode === "fit" ? "is-on" : ""}
                          onClick={() => setFit && setFit(inspect, "fit")}
                        >Fit to slot</button>
                        <button
                          type="button" className={fitMode === "trim" ? "is-on" : ""}
                          onClick={() => setFit && setFit(inspect, "trim")}
                        >Trim (1×)</button>
                      </div>
                      {fitMode === "fit"
                        ? <span className="modal__hint">{longer
                            ? `Whole clip fast-forwarded at ${speed.toFixed(1)}× to fit the slot.`
                            : `Whole clip slowed to ${speed.toFixed(2)}× to fill the slot.`}</span>
                        : <span className="modal__hint">Plays at 1× — set a start point below;{longer ? " the rest is cut off." : " the last frame then holds to fill the slot."}</span>}
                    </div>
                  )}
                  {(!diff || fitMode === "trim") && (() => {
                    const dur = vinfo.duration || 0;
                    const remain = Math.max(0, dur - inPt);        // footage left from the start point
                    const playLen = Math.min(insClip.duration, remain); // real-time footage shown
                    const holdFor = Math.max(0, insClip.duration - remain); // seconds the last frame holds
                    return (
                      <div className="modal__trim">
                        <span className="modal__motion-label">Trim — drag the handle to set where the clip starts</span>
                        {/* Video-editor style trim bar: the fill shows the part that plays;
                            dragging the handle scrubs the preview above and sets the start. */}
                        <div className="trimbar">
                          <div
                            className="trimbar__fill"
                            style={{ left: `${dur ? (inPt / dur) * 100 : 0}%`, width: `${dur ? (playLen / dur) * 100 : 0}%` }}
                          />
                          <input
                            className="trimbar__range"
                            type="range" min={0} max={Math.max(0.1, dur)} step={0.05}
                            value={Math.min(inPt, Math.max(0.1, dur))}
                            onChange={(e) => {
                              const val = +e.target.value;
                              if (setTrim) setTrim(inspect, val);
                              if (modalVideoRef.current) { try { modalVideoRef.current.currentTime = val; } catch { /* ignore */ } }
                            }}
                          />
                        </div>
                        <span className="modal__hint">
                          Starts at {inPt.toFixed(1)}s of {dur.toFixed(1)}s · plays {playLen.toFixed(1)}s in a {insClip.duration.toFixed(1)}s slot
                        </span>
                        {holdFor > 0.05 && (
                          <span className="modal__hint modal__hint--warn">
                            Only {remain.toFixed(1)}s of footage left — the last frame holds for {holdFor.toFixed(1)}s to fill the slot.
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="modal__vol">
                    <span className="modal__motion-label">Clip audio volume</span>
                    <div className="modal__slider">
                      <input
                        type="range" min={0} max={1} step={0.05} value={vol}
                        onChange={(e) => setVolume && setVolume(inspect, +e.target.value)}
                      />
                      <span className="trdur__val">{Math.round(vol * 100)}%</span>
                    </div>
                    <span className="modal__hint">Plays under the voiceover. 0% = silent.</span>
                  </div>
                </div>
              )}

              {!pendUrl ? (
                <div className="modal__actions">
                  <button className="mbtn mbtn--primary" onClick={() => replaceInputRef.current && replaceInputRef.current.click()}>
                    Replace {isVid ? "video" : "image"}
                  </button>
                  <button className="mbtn mbtn--danger" onClick={removeInspected}>Remove from timeline</button>
                </div>
              ) : (
                <div className="modal__actions">
                  <button className="mbtn mbtn--primary" onClick={applyReplacement}>Apply replacement</button>
                  <button className="mbtn" onClick={() => replaceInputRef.current && replaceInputRef.current.click()}>Choose different</button>
                  <button className="mbtn mbtn--ghost" onClick={clearPend}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {warn4k && (
        <div className="donetoast donetoast--warn" role="status" aria-live="polite" onClick={() => setWarn4k(false)}>
          <span className="donetoast__ok" aria-hidden="true">!</span>
          <span>4K render is heavy (~4× the pixels of 1080p) — expect much longer encodes and higher memory use; iOS/Safari long-render limits still apply</span>
        </div>
      )}
      {(() => {
        if (sfxOpen == null) return null;
        const s = sfx.find((x) => x.id === sfxOpen);
        if (!s) return null;
        return (
          <div className="modal" role="dialog" aria-modal="true" onClick={() => setSfxOpen && setSfxOpen(null)}>
            <div className="modal__card" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal__head">
                <span className="modal__title">
                  {s.name} <span className="modal__at">· {clock(s.at)}</span>
                </span>
                <button className="modal__x" onClick={() => setSfxOpen && setSfxOpen(null)} aria-label="Close">✕</button>
              </div>
              <div className="modal__vol">
                <span className="modal__motion-label">Volume</span>
                <div className="modal__slider">
                  <input
                    type="range" min={0} max={1} step={0.05} value={s.volume}
                    onChange={(e) => setSfxVolume && setSfxVolume(s.id, +e.target.value)}
                  />
                  <span className="trdur__val">{Math.round(s.volume * 100)}%</span>
                </div>
              </div>
              <div className="modal__actions" style={{ marginTop: 14 }}>
                <button
                  className="mbtn mbtn--danger"
                  onClick={() => { removeSfx && removeSfx(s.id); setSfxOpen && setSfxOpen(null); }}
                >Remove</button>
                <button className="mbtn" onClick={() => setSfxOpen && setSfxOpen(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
