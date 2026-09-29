"use client";
import { useState } from "react";
import { showConfirm, showPrompt } from "./Dialog";

function fmtBytes(n) {
  if (!n) return "0 MB";
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}
function clock(sec) {
  if (!sec || !isFinite(sec)) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
export default function ProjectsHome({ projects, onNew, onOpen, onRename, onDelete, storage }) {
  const [menuId, setMenuId] = useState(null); // project id with its ⋮ menu open

  const doRename = async (p) => {
    setMenuId(null);
    const name = await showPrompt("Rename project", {
      title: "Rename project", defaultValue: p.name || "Untitled project", okText: "Rename",
    });
    if (name && name.trim()) onRename(p.id, name.trim());
  };
  const doDelete = async (p) => {
    setMenuId(null);
    const ok = await showConfirm(
      `Delete "${p.name || "Untitled"}"? This permanently removes the project and its media from this device.`,
      { title: "Delete project", okText: "Delete", danger: true }
    );
    if (ok) onDelete(p.id);
  };

  return (
    <main className="ph" onClick={() => menuId && setMenuId(null)}>
      <header className="ph__topbar">
        <div className="ph__bar">
          <div className="ph__brand">
            <img className="ph__logo" src="/logo.svg" alt="" width="26" height="26" />
            <span className="ph__name"><span className="ph__pre">AutoEditor</span> Mod <span className="ph__version">v1.6</span></span>
          </div>
          <div className="ph__actions">
            {storage && storage.quota ? (
              <span className="ph__storage" tabIndex={0} role="tooltip" aria-label="Browser storage used by AutoEditor">
                {fmtBytes(Math.max(0, storage.quota - storage.usage))} left of {fmtBytes(storage.quota)}
                <span className="ph__storage-tip">
                  <b>Storage balance</b>
                  Projects, media files and captures are saved in your browser's storage so you can keep working offline. If it fills up, the oldest/lowest-quality items get evicted first.
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="ph__body">
        <div className="ph__head">
          <h1 className="ph__title">Your projects</h1>
          <p className="ph__sub">Pick up where you left off — or start a fresh cut.</p>
        </div>

        <div className="ph__grid">
          <button className="ph__new" onClick={onNew}>
            <span className="ph__new-plus">＋</span>
            <span className="ph__new-label">New project</span>
          </button>

          {projects.map((p) => (
            <div key={p.id} className="pcard" onClick={() => onOpen(p.id)}>
              <div className="pcard__thumb">
                {p.thumb ? <img src={p.thumb} alt="" /> : <span className="pcard__noimg">▦</span>}
                {p.durationSec ? <span className="pcard__dur">{clock(p.durationSec)}</span> : null}
              </div>
              <div className="pcard__foot">
                <div className="pcard__meta">
                  <span className="pcard__name" title={p.name}>{p.name || "Untitled"}</span>
                  <span className="pcard__sub">
                    {p.clipCount ? `${p.clipCount} clip${p.clipCount > 1 ? "s" : ""} · ` : ""}{timeAgo(p.updatedAt)}
                  </span>
                </div>
                <div className="pcard__menuwrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="pcard__menu"
                    aria-label="Project options"
                    onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                  >⋮</button>
                  {menuId === p.id && (
                    <div className="pcard__pop">
                      <button onClick={() => doRename(p)}>Rename</button>
                      <button className="pcard__pop-del" onClick={() => doDelete(p)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {projects.length === 0 && (
          <div className="ph__empty-wrap">
            <p className="ph__empty">No projects yet — create your first one to get started.</p>
          </div>
        )}

        <footer className="ph__foot">
          <p className="ph__foot-note">Owned by Frank Nwabenu</p>
        </footer>
      </div>
    </main>
  );
}
