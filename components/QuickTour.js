"use client";
import { useEffect, useState } from "react";

// Steps target elements by selector; the card is placed next to whichever is
// currently highlighted (falls back to a centered card if the target is missing).
const STEPS = [
  {
    sel: ".bar__io",
    text: "Import your voiceover (♪) and media (▦) from the top bar.",
  },
  {
    sel: ".viewer",
    text: "This is live preview. Press Space to play, drag or click the timeline to scrub, and click the time to jump to any moment.",
  },
  {
    sel: ".tl",
    text: "Each clip is synced to its timestamp. Drag clip edges to change how long they hold, click a ◇ to set a transition, and hover the ruler to see the time under your cursor.",
  },
  {
    sel: ".side__tabs",
    text: "Tune everything on the right — Effects, Captions, Audio, Overlay, and Export — each with its own tab.",
  },
];

export default function QuickTour({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState(null); // viewport rect of the highlighted element

  useEffect(() => {
    if (!open) return;
    setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) { setBox(null); return; }
    const place = () => {
      const s = STEPS[step];
      const el = s && document.querySelector(s.sel);
      if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      setBox(el ? el.getBoundingClientRect() : null);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, step]);

  if (!open) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Position the card just below the highlighted element (above it if that would
  // overflow the viewport); fall back to center-screen when there's no target.
  const CARD_H = 150, GAP = 12;
  let card = {};
  if (box) {
    const below = box.bottom + GAP;
    const x = Math.max(12, Math.min(box.left + box.width / 2, window.innerWidth - 320));
    card = {
      left: x,
      transform: "translateX(-50%)",
      top: below + CARD_H > window.innerHeight && box.top - CARD_H - GAP > 0
        ? box.top - CARD_H - GAP
        : Math.max(12, below),
    };
  } else {
    card = { left: "50%", top: "42%", transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Quick tour">
      {box && (
        <span
          className="tour__ring"
          style={{ left: box.left - 5, top: box.top - 5, width: box.width + 10, height: box.height + 10 }}
        />
      )}
      <div className="tour__card" style={card}>
        <div className="tour__head">
          <span className="tour__title">✨ Quick tour</span>
          <span className="tour__count">{step + 1} / {STEPS.length}</span>
          <button type="button" className="tour__x" onClick={onClose} aria-label="Close tour" data-tip="Close tour">✕</button>
        </div>
        <p className="tour__text">{s.text}</p>
        <div className="tour__foot">
          <button type="button" className="tour__skip" onClick={onClose} data-tip="Skip the tour">Skip</button>
          <span className="tour__dots">
            {STEPS.map((_, i) => (
              <i key={i} className={`tour__dot${i === step ? " is-on" : ""}`} />
            ))}
          </span>
          {step > 0 && (
            <button type="button" className="tour__prev" onClick={() => setStep(step - 1)} data-tip="Previous step">←</button>
          )}
          <button
            type="button"
            className="tour__next"
            onClick={() => (isLast ? onClose() : setStep(step + 1))}
            data-tip={isLast ? "Start editing" : "Next step"}
          >
            {isLast ? "Start editing" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}