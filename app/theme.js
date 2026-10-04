"use client";
import { useSyncExternalStore } from "react";

const KEY = "autoeditor.theme";
const ATTR = "data-theme";

export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";

function root() {
  return typeof document === "undefined" ? null : document.documentElement;
}

export function getTheme() {
  const el = root();
  if (!el) return DEFAULT_THEME;
  return el.getAttribute(ATTR) === "light" ? "light" : "dark";
}

function persist(theme) {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {}
}

export function setTheme(theme, opts) {
  const next = theme === "light" ? "light" : "dark";
  const prev = getTheme();
  if (next === prev && root().hasAttribute(ATTR) === (next === "light")) return prev;

  const apply = () => {
    const el = root();
    if (next === "light") el.setAttribute(ATTR, next);
    else el.removeAttribute(ATTR);
    persist(next);
  };

  if (opts && opts.event) revealWithTransition(apply, opts.event);
  else apply();
  return next;
}

export function toggleTheme(event) {
  return setTheme(getTheme() === "light" ? "dark" : "light", { event });
}

function subscribe(cb) {
  const el = root();
  if (!el || typeof MutationObserver === "undefined") return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(el, { attributes: true, attributeFilter: [ATTR] });
  return () => mo.disconnect();
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function originPoint(event) {
  if (!event) return null;
  if (typeof event.clientX === "number" && (event.clientX || event.clientY)) {
    return [event.clientX, event.clientY];
  }
  const r = event.currentTarget && event.currentTarget.getBoundingClientRect
    ? event.currentTarget.getBoundingClientRect()
    : null;
  if (!r) return null;
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function revealWithTransition(apply, event) {
  const start = document.startViewTransition;
  if (typeof start !== "function" || prefersReducedMotion()) return apply();

  const point = originPoint(event);
  if (!point) return apply();

  const [x, y] = point;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const endPct = (radius / (Math.hypot(w, h) / Math.SQRT2)) * 100;
  const at = `${(x / w) * 100}% ${(y / h) * 100}%`;

  const t = document.startViewTransition(apply);
  if (t && t.ready && typeof t.ready.then === "function") {
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0% at ${at})`, `circle(${endPct}% at ${at})`] },
        { duration: 460, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
      );
    }, () => {});
  }
  return t;
}

export function applyStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  let stored = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {}
  const theme = stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  const el = root();
  if (theme === "light") el.setAttribute(ATTR, theme);
  else el.removeAttribute(ATTR);
  return theme;
}