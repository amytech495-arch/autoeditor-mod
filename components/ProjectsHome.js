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
function GitHubLink({ href, title, label, className = "" }) {
  return (
    <a className={`dc-link ${className}`} href={href} target="_blank" rel="noopener noreferrer" title={title}>
      <svg className="dc-link__icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.501 0 12.303c0 5.433 3.438 10.043 8.205 11.671.6.113.82-.267.82-.593 0-.293-.01-1.066-.016-2.093-3.338.743-4.042-1.651-4.042-1.651-.546-1.421-1.333-1.8-1.333-1.8-1.089-.763.083-.747.083-.747 1.205.087 1.84 1.267 1.84 1.267 1.07 1.88 2.808 1.336 3.493 1.022.109-.795.419-1.336.761-1.643-2.665-.31-5.467-1.366-5.467-6.08 0-1.343.469-2.441 1.237-3.302-.124-.31-.536-1.56.117-3.253 0 0 1.008-.33 3.301 1.261a11.16 11.16 0 0 1 3.006-.414c1.02.005 2.047.139 3.006.414 2.29-1.591 3.297-1.261 3.297-1.261.653 1.693.243 2.943.119 3.253.77.861 1.235 1.959 1.235 3.302 0 4.721-2.804 5.766-5.477 6.07.43.381.815 1.13.815 2.279 0 1.645-.015 2.971-.015 3.375 0 .328.218.71.826.59C20.565 22.35 24 17.739 24 12.303 24 5.501 18.63 0 12 0z" />
      </svg>
      <span className="dc-link__text">{label}</span>
    </a>
  );
}

function YouTubeLink({ href, title, label, className = "" }) {
  return (
    <a className={`dc-link ${className}`} href={href} target="_blank" rel="noopener noreferrer" title={title}>
      <svg className="dc-link__icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
      <span className="dc-link__text">{label}</span>
    </a>
  );
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
          <div className="ph__foot-links">
            <YouTubeLink className="ph__yt" href="https://www.youtube.com/@banong.gangOG" title="BanongGang on YouTube" label="visit channel" />
            <GitHubLink className="ph__gh" href="https://github.com/banonggang" title="BanongGang on GitHub" label="BanongGang" />
          </div>
          <p className="ph__foot-note">Modified <a href="https://www.youtube.com/@TryAIToday" target="_blank" rel="noopener noreferrer" className="ph__foot-link">TryAIToday</a> AutoEditor</p>
        </footer>
      </div>
    </main>
  );
}
