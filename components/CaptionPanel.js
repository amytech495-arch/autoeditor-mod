"use client";
import React from "react";
import {
  CAPTION_STYLE_LIST, CAPTION_FONTS, CAPTION_SIZES, CAPTION_ANIMATION_LIST,
  captionLineHeightDefault,
} from "../lib/captions";
import { CAPTION_PRESETS } from "../lib/captionPresets";

// Captions sidebar tab, extracted from Editor.js. Props are the caption state
// and setters owned by app/page.js (passed through Editor).
export default function CaptionPanel({
  sideTab,
  captionCues, captionsOn, setCaptionsOn,
  captionStyle, setCaptionStyle,
  captionFont, setCaptionFont,
  captionAnimation, setCaptionAnimation,
  captionMode, setCaptionMode,
  pickCaptionPreset,
  captionSize, setCaptionSize,
  captionLineHeight, setCaptionLineHeight,
  captionFontScale, setCaptionFontScale,
  captionName, captionError,
  onTranscribe, transcribeStatus, capInputRef, onDeleteCaptions,
  syncOn, setSyncOn, syncStatus, syncAligned,
}) {
  // The template whose style/font/animation currently match (null = custom).
  const activePreset = CAPTION_PRESETS.find((p) =>
    p.style === captionStyle && p.font === captionFont && p.animation === captionAnimation
  ) || null;
  // "Replace" choice dialog: auto-transcribe or upload an SRT/VTT file.
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  return (
    <div
      className={`side__group${sideTab === "captions" ? "" : " is-off"}`}
      id="side-panel-captions"
      role="tabpanel"
      aria-labelledby="side-tab-captions"
      data-tab="captions"
    >
    <div className="panel captions">
      <h2 className="panel__h">Captions</h2>
      {!(captionCues && captionCues.length) ? (
        <div className="cap-empty">
          <button type="button" className="cap-upload" onClick={() => capInputRef.current && capInputRef.current.click()}>
            <span className="cap-upload__i">⤒</span> Upload timestamped script
          </button>
          <button
            type="button"
            className="cap-upload"
            style={{ marginTop: 8 }}
            disabled={!!(transcribeStatus && transcribeStatus.busy)}
            onClick={() => onTranscribe && onTranscribe()}
            title="Transcribe the audio with whisper and generate word-timed captions automatically"
          >
            <span className="cap-upload__i">🎙</span>
            {transcribeStatus && transcribeStatus.busy
              ? `Transcribing… ${Math.round((transcribeStatus.progress || 0) * 100)}%`
              : "Auto-transcribe audio"}
          </button>
          {transcribeStatus && transcribeStatus.busy && (
            <div className="cap-progress" style={{ marginTop: 8 }}>
              <div className="cap-progress__bar" style={{ width: `${Math.round((transcribeStatus.progress || 0) * 100)}%` }} />
            </div>
          )}
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
              <button type="button" className="cap-replace" onClick={() => setReplaceOpen(true)}>replace</button>
              {" · "}
              <button
                type="button" className="cap-replace cap-replace--danger"
                onClick={() => { if (window.confirm("Delete all captions?")) onDeleteCaptions && onDeleteCaptions(); }}
              >delete</button>
            </span>
          </div>
          {replaceOpen && (
            <div className="modal" role="dialog" aria-modal="true" onClick={() => setReplaceOpen(false)}>
              <div className="modal__card" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal__head">
                  <span className="modal__title">Replace captions</span>
                  <button className="modal__x" onClick={() => setReplaceOpen(false)} aria-label="Close">✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  <button
                    type="button" className="mbtn mbtn--primary"
                    disabled={!!(transcribeStatus && transcribeStatus.busy)}
                    onClick={() => { setReplaceOpen(false); onTranscribe && onTranscribe(); }}
                  >
                    <span className="cap-upload__i">🎙</span>{" "}
                    {transcribeStatus && transcribeStatus.busy
                      ? `Transcribing… ${Math.round((transcribeStatus.progress || 0) * 100)}%`
                      : "Auto-transcribe audio"}
                  </button>
                  <button
                    type="button" className="mbtn"
                    onClick={() => { setReplaceOpen(false); capInputRef.current && capInputRef.current.click(); }}
                  >
                    <span className="cap-upload__i">⤒</span> Upload SRT / VTT file
                  </button>
                </div>
              </div>
            </div>
          )}

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
            <div className="mini-h">Templates</div>
            <div className="cap-templates">
              {CAPTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`cap-template${activePreset && activePreset.id === p.id ? " is-on" : ""}`}
                  onClick={() => pickCaptionPreset && pickCaptionPreset(p.id)}
                  title={p.desc}
                >
                  <span className="cap-template__preview" data-style={p.style}>Ag</span>
                  <span className="cap-template__label">{p.label}</span>
                </button>
              ))}
            </div>
            {activePreset && (
              <div className="cap-hint" style={{ marginTop: 4 }}>{activePreset.desc}</div>
            )}

            <div className="mini-h" style={{ marginTop: 12 }}>Display</div>
            <div className="seg">
              {[["sentence", "Full sentences"], ["word", "Word by word"]].map(([id, lbl]) => (
                <button
                  key={id}
                  type="button"
                  className={captionMode === id ? "is-on" : ""}
                  onClick={() => setCaptionMode && setCaptionMode(id)}
                  title={id === "word"
                    ? "CapCut-style: 1–4 words on screen at a time, each highlighting as spoken"
                    : "Classic subtitles: full caption lines"}
                >{lbl}</button>
              ))}
            </div>

            <div className="mini-h" style={{ marginTop: 12 }}>Style</div>
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

            <div className="mini-h" style={{ marginTop: 12 }}>Font</div>
            <div className="transitions__chips">
              {CAPTION_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`trchip ${captionFont === f.id ? "is-on" : ""}`}
                  onClick={() => setCaptionFont && setCaptionFont(f.id)}
                  style={{ fontFamily: `"${f.family}", system-ui, sans-serif` }}
                >
                  {f.label}
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
    </div>
  );
}
