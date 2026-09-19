// Build the Linux distributable as a source zip. Unlike the Windows/mac builds
// there is NO single exe — Linux runs the raw Node backend and builds the UI on
// first run (the bundled `1 Run-Linux.sh` handles both: `npm install` in server/
// pulls an arch-specific ffmpeg-static binary, `npm run build` builds the UI).
// So we ship the exact source tree the run script expects; a user just unzips,
// runs `bash "1 Run-Linux.sh"`, and everything self-installs once over internet.
//
// No npm/node_modules needed to produce it — this script only packages files.
//
//   node build-dist-linux.mjs
//
// Produces:  dist/AutoEditorModv<VERSION>-Linux.zip
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, copyFileSync, cpSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = process.env.DIST_VERSION || "1.5";
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(os.tmpdir(), "autoeditor-build-linux");

function shellQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'"; }

// Everything the run script / UI build needs, repackaged like a fresh clone.
// Deliberately excludes build tooling, per-OS runners, dev/diagnostic junk and
// anything reproducible (node_modules/, out/, dist*/).
const FILES = [
  "1 Run-Linux.sh",
  "LICENSE",
  "README.md",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "vitest.config.mjs",
  "app",
  "components",
  "lib",
  "public",
  "server",
  "docs",
  "sample-test",
];
const EXCLUDED_DIRS = ["node_modules", "out", "dist", "dist-unified", "dist-win"];

async function main() {
  console.log("[1/3] Clean staging...");
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  console.log("[2/3] Copying source tree...");
  for (const name of FILES) {
    const src = path.join(ROOT, name);
    if (!existsSync(src)) { console.warn(`  (skipping missing entry: ${name})`); continue; }
    const dst = path.join(STAGE, name);
    if (name.includes(".")) {
      copyFileSync(src, dst);
    } else {
      cpSync(src, dst, { recursive: true, filter: (from) => {
        for (const ex of EXCLUDED_DIRS) {
          if (from.split(path.sep).includes(ex)) return false;
        }
        return true;
      } });
    }
  }

  console.log("[3/3] Zipping...");
  mkdirSync(DIST, { recursive: true }); // keep dist/ — only overwrite our own zip
  const zip = path.join(DIST, `AutoEditorModv${VERSION}-Linux.zip`);
  rmSync(zip, { force: true });
  execSync(`zip -r -q ${shellQuote(zip)} .`, { cwd: STAGE, stdio: "inherit" });
  rmSync(STAGE, { recursive: true, force: true });
  console.log("\nDone. Share:  " + zip);
}

main().catch((e) => { console.error("BUILD FAILED:", e.message); process.exit(1); });