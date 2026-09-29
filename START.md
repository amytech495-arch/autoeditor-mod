# AutoEditor Mod — how to start

Installed 2026-09-25 from https://github.com/banonggang/autoeditor-mod (version 1.6).
Updated 2026-09-28 to commit da8c7ca (adds per-clip Mute toggle for video assets:
Mute/Unmute button in the clip inspector modal, persisted in projects, undo/redo
aware, forces volume to 0 in preview + ffmpeg render + WebCodecs render while the
volume slider keeps its value).
Built per the repo's own `1 Run-Linux.sh` logic, but headless.

## Local uncommitted change (2026-09-28)
Ken Burns zoom depth now defaults to max 20% (was 8%) in `app/page.js` and
`server/render.js`, so clicking "Alternate" applies full-depth zoom to all
images right away. Rebuilt + smoke-tested (HTTP 200). Not committed/pushed —
Leo's iMac is the committing side; push from here only if he asks.

## Local uncommitted change (2026-09-28, transitions)
Transitions now default to Fade to black at 0.45s on every cut:
- `lib/transitions.js`: DEFAULT_TRANSITION_DURATION 0.4 → 0.45
- `components/Editor.js`: panel opens with "Fade to black" selected; unset cuts
  preview/inspect as fade-to-black instead of hard cut
- `app/page.js`: both export paths (ffmpeg + WebCodecs) default unset cuts to
  fadeblack. Explicitly-set "None" cuts still hard-cut; first clip unaffected.
Tests 106/106 pass; rebuilt + smoke-tested (HTTP 200). Not pushed.

## Start the server

From this directory:

```bash
cd ~/workspace/autoeditor-mod
node server/index.js
```

The editor UI is then at **http://localhost:4000**.

## Important

- **Do NOT set OPEN_BROWSER** here. That env var makes the server try to
  launch a desktop browser, which doesn't exist on this headless VM.
- Do not leave the server running continuously — start it on demand and
  stop it (Ctrl+C) when done.
- First-run setup is already done: backend deps installed in `server/`,
  UI built into `out/` (Next.js static export, rebuilt with
  `npm run build` if source files are ever changed).

## Where finished videos go

Finished exports are auto-saved to `~/Downloads/AutoEditor`.
