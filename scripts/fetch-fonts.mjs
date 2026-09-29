// Downloads the caption typefaces into public/fonts/ if missing (keeps binaries
// out of git; runs automatically via the `postinstall` npm script).
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "public", "fonts");
const FONT_URLS = {
  "font-anton.ttf": "https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm0K0.ttf",
  "font-archivo.ttf": "https://fonts.gstatic.com/s/archivoblack/v23/HTxqL289NzCGg4MzN6KJ7eW6OYs.ttf",
};

const missing = Object.keys(FONT_URLS).filter((f) => !existsSync(path.join(DEST, f)));
if (!missing.length) {
  console.log("caption fonts already present");
  process.exit(0);
}
await mkdir(DEST, { recursive: true });
for (const f of missing) {
  try {
    const r = await fetch(FONT_URLS[f]);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(path.join(DEST, f), Buffer.from(await r.arrayBuffer()));
    console.log(`downloaded public/fonts/${f}`);
  } catch (e) {
    console.warn(`could not download ${f}: ${e.message}`);
  }
}
