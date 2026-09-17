"use client";
import { useCallback, useRef, useState } from "react";
import { transitionOf } from "../lib/transitions";

function label(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Filename without its extension, for the clip caption.
function stem(name) {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function Waveform({ peaks, style }) {
  if (!peaks || !peaks.length) return <div className="wave wave--empty" style={style} />;
  const n = peaks.length;
  return (
    <svg className="wave" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true" style={style}>
      {peaks.map((p, i) => {
        const h = Math.max(1.5, p * 92);
        return <rect key={i} x={i + 0.12} y={(100 - h) / 2} width={0.76} height={h} rx={0.3} />;
      })}
    </svg>
  );
}

// Combine peaks from multiple clips into a single waveform for the layer background
function combinePeaks(clips, duration) {
  if (!clips || !clips.length) return [];
  const buckets = 480;
  const combined = new Array(buckets).fill(0);
  const bucketDuration = duration / buckets;
  
  for (const clip of clips) {
    if (!clip.peaks || !clip.peaks.length) continue;
    const clipStartBucket = Math.floor(clip.start / bucketDuration);
    const clipBucketDuration = clip.duration / clip.peaks.length;
    
    for (let i = 0; i < clip.peaks.length; i++) {
      const time = clip.start + i * clipBucketDuration;
      const bucket = Math.floor(time / bucketDuration);
      if (bucket >= 0 && bucket < buckets) {
        combined[bucket] = Math.max(combined[bucket], clip.peaks[i] * clip.volume);
      }
    }
  }
  return combined;
}

// The signature element: a scrubbable track with a fixed label gutter. Clips,
 // waveform, playhead and click-to-seek all share the track's coordinate space.
 export default function Timeline({
   clips, imageEls, duration, time, peaks, activeName, badClips,
   transitionsByName, motionByName, selectedName, onSelect,
   onSeek, onScrubStart, onScrubEnd, onOpen, onAdd, onResizeBoundary,
   trimEnd, onTrimChange,
audioLayers,
    updateAudioClip,
    zoom = 1,
    scrollRef,
    onAddAudioClip,
    sfx = [], onSfxAdd, onSfxMove, onSfxOpen,
  }) {
   const trackRef = useRef(null);
   const downRef = useRef(null); // pointer-down position, to tell a clip tap from a drag

const [selectedAudioClip, setSelectedAudioClip] = useState(null); // { layerId, clipId }
  const [selectedAudioLayer, setSelectedAudioLayer] = useState(null); // layerId
  const [addHover, setAddHover] = useState(null); // { layerId, t } while hovering an audio lane

  // Convert a pointer x over the track into a timeline time (used by the
  // hover "+" drop so the uploaded sound effect lands where the pointer is).
  const laneXToTime = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el || !duration) return 0;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return (x / r.width) * duration;
  }, [duration]);

  // Click empty FX-lane space to drop the selected sound at the pointer.
  const onFxLaneDown = useCallback((e) => {
    if (e.target !== e.currentTarget || !onSfxAdd) return;
    onSfxAdd(+laneXToTime(e.clientX).toFixed(3));
  }, [onSfxAdd, laneXToTime]);

  // An FX marker opens its edit popover on a clean tap; dragging it (>4px) moves
  // the sound along the lane instead.
  const onSfxMarkerDown = useCallback((e, id) => {
    e.stopPropagation();
    const origin = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) > 4) moved = true;
      if (moved && onSfxMove) onSfxMove(id, +laneXToTime(ev.clientX).toFixed(3));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved && onSfxOpen) onSfxOpen(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [laneXToTime, onSfxMove, onSfxOpen]);

  // Scrub the playhead. Reference the track's box for x/width; the ruler and
  // audio lane are horizontally aligned with it, so this works for all three.
  const seekAt = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    onSeek((x / r.width) * duration);
  }, [duration, onSeek]);

  const onScrubDown = useCallback((e) => {
    if (onScrubStart) onScrubStart();
    seekAt(e.clientX);
    const move = (ev) => seekAt(ev.clientX);
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      seekAt(ev.clientX); // make sure the final release position is applied
      if (onScrubEnd) onScrubEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [seekAt, onScrubStart, onScrubEnd]);

  const MIN_TRIM = 1;      // never allow a zero-length export
  const SNAP_PX = 8;       // snap to a clip boundary within this many pixels

  // Audio clip trim drag handlers
  const onAudioClipTrimLeftDown = useCallback((e, layerId, clipId) => {
    e.stopPropagation();
    if (onScrubStart) onScrubStart();
    const trackEl = trackRef.current;
    if (!trackEl || !duration || !updateAudioClip) return;
    const layer = audioLayers.find((l) => l.id === layerId);
    const clip = layer?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const startX = e.clientX;
    const clipStart = clip.start;
    const clipDur = clip.duration;
    const move = (ev) => {
      const r = trackEl.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dSecs = (dx / r.width) * duration;
      const newStart = Math.max(0, Math.min(clipStart + clipDur - 0.1, clipStart + dSecs));
      const newDur = clipDur - (newStart - clipStart);
      updateAudioClip(layerId, clipId, { start: newStart, duration: newDur });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (onScrubEnd) onScrubEnd(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [duration, audioLayers, updateAudioClip, onScrubStart, onScrubEnd]);

  const onAudioClipTrimRightDown = useCallback((e, layerId, clipId) => {
    e.stopPropagation();
    if (onScrubStart) onScrubStart();
    const trackEl = trackRef.current;
    if (!trackEl || !duration || !updateAudioClip) return;
    const layer = audioLayers.find((l) => l.id === layerId);
    const clip = layer?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const startX = e.clientX;
    const clipDur = clip.duration;
    const move = (ev) => {
      const r = trackEl.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dSecs = (dx / r.width) * duration;
      const newDur = Math.max(0.1, clipDur + dSecs);
      updateAudioClip(layerId, clipId, { duration: newDur });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (onScrubEnd) onScrubEnd(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [duration, audioLayers, updateAudioClip, onScrubStart, onScrubEnd]);

  const trimAt = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el || !duration || !onTrimChange) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    let secs = (x / r.width) * duration;

    // Snap to the nearest clip start/end boundary when the pointer is close.
    const snapSecs = (SNAP_PX / r.width) * duration;
    let best = null, bestD = snapSecs;
    for (const c of clips) {
      for (const edge of [c.start, c.start + c.duration]) {
        const d = Math.abs(edge - secs);
        if (d <= bestD) { bestD = d; best = edge; }
      }
    }
    if (best != null) secs = best;

    secs = Math.min(Math.max(secs, MIN_TRIM), duration);
    onTrimChange(+secs.toFixed(3));
  }, [duration, clips, onTrimChange]);

  const onTrimDown = useCallback((e) => {
    e.stopPropagation();
    trimAt(e.clientX);
    const move = (ev) => trimAt(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [trimAt]);

  const MIN_CLIP = 0.3; // never let a clip collapse below this many seconds
  const [drag, setDrag] = useState(null); // { index, sec } during a right-edge resize

  // Map a pointer x to the clamped boundary between clip i and clip i+1.
  const boundaryAt = useCallback((clientX, i) => {
    const el = trackRef.current;
    if (!el || !duration) return null;
    const a = clips[i], b = clips[i + 1];
    if (!a || !b) return null;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    const secs = (x / r.width) * duration;
    const lo = a.start + MIN_CLIP;
    const hi = (b.start + b.duration) - MIN_CLIP;
    return Math.min(Math.max(secs, lo), Math.max(lo, hi));
  }, [duration, clips]);

  const onResizeDown = useCallback((e, i) => {
    e.stopPropagation();
    setDrag({ index: i, sec: clips[i + 1].start });
    const move = (ev) => {
      const s = boundaryAt(ev.clientX, i);
      if (s != null) setDrag({ index: i, sec: s });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const s = boundaryAt(ev.clientX, i);
      setDrag(null);
      // Only commit a real change, so a plain click on the grip adds no history.
      if (s != null && onResizeBoundary && Math.abs(s - clips[i + 1].start) > 0.001) {
        onResizeBoundary(clips[i + 1].name, s);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [boundaryAt, clips, onResizeBoundary]);

  // Audio clip drag handler
  const onAudioClipDragDown = useCallback((e, layerId, clipId) => {
    e.stopPropagation();
    if (onScrubStart) onScrubStart();
    const trackEl = trackRef.current;
    if (!trackEl || !duration || !updateAudioClip) return;
    
    const layer = audioLayers.find((l) => l.id === layerId);
    const clip = layer?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    
    const startX = e.clientX;
    const clipStart = clip.start;
    
    const move = (ev) => {
      const r = trackEl.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dSecs = (dx / r.width) * duration;
      const newStart = Math.max(0, Math.min(duration - clip.duration, clipStart + dSecs));
      updateAudioClip(layerId, clipId, { start: newStart });
    };
    
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (onScrubEnd) onScrubEnd();
    };
    
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [duration, audioLayers, updateAudioClip, onScrubStart, onScrubEnd]);

  // Audio clip resize handler (right edge)
  const onAudioClipResizeDown = useCallback((e, layerId, clipId) => {
    e.stopPropagation();
    if (onScrubStart) onScrubStart();
    const trackEl = trackRef.current;
    if (!trackEl || !duration || !updateAudioClip) return;
    
    const layer = audioLayers.find((l) => l.id === layerId);
    const clip = layer?.clips.find((c) => c.id === clipId);
    if (!clip) return;
    
    const startX = e.clientX;
    const clipDuration = clip.duration;
    
    const move = (ev) => {
      const r = trackEl.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dSecs = (dx / r.width) * duration;
      const newDuration = Math.max(0.1, clipDuration + dSecs);
      updateAudioClip(layerId, clipId, { duration: newDuration });
    };
    
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (onScrubEnd) onScrubEnd();
    };
    
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [duration, audioLayers, updateAudioClip, onScrubStart, onScrubEnd]);

  // A clip opens the inspector only on a clean tap, not a drag/scroll.
  const onClipClick = useCallback((name, e) => {
    const d = downRef.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && onOpen) onOpen(name);
  }, [onOpen]);

  const step = duration > 180 ? 30 : duration > 90 ? 15 : duration > 30 ? 10 : 5;
  const ticks = [];
  for (let t = 0; t <= duration + 0.001; t += step) ticks.push(Math.round(t));

  // Percent of the track. The row itself grows with zoom via --tl-zoom, so the
  // full duration always fits and stays reachable by scroll — plain percentages
  // keep the ruler, clips, waveform and playhead mutually aligned at any zoom.
  const pctZoom = (v) => `${(v / duration) * 100}%`;
  const stop = (e) => e.stopPropagation();

  // Give each clip a readable minimum: when the timeline is dense, widen the
  // track past the container so it scrolls horizontally instead of crushing
  // clips into slivers. Percentages resolve against this wider track, so the
  // ruler, clips, waveform and playhead all stay aligned.
  const rowMin = clips.length ? 30 + clips.length * 72 : 0;

  const trimPos = trimEnd > 0 && trimEnd < duration ? trimEnd : duration;
  const trimmed = trimPos < duration;

  return (
    <div className="tl" style={{ "--tl-min": `${rowMin}px`, "--tl-zoom": zoom }} ref={scrollRef}>
      <div className="tl__row tl__row--ruler">
        <div className="tl__gutter" aria-hidden="true" />
        <div className="tl__ruler tl__scrub" onPointerDown={onScrubDown} title="Drag to move the playhead">
          {ticks.map((t) => (
            <span className="tl__tick" key={t} style={{ left: pctZoom(t) }}>
              <i className="tl__tickline" />
              {label(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="tl__row tl__row--cuts">
        <div className="tl__gutter" aria-hidden="true" />
        <div className="tl__cuts">
          {clips.map((c, i) => {
            if (i === 0) return null;
            const tr = transitionOf(transitionsByName && transitionsByName[c.name]);
            const cls = ["cut"];
            if (selectedName === c.name) cls.push("is-sel");
            if (tr.xfade) cls.push("is-on");
            return (
              <button
                key={c.name}
                type="button"
                className={cls.join(" ")}
                style={{ left: pctZoom(c.start) }}
                title={`Transition: ${tr.label} — click to change`}
                onPointerDown={stop}
                onClick={() => onSelect && onSelect(c.name)}
              >
                {tr.icon}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tl__row">
        <div className="tl__gutter">
          <span className="tl__tag">V</span>
          <span className="tl__tag tl__tag--audio">A</span>
          <span className="tl__tag tl__tag--fx">FX</span>
        </div>

        <div className="tl__track" ref={trackRef}>
          <div className="tl__lane tl__lane--video">
            {clips.map((c, i) => {
              let cStart = c.start, cDur = c.duration;
              if (drag) {
                if (i === drag.index) cDur = drag.sec - c.start;
                else if (i === drag.index + 1) { cStart = drag.sec; cDur = (c.start + c.duration) - drag.sec; }
              }
              const style = { left: pctZoom(cStart), width: pctZoom(cDur) };

              if (c.gap) {
                return (
                  <div
                    key={c.name}
                    className="clip clip--gap"
                    style={style}
                    title={`Empty · ${label(cStart)} · ${cDur.toFixed(1)}s`}
                  >
                    <button
                      type="button" className="clip__add" title="Add an image here"
                      onPointerDown={stop} onClick={() => onAdd && onAdd(c.name)}
                    >
                      <span className="clip__plus">+</span>
                      <span className="clip__meta clip__meta--gap">{cDur.toFixed(1)}s</span>
                    </button>
                  </div>
                );
              }

              const el = imageEls[c.name];
              const cls = ["clip"];
              if (c.name === activeName) cls.push("is-active");
              if (c.name === selectedName) cls.push("is-selected");
              if (badClips && badClips.has(c.name)) cls.push("is-bad");
              const fname = el && el.fileName ? stem(el.fileName) : "";
              return (
                <div
                  key={c.name}
                  className={cls.join(" ")}
                  style={{ ...style, backgroundImage: el && el.url ? `url(${el.url})` : undefined }}
                  title={`${el && el.fileName ? el.fileName + " · " : ""}${label(cStart)} · ${cDur.toFixed(1)}s — click to preview / replace`}
                  onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
                  onClick={(e) => onClipClick(c.name, e)}
                >
                  <span className="clip__meta">{cDur.toFixed(1)}s</span>
                  {el && el.isVideo && (
                    <span className="clip__video" title="Video clip">▶</span>
                  )}
                  {motionByName && motionByName[c.name] && motionByName[c.name] !== "none" && (
                    <span className="clip__motion" title={motionByName[c.name] === "zoomout" ? "Zoom out" : "Zoom in"}>
                      {motionByName[c.name] === "zoomout" ? "⤡" : "⤢"}
                    </span>
                  )}
                  {fname && <span className="clip__name">{fname}</span>}
                  {i < clips.length - 1 && (
                    <span
                      className="clip__resize"
                      title="Drag to change how long this image holds"
                      onPointerDown={(e) => onResizeDown(e, i)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="tl__lane tl__lane--audio tl__scrub" onPointerDown={onScrubDown}>
            <div className="tl__audio-main">
              <Waveform peaks={peaks} />
              <span className="tl__audio-label">Voiceover</span>
            </div>
          </div>
          {audioLayers && audioLayers.length > 0 && audioLayers.map((layer, layerIdx) => (
            <div
              key={layer.id}
              className="tl__lane tl__lane--audio tl__lane--layer"
              style={{ opacity: layer.muted ? 0.5 : 1 }}
              onPointerMove={(e) => {
                const t = laneXToTime(e.clientX);
                setAddHover((prev) => (prev && prev.layerId === layer.id && Math.abs(prev.t - t) < 0.03) ? prev : { layerId: layer.id, t });
              }}
              onPointerLeave={() => setAddHover((prev) => (prev && prev.layerId === layer.id ? null : prev))}
            >
              <div className="tl__audio-layer">
                {/* Layer background waveform */}
                <Waveform peaks={layer.clips && layer.clips.length > 0 ? combinePeaks(layer.clips, duration) : []} />
                <span className="tl__audio-label">
                  {layer.name} {layer.solo && <span className="tl__solo-badge">S</span>}
                  <span className="tl__volume-indicator">{Math.round(layer.volume * 100)}%</span>
                </span>
                {/* Individual clips on this layer */}
                {layer.clips && layer.clips.map((clip) => {
                  const isSelected = selectedAudioClip?.layerId === layer.id && selectedAudioClip?.clipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      className={`audio-clip ${isSelected ? 'selected' : ''}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: pctZoom(clip.start),
                        width: pctZoom(clip.duration),
                        opacity: clip.volume,
                        border: isSelected ? '2px solid var(--accent)' : 'none',
                        boxSizing: 'border-box',
                      }}
                      title={`${clip.name} · ${clip.start.toFixed(1)}s · ${clip.duration.toFixed(1)}s — click for volume, drag to move`}
                      onClick={(e) => { e.stopPropagation(); setSelectedAudioClip({ layerId: layer.id, clipId: clip.id }); setSelectedAudioLayer(layer.id); }}
                      onPointerDown={(e) => { e.stopPropagation(); onAudioClipDragDown(e, layer.id, clip.id); }}
                    >
                      <Waveform peaks={clip.peaks} style={{ width: '100%', height: '100%' }} />
                      {/* Trim handle - left edge */}
                      <span className="audio-clip-trim-handle audio-trim-left" onPointerDown={(e) => { e.stopPropagation(); onAudioClipTrimLeftDown(e, layer.id, clip.id); }} />
                      {/* Trim handle - right edge */}
                      <span className="audio-clip-trim-handle audio-trim-right" onPointerDown={(e) => { e.stopPropagation(); onAudioClipTrimRightDown(e, layer.id, clip.id); }} />
                    </div>
                  );
                })}
                {/* Volume popover for the clicked clip */}
                {selectedAudioClip?.layerId === layer.id && (() => {
                  const sel = layer.clips.find((c) => c.id === selectedAudioClip.clipId);
                  if (!sel) return null;
                  return (
                    <div className="audio-vol-pop" style={{ left: pctZoom(sel.start) }} title={`Vol ${Math.round(sel.volume * 100)}%`}>
                      <span className="audio-vol-pop__tag">Vol</span>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={sel.volume}
                        onChange={(e) => updateAudioClip && updateAudioClip(layer.id, sel.id, { volume: +e.target.value })}
                      />
                      <span className="audio-vol-pop__val">{Math.round(sel.volume * 100)}%</span>
                    </div>
                  );
                })()}
              </div>
              {/* Hover circle-plus: upload a sound effect at the pointer position */}
              {addHover && addHover.layerId === layer.id && (
                <button
                  type="button"
                  className="tl__add-sfx"
                  style={{ left: pctZoom(addHover.t) }}
                  title="Upload a sound effect here"
                  aria-label="Upload a sound effect here"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerMove={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const inp = document.querySelector(`input[data-addlayer="${layer.id}"]`);
                    if (inp) { inp.dataset.start = String(addHover.t || 0); inp.click(); }
                  }}
                >
                  <span className="tl__add-sfx__icon">+</span>
                </button>
              )}
              <input
                type="file" accept="audio/*" hidden
                data-addlayer={layer.id}
                onChange={(e) => {
                  const t = parseFloat(e.target.dataset.start || "0");
                  if (onAddAudioClip && e.target.files && e.target.files.length) onAddAudioClip(layer.id, e.target.files, t);
                  setAddHover((prev) => (prev && prev.layerId === layer.id ? null : prev));
                  e.target.value = "";
                }}
              />
            </div>
          ))}

          <div
            className="tl__lane tl__lane--fx"
            onPointerDown={onFxLaneDown}
            title="Click to place the selected sound · drag a marker to move · click a marker to edit"
          >
            {sfx.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sfxmark"
                style={{ left: pctZoom(s.at) }}
                title={`${s.name} · ${label(s.at)}`}
                onPointerDown={(e) => onSfxMarkerDown(e, s.id)}
              >
                <span className="sfxmark__line" />
                <span className="sfxmark__label">{s.name}</span>
              </button>
            ))}
          </div>

          <div className="tl__playhead" style={{ left: pctZoom(time) }}>
            <span className="tl__playhead-grip" />
          </div>

          {trimmed && (
            <div
              className="tl__trim-shade"
              style={{ left: pctZoom(trimPos), width: pctZoom(duration - trimPos) }}
              aria-hidden="true"
            />
          )}
          <div
            className="tl__trim"
            style={{ left: pctZoom(trimPos) }}
            onPointerDown={onTrimDown}
            title="Drag to set where the export ends"
            role="slider"
            aria-label="Export end"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(trimPos)}
          >
            <span className="tl__trim-grip" />
          </div>
        </div>
      </div>
    </div>
  );
}
