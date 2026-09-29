"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";

// Logo editor: crop, rotate, and circle-crop an uploaded logo.
// Renders the result to a PNG blob on Apply.
export default function LogoEditor({ src, onApply, onClose }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [circle, setCircle] = useState(false);
  // Crop rect in image pixels (after rotation is applied for display).
  const [crop, setCrop] = useState(null);
  const dragRef = useRef(null);

  // Load the image.
  useEffect(() => {
    if (!src) return;
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setCrop({ x: 0, y: 0, w: el.naturalWidth, h: el.naturalHeight });
      setRotation(0);
      setCircle(false);
    };
    el.src = src;
    return () => { el.onload = null; };
  }, [src]);

  // Display dimensions (rotation swaps w/h).
  const dispW = img ? (rotation % 180 === 0 ? img.naturalWidth : img.naturalHeight) : 0;
  const dispH = img ? (rotation % 180 === 0 ? img.naturalHeight : img.naturalWidth) : 0;

  // Draw preview.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !crop) return;
    const maxW = 320;
    const scale = Math.min(1, maxW / dispW);
    canvas.width = Math.round(dispW * scale);
    canvas.height = Math.round(dispH * scale);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw rotated image.
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    // Dim outside the crop.
    const cx = crop.x * scale, cy = crop.y * scale;
    const cw = crop.w * scale, ch = crop.h * scale;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, cy);
    ctx.fillRect(0, cy + ch, canvas.width, canvas.height - cy - ch);
    ctx.fillRect(0, cy, cx, ch);
    ctx.fillRect(cx + cw, cy, canvas.width - cx - cw, ch);

    // Circle preview.
    if (circle) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
      ctx.clip();
      // Redraw just the cropped region inside the circle.
      ctx.restore();
      ctx.strokeStyle = "#0a84ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + cw / 2, cy + ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crop rect outline + handles.
    ctx.strokeStyle = "#0a84ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = "#0a84ff";
    const hs = 8;
    for (const [hx, hy] of [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]]) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
  }, [img, crop, rotation, circle, dispW, dispH]);

  useEffect(() => { draw(); }, [draw]);

  // Pointer interaction: drag inside = move, drag on corner handle = resize.
  const toImage = (e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const scale = dispW / canvas.width;
    return {
      x: (e.clientX - r.left) * scale,
      y: (e.clientY - r.top) * scale,
    };
  };

  const onPointerDown = (e) => {
    if (!crop) return;
    const p = toImage(e);
    const hs = 12 * (dispW / canvasRef.current.width);
    const corners = [
      ["nw", crop.x, crop.y], ["ne", crop.x + crop.w, crop.y],
      ["sw", crop.x, crop.y + crop.h], ["se", crop.x + crop.w, crop.y + crop.h],
    ];
    for (const [id, hx, hy] of corners) {
      if (Math.abs(p.x - hx) < hs && Math.abs(p.y - hy) < hs) {
        dragRef.current = { mode: "resize", id, start: p, orig: { ...crop } };
        e.target.setPointerCapture(e.pointerId);
        return;
      }
    }
    if (p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h) {
      dragRef.current = { mode: "move", start: p, orig: { ...crop } };
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || !crop) return;
    const p = toImage(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.mode === "move") {
      setCrop({
        ...d.orig,
        x: Math.min(Math.max(0, d.orig.x + dx), dispW - d.orig.w),
        y: Math.min(Math.max(0, d.orig.y + dy), dispH - d.orig.h),
      });
    } else {
      const o = d.orig;
      let { x, y, w, h } = o;
      if (d.id.includes("e")) w = Math.max(10, o.w + dx);
      if (d.id.includes("s")) h = Math.max(10, o.h + dy);
      if (d.id.includes("w")) { w = Math.max(10, o.w - dx); x = o.x + (o.w - w); }
      if (d.id.includes("n")) { h = Math.max(10, o.h - dy); y = o.y + (o.h - h); }
      x = Math.max(0, Math.min(x, dispW - 10));
      y = Math.max(0, Math.min(y, dispH - 10));
      w = Math.min(w, dispW - x);
      h = Math.min(h, dispH - y);
      setCrop({ x, y, w, h });
    }
  };

  const onPointerUp = () => { dragRef.current = null; };

  const rotate = (dir) => {
    setRotation((r) => (r + dir * 90 + 360) % 360);
    // Reset crop to full image on rotate (dimensions swap).
    if (img) {
      const w = (rotation + dir * 90 + 360) % 360 % 180 === 0 ? img.naturalWidth : img.naturalHeight;
      const h = (rotation + dir * 90 + 360) % 360 % 180 === 0 ? img.naturalHeight : img.naturalWidth;
      setCrop({ x: 0, y: 0, w, h });
    }
  };

  const handleApply = () => {
    if (!img || !crop) return;
    // Render at natural resolution: rotate, crop, optional circle mask.
    const out = document.createElement("canvas");
    const cw = Math.round(crop.w), ch = Math.round(crop.h);
    if (circle) {
      const s = Math.min(cw, ch);
      out.width = s; out.height = s;
    } else {
      out.width = cw; out.height = ch;
    }
    const ctx = out.getContext("2d");
    if (circle) {
      const s = Math.min(cw, ch);
      // Center the crop in the square.
      const ox = (cw - s) / 2, oy = (ch - s) / 2;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.clip();
      drawTransformed(ctx, -ox, -oy, 1);
    } else {
      drawTransformed(ctx, 0, 0, 1);
    }
    out.toBlob((blob) => {
      if (blob && onApply) onApply(blob);
    }, "image/png");
  };

  // Draw the rotated image cropped to `crop`, offset by (ox, oy) at scale.
  const drawTransformed = (ctx, ox, oy, scale) => {
    const rot = (rotation * Math.PI) / 180;
    // Source: rotate the image, then take the crop rect.
    const tmp = document.createElement("canvas");
    tmp.width = dispW; tmp.height = dispH;
    const tctx = tmp.getContext("2d");
    tctx.translate(dispW / 2, dispH / 2);
    tctx.rotate(rot);
    tctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.drawImage(
      tmp,
      crop.x, crop.y, crop.w, crop.h,
      ox * scale, oy * scale, crop.w * scale, crop.h * scale
    );
  };

  const reset = () => {
    if (!img) return;
    setCrop({ x: 0, y: 0, w: dispW, h: dispH });
    setRotation(0);
    setCircle(false);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span className="modal__title">Edit logo</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <canvas
            ref={canvasRef}
            style={{ maxWidth: "100%", borderRadius: 8, cursor: "move", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
        <div className="mini-h" style={{ marginTop: 12 }}>Drag the blue box to crop — pull corners to resize</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className="mbtn" onClick={() => rotate(-90)}>⟲ Rotate left</button>
          <button type="button" className="mbtn" onClick={() => rotate(90)}>⟳ Rotate right</button>
          <button
            type="button" className={`mbtn${circle ? " mbtn--primary" : ""}`}
            onClick={() => setCircle((v) => !v)}
          >
            {circle ? "● Circle on" : "○ Circle crop"}
          </button>
          <button type="button" className="mbtn" onClick={reset}>Reset</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="mbtn mbtn--primary" style={{ flex: 1 }} onClick={handleApply}>
            Apply
          </button>
          <button type="button" className="mbtn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
