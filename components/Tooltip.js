"use client";
import { useEffect, useRef, useState } from "react";

// Normalize a shortcut string (e.g. "Ctrl+Z", "Ctrl+Shift+Z", "Space") into a
// platform-friendly kbd glyph: ⌘/⇧ on Apple keyboards, Ctrl/Shift elsewhere.
function prettyKbd(raw) {
  if (!raw) return null;
  const mac = typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(String(navigator.platform || navigator.userAgent || ""));
  let s = String(raw);
  if (mac) {
    s = s.split("+").map((p) => {
      p = p.trim();
      if (p === "Ctrl") return "⌘";
      if (p === "Alt") return "⌥";
      if (p === "Shift") return "⇧";
      return p;
    }).join("");
  } else if (/^Ctrl\+/.test(s)) {
    s = s.replace(/^Ctrl\+/, "");
  }
  return s;
}

const KEYNAMES = {
  " ": "Space", Space: "Space", ArrowLeft: "←", ArrowRight: "→", End: "End", Home: "Home",
};

// A single page-level tooltip layer (Clipchamp style). Any element tagged with
// `data-tip="label"` gets a floating label on hover; an optional
// `data-kbd="Ctrl+Z"` renders a kbd badge with the platform-localized shortcut.
export default function TooltipLayer() {
  const [tip, setTip] = useState(null); // { text, kbd }
  const [pos, setPos] = useState(null); // viewport x/y
  const layerRef = useRef(null); // the positioned .tip element
  const lastRef = useRef(null); // last hovered element

  useEffect(() => {
    const find = (t) => t && t.closest ? t.closest("[data-tip]") : null;
    const over = (e) => {
      const el = find(e.target);
      if (el === lastRef.current) return;
      lastRef.current = el;
      setTip(el ? {
        text: el.getAttribute("data-tip") || "",
        kbd: el.getAttribute("data-kbd") || null,
      } : null);
    };
    const out = (e) => {
      if (!find(e.target)) { lastRef.current = null; setTip(null); }
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
    };
  }, []);

  // Anchor the chip above/centered on whichever element is hovered, keeping it
  // on-screen. Re-position on scroll/resize so it stays glued to the element.
  useEffect(() => {
    if (!tip || !tip.text) { setPos(null); return; }
    const el = lastRef.current;
    if (!el) { setPos(null); return; }
    const place = () => {
      const r = el.getBoundingClientRect();
      const node = layerRef.current;
      const w = node ? node.offsetWidth : 0;
      const h = node ? node.offsetHeight : 0;
      const above = r.top - h - 10 >= 0;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), (window.innerWidth || 0) - w - 8);
      setPos({ x, y: above ? r.top - h - 10 : r.bottom + 10 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [tip]);

  if (!tip || !tip.text) return null;
  return (
    <div
      ref={layerRef}
      className="tip"
      role="tooltip"
      style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }}
    >
      <span className="tip__label">{tip.text}</span>
      {tip.kbd && <kbd className="tip__kbd">{prettyKbd(tip.kbd)}</kbd>}
    </div>
  );
}
