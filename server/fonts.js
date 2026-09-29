// Ensures the bundled caption typefaces exist, downloading them from Google
// Fonts on first run if they are missing (keeps the repo free of binaries and
// makes a fresh clone work out of the box).
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(MODULE_DIR, "assets", "fonts");

// Public Google Fonts TTFs (stable gstatic URLs, same files as the repo's).
const FONT_URLS = {
  "font-anton.ttf": "https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm0K0.ttf",
  "font-archivo.ttf": "https://fonts.gstatic.com/s/archivoblack/v23/HTxqL289NzCGg4MzN6KJ7eW6OYs.ttf",
};

export async function ensureCaptionFonts() {
  const missing = Object.keys(FONT_URLS).filter((f) => !existsSync(path.join(FONTS_DIR, f)));
  if (!missing.length) return;
  await mkdir(FONTS_DIR, { recursive: true });
  await Promise.all(missing.map(async (f) => {
    try {
      const r = await fetch(FONT_URLS[f]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await writeFile(path.join(FONTS_DIR, f), Buffer.from(await r.arrayBuffer()));
      console.log(`Downloaded caption font ${f}`);
    } catch (e) {
      console.warn(`Could not download caption font ${f}: ${e.message} — that typeface will fall back to Classic.`);
    }
  }));
}

export { FONTS_DIR };
