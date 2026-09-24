"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Recursively read every File out of a dropped entry (file or directory).
// readEntries returns in batches of ~100, so we keep reading until it's empty.
function readEntry(entry, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => { out.push(f); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => reader.readEntries(async (batch) => {
        if (!batch.length) return resolve();
        await Promise.all(batch.map((e) => readEntry(e, out)));
        readBatch();
      }, () => resolve());
      readBatch();
    } else {
      resolve();
    }
  });
}

// A click-or-drop file input. Dropping folders (even several at once) pulls in
// every file inside; `filled` swaps the label to the loaded state.

// Match files against a comma-separated accept list ("image/*,video/*"). An
// exact type ("image/png") or a wildcard subtype ("image/*") matches by MIME;
// if the browser reports an empty type (rare on drag-drop, common from some
// sources) the file extension is checked so .mp4/.png/.wav still get through
// instead of being silently dropped.
const EXT_BY_MIME = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "jfif", "tif", "tiff"],
  video: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ts", "mts", "m2ts", "3gp", "3g2", "ogv"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus", "wma"],
};
function matchesAccept(files, accept) {
  if (!accept) return Array.from(files);
  const accepted = accept.split(",").map((t) => t.trim()).filter(Boolean);
  const wildcardCategories = accepted
    .filter((t) => t.endsWith("/*"))
    .map((t) => t.split("/")[0]);
  const exactTypes = accepted.filter((t) => t.includes("/") && !t.endsWith("/*"));
  return Array.from(files).filter((f) => {
    const type = (f.type || "").toLowerCase();
    if (exactTypes.includes(type)) return true;
    if (wildcardCategories.some((cat) => type.startsWith(`${cat}/`))) return true;
    // No usable MIME — fall back to the extension.
    if (!type) {
      const ext = (f.name || "").split(".").pop().toLowerCase();
      return (ext && wildcardCategories.some((cat) => EXT_BY_MIME[cat] && EXT_BY_MIME[cat].includes(ext)))
        || exactTypes.some((t) => {
          const [cat, sub] = t.split("/");
          return sub && sub !== "*" && EXT_BY_MIME[cat] && EXT_BY_MIME[cat].includes(ext);
        });
    }
    return false;
  });
}

export default function Dropzone({
  accept, multiple, onFiles, compact,
  icon, title, hint, filled, filledLabel,
}) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  // On touch devices, accept="image/*" makes Android open Google Photos, which
  // renames files (losing the timestamp). Dropping `accept` opens the Files /
  // Documents picker instead, which preserves the real filename (0-03.png).
  // addImages/onAudio still filter by type, so nothing unwanted gets through.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    try { setCoarse(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch { /* ignore */ }
  }, []);

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setOver(false);
    const dt = e.dataTransfer;
    if (!dt) return;

    // Folder-aware path (only for multi-file zones like images). webkitGetAsEntry
    // must be called synchronously during the drop, so grab the entries first.
    if (multiple && dt.items && dt.items.length) {
      const entries = Array.from(dt.items)
        .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
        .filter(Boolean);
      if (entries.length) {
        const out = [];
        await Promise.all(entries.map((en) => readEntry(en, out)));
        const files = matchesAccept(out, accept);
        if (files.length) onFiles(files);
        return;
      }
    }

    if (dt.files && dt.files.length) onFiles(matchesAccept(dt.files, accept));
  }, [onFiles, multiple, accept]);

  const cls = ["dz"];
  if (compact) cls.push("dz--compact");
  if (over) cls.push("is-over");
  if (filled) cls.push("is-filled");

  return (
    <button
      type="button"
      className={cls.join(" ")}
      onClick={(e) => {
        // The hidden file input lives INSIDE this button, so the picker's
        // programmatic click() bubbles back up and re-fires this handler,
        // opening a second dialog — re-picking there duplicates the file on
        // the timeline. Ignore only that bubbled click (the input itself);
        // clicks on the button or its label text must still open the picker.
        if (e.target === inputRef.current) return;
        inputRef.current && inputRef.current.click();
      }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span className="dz__icon" aria-hidden="true">{filled ? "✓" : icon}</span>
      <span className="dz__body">
        <span className="dz__title">{filled ? filledLabel : title}</span>
        {!compact && hint && <span className="dz__hint">{hint}</span>}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={coarse ? undefined : accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          if (e.target.files && e.target.files.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
