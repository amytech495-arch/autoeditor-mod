# AutoEditor Mod

Turn timestamp-named images plus a voiceover into an MP4 — entirely on your own machine. Nothing is uploaded to the internet.

## Screenshots

<img src="screenshots/editor-1.png" width="720" alt="AutoEditor Mod — editor" />

<img src="screenshots/editor-2.png" width="720" alt="AutoEditor Mod — editor" />

<img src="screenshots/editor-timeline.png" width="720" alt="AutoEditor Mod — timeline" />

## Features

- **Image Effects** — apply one of 12 effects per clip (B&W, Sepia, Warm, Cool, Film Grain, Noise, Heavy Noise, Vignette, VHS, Grunge, Dust) with an intensity slider.
- **Editing** — drag-and-drop image import, per-clip trim, fit mode (cover / contain), drag-reorder in the timeline.
- **Transitions** — fade, wipe, zoom, slide with adjustable duration.
- **Audio** — multiple audio layers, per-layer volume, automatic voice/music sync.
- **Text** — subtitle overlay from SRT/SSA or timestamped transcripts, with style, size, and entrance-animation controls.
- **Overlays & Watermark** — video/image overlay with opacity and blend modes; optional persistent watermark.
- **Export** — full resolution, 720p, or **4K UHD**; 24/30/60 fps; WebCodecs (browser-native) and FFmpeg rendering with a real-time progress bar.
- **Project** — save and resume full project state as a JSON file.

## Quick Start

Requires **Node.js** (LTS, from https://nodejs.org). Then run the launcher for your platform:

| Platform | Run |
| --- | --- |
| Windows | Double-click `1 Run-Windows.bat` |
| macOS (Apple Silicon / M-series) | Double-click `1 Run-macOS-Silicon.command` |
| macOS (Intel) | Double-click `1 Run-macOS-Intel.command` |
| Linux | `./1 Run-Linux.sh` in a terminal |

First run only: the script installs dependencies and builds the UI once. Afterwards it starts the app at http://localhost:4000, opens your browser, and auto-saves finished videos to `~/Downloads/AutoEditor`.

**Keep the launcher window open** while you use the app — closing it (or pressing Ctrl+C) stops the server. Requires Node.js on PATH.

### Development mode

```bash
npm install
NEXT_PUBLIC_RENDER_URL=http://localhost:4000 npm run dev   # terminal 1 — UI on :3000
OPEN_BROWSER=1 node server/index.js                        # terminal 2 — backend on :4000
```

### Tests

```bash
npm test
```

## Sidecar server (FFmpeg / local render)

The app runs fully in the browser, but an optional sidecar server enables FFmpeg rendering and adds PNG/office import. See `server/` — it is bundled into the distributed builds so users don't install anything.

## Distributed builds

Prebuilt folders for Windows, macOS, and termux are produced by:

- `build-dist.mjs`
- `build-dist-mac.mjs`
- `build-dist-termux.mjs`

End users just double-click `AutoEditor.exe` (or the equivalent launcher) — see `dist-assets/READ ME FIRST.txt` for the user guide.

## Changelog

See [`dist-assets/changelog.txt`](dist-assets/changelog.txt) for version history. Current: **Version 1.2**.