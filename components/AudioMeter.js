"use client";
import { useCallback, useEffect, useRef } from "react";
import { dbToPos, meterZones, METER_SCALE } from "../lib/audioMeter";

// One live level strip: a volume slider, a dB scale and a two-channel meter.
// The bars are driven by direct DOM writes from the editor's rAF loop — going
// through React state would re-render the whole editor 60 times a second — so
// the component only registers its DOM nodes and hands back a paint handle.

function MeterBar({ handleRef }) {
  return (
    <div className="meter__cell">
      <div className="meter__zones" aria-hidden="true">
        <div className="meter__zone meter__zone--red" style={{ height: `${meterZones().red * 100}%` }} />
        <div className="meter__zone meter__zone--amber" style={{ height: `${meterZones().amber * 100}%` }} />
        <div className="meter__zone meter__zone--green" style={{ height: `${meterZones().green * 100}%` }} />
      </div>
      {/* The mask covers the unlit part of the bar; shrinking its height lights
          the meter up from the bottom. */}
      <div className="meter__mask" ref={(el) => { if (handleRef) handleRef.current.mask = el; }} />
      <div className="meter__peak" ref={(el) => { if (handleRef) handleRef.current.peak = el; }} />
    </div>
  );
}

function Strip({ strip, onVolume, onToggleMute, register }) {
  const fillRef = useRef(null);
  const barRef = useRef({});
  const dragRef = useRef(null);

  // Publish this strip's DOM nodes so the rAF loop can paint them.
  useEffect(() => {
    register(strip.id, { fill: fillRef.current, bar: barRef.current });
    return () => register(strip.id, null);
  }, [strip.id, register]);

  const value = strip.muted ? 0 : (strip.volume ?? 0);
  const setFromEvent = useCallback((clientY) => {
    const el = fillRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Sliders fill from the bottom: bottom = 100%, top = 0%.
    const v = 1 - Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)));
    onVolume(strip.id, v);
  }, [onVolume, strip.id]);

  const onFillDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setFromEvent(e.clientY);
    dragRef.current = true;
    const onMove = (ev) => { if (dragRef.current) setFromEvent(ev.clientY); };
    const onUp = () => {
      dragRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [setFromEvent]);

  const onFillKey = useCallback((e) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    if (e.key === "ArrowUp") { e.preventDefault(); onVolume(strip.id, Math.min(1, value + step)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onVolume(strip.id, Math.max(0, value - step)); }
  }, [onVolume, strip.id, value]);

  const pct = `${Math.round(value * 100)}%`;

  return (
    <div className="meter__strip">
      <div className="meter__cols">
        <div
          className="meter__fill"
          ref={fillRef}
          role="slider"
          tabIndex={0}
          aria-label={`${strip.label} volume`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value * 100)}
          aria-valuetext={strip.muted ? "muted" : pct}
          onPointerDown={onFillDown}
          onKeyDown={onFillKey}
        >
          <div className="meter__fill-level" style={{ height: pct }} />
        </div>

        <div className="meter__scale" aria-hidden="true">
          {METER_SCALE.slice(0, 5).map((db) => (
            <span key={db} style={{ bottom: `${dbToPos(db) * 100}%` }}>{db > 0 ? `+${db}` : db}</span>
          ))}
        </div>

        <MeterBar handleRef={barRef} />
      </div>

      <div className="meter__label">
        {onToggleMute && (
          <button
            type="button"
            className={`meter__mute${strip.muted ? " is-on" : ""}`}
            onClick={() => onToggleMute(strip.id)}
            data-tip={strip.muted ? `Unmute ${strip.label}` : `Mute ${strip.label}`}
            aria-label={strip.muted ? `Unmute ${strip.label}` : `Mute ${strip.label}`}
            aria-pressed={!!strip.muted}
          >M</button>
        )}
        <span className="meter__name" title={strip.label}>{strip.label}</span>
      </div>
    </div>
  );
}

export default function AudioMeter({ strips, onVolume, onToggleMute, register }) {
  if (!strips.length) return null;
  return (
    <div className="meter" role="group" aria-label="Audio meters">
      <div className="meter__inner">
        {strips.map((s) => (
          <Strip key={s.id} strip={s} onVolume={onVolume} onToggleMute={onToggleMute} register={register} />
        ))}
      </div>
    </div>
  );
}