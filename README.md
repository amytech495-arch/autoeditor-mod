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

```bash
npm install
npm run dev
```

Open http://localhost:4000 (see the printed URL).

### Production build

```bash
npm run build
npm start
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