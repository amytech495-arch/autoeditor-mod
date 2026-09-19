// Build the single cross-platform distributable: ALL desktops in ONE zip.
//
// Instead of separate zips for each OS, this ships the full source tree plus a
// pre-built UI and all four "1 Run-*" launchers, so a user picks the launcher
// for their machine (Windows / macOS Intel / macOS Apple Silicon / Linux):
//
//   1. unzip AutoEditorModv<VERSION>.zip
//   2. run the launcher for your OS (double-click, or bash on Linux)
//   3. first run only: it installs the small backend, which pulls an
//      arch-specific ffmpeg binary for your machine, then serves the app at
//      http://localhost:4000 and opens your browser.
//
// The UI (out/) is included pre-built, so nothing needs compiling at runtime.
//
//   node build-dist-unified.mjs
//
// Produces:  dist/AutoEditorModv<VERSION>.zip
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = process.env.DIST_VERSION || "1.5";
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(os.tmpdir(), "autoeditor-build-unified");
const OUT = path.join(STAGE, `AutoEditorModv${VERSION}`);

function run(cmd, cwd = ROOT) { console.log("> " + cmd); execSync(cmd, { cwd, stdio: "inherit" }); }
function shellQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'"; }

// The four launchers, the piece of source the run scripts / UI build expect,
// and the pre-built UI. Deliberately excludes build tooling, per-OS runners,
// dev/diagnostic junk and anything reproducible (node_modules/, .next/, dist*/).
const FILES = [
  "1 Run-Windows.bat",
  "1 Run-Linux.sh",
  "1 Run-macOS-Intel.command",
  "1 Run-macOS-Silicon.command",
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
  "out",
];
const EXCLUDED_DIRS = ["node_modules", ".next", "dist", "dist-unified", "dist-win", "soundeffects"];

const RUN_README = `AutoEditor Mod v${VERSION} — runs entirely on your machine. Nothing is uploaded.

ONE ZIP, EVERY DESKTOP
  This single zip works on Windows, macOS (Intel + Apple Silicon) and Linux.
  Pick the launcher for your computer:

    Windows             1 Run-Windows.bat            (double-click)
    macOS (Apple Silicon)  1 Run-macOS-Silicon.command   (double-click)
    macOS (Intel)       1 Run-macOS-Intel.command    (double-click)
    Linux               1 Run-Linux.sh               (run in a terminal:  ./1 Run-Linux.sh )

FIRST RUN
  One-time: the launcher downloads a tiny backend that includes an ffmpeg video
  encoder picked automatically for your OS and CPU, then starts the app at
  http://localhost:4000 and opens your browser. The app UI is already built and
  included in this zip — there is nothing to compile.

REQUIREMENTS
  Node.js LTS from https://nodejs.org installed and on your PATH.
  macOS: Gatekeeper may ask about the .command the first time — right-click it
  and choose Open, then Open again.

KEEP THE LAUNCHER WINDOW OPEN while you use the app; closing it stops the app.
Your finished videos are also auto-saved to <your Downloads>/AutoEditor
(~\\\\Downloads\\\\AutoEditor on Windows, ~/Downloads/AutoEditor on mac/Linux).
`;

async function main() {
  console.log("[1/4] Building the app UI...");
  if (!existsSync(path.join(ROOT, "node_modules"))) run("npm install");
  run("npm run build");

  console.log("[2/4] Clean staging...");
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  console.log("[3/4] Packaging source tree + pre-built UI + launchers...");
  for (const name of FILES) {
    const src = path.join(ROOT, name);
    if (!existsSync(src)) { console.warn(`  (skipping missing entry: ${name})`); continue; }
    const dst = path.join(OUT, name);
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
  writeFileSync(path.join(OUT, "README - how to run.txt"), RUN_README.replace(/\r\n/g, "\n"));

  console.log("[4/4] Zipping...");
  mkdirSync(DIST, { recursive: true }); // keep dist/ — only overwrite our own zip
  const zip = path.join(DIST, `AutoEditorModv${VERSION}.zip`);
  rmSync(zip, { force: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force"`,
      { cwd: STAGE, stdio: "inherit" },
    );
  } else {
    execSync(`zip -r -q ${shellQuote(zip)} ${shellQuote(path.basename(OUT))}`, { cwd: STAGE, stdio: "inherit" });
  }
  rmSync(STAGE, { recursive: true, force: true });
  console.log("\nDone. Share:  " + zip);
}

main().catch((e) => { console.error("BUILD FAILED:", e.message); process.exit(1); });