#!/usr/bin/env bash
# AutoEditor — run the app on macOS (Intel x86_64).
#
# Starts the local render backend, which also serves the built UI on
# http://localhost:4000 and opens your browser. Mirrors the Windows start.bat.
#
# First run only: installs backend (ffmpeg) deps and builds the UI. Your
# finished videos are also auto-saved to ~/Downloads/AutoEditor.
#
# For the dev loop instead (hot-reload UI at :3000 with the backend at :4000):
#   NEXT_PUBLIC_RENDER_URL=http://localhost:4000 npm run dev   (terminal 1)
#   OPEN_BROWSER=1 node server/index.js                        (terminal 2)

set -e
cd "$(dirname "$0")"

BOLD=$'\033[1m'
DIM=$'\033[2m'
OFF=$'\033[0m'
say()  { printf "${BOLD}%s${OFF}\n" "$*"; }
info() { printf "${DIM}%s${OFF}\n" "$*"; }

# Show a native error dialog (macOS: osascript; Linux: zenity/kdialog/xmessage).
# Falls back to stderr when no GUI tool is available, so headless still works.
popup() {
  local title="$1" msg="$2" t m
  if command -v osascript >/dev/null 2>&1; then
    t=${title//\\/\\\\}; t=${t//\"/\\\"}
    m=${msg//\\/\\\\}; m=${m//\"/\\\"}; m=${m//|/$'\n'}; m=${m//$'\n'/$'\\n'}
    osascript -e "display alert \"$t\" message \"$m\" as critical buttons {\"OK\"} default button \"OK\"" >/dev/null 2>&1 && return 0
  fi
  command -v zenity   >/dev/null 2>&1 && { zenity --error --title="$title" --text="$msg" >/dev/null 2>&1 && return 0; }
  command -v kdialog  >/dev/null 2>&1 && { kdialog --title "$title" --error "$msg" >/dev/null 2>&1 && return 0; }
  command -v xmessage >/dev/null 2>&1 && { xmessage -center "$title: $msg" >/dev/null 2>&1 && return 0; }
  return 1
}
die()  { popup "AutoEditor — Setup Error" "$*" || true; printf "Error: %s\n" "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js is not installed. Get it from https://nodejs.org (LTS, macOS x64) and run this again."

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) SAY_ARCH="Intel" ;;
  arm64)  SAY_ARCH="Apple Silicon"
          info "Note: this script targets Intel Macs. You're on Apple Silicon —"
          info "the ffmpeg binary will be reinstalled for arm64, which still works."
          ;;
  *) die "Unsupported macOS architecture: $ARCH" ;;
esac

# Does the installed ffmpeg-static binary match this machine's architecture?
# node_modules copied from another Mac will have the wrong binary and fail.
FF_BIN="server/node_modules/ffmpeg-static/ffmpeg"
bin_ok() {
  command -v file >/dev/null 2>&1 || return 0
  local info status
  info=$(file "$FF_BIN" 2>/dev/null); status=$?
  [ "$status" -ne 0 ] && return 1
  case "$ARCH" in
    x86_64) echo "$info" | grep -Eq "x86[-_]64" ;;
    *)      echo "$info" | grep -Eq "arm64" ;;
  esac
}

say ""
say "AutoEditor — macOS ($SAY_ARCH)"
say "============================================================"

# 1) Backend dependencies (ffmpeg-static downloads an arch-specific binary).
if [ ! -d server/node_modules ] || [ ! -x "$FF_BIN" ]; then
  command -v npm >/dev/null 2>&1 || die "npm is missing (Node.js is installed without npm?)."
  info "Installing backend dependencies (ffmpeg is downloaded for $(uname -m))…"
  ( cd server && npm install ) || die "Could not install backend dependencies.|Check your internet connection and run this script again."
elif ! bin_ok; then
  info "ffmpeg doesn't match this machine's architecture (node_modules copied from another Mac?) — reinstalling it."
  rm -rf server/node_modules/ffmpeg-static
  ( cd server && npm install ffmpeg-static ) || die "Could not reinstall ffmpeg for your Mac architecture.|Check your internet connection and run this script again."
fi

# 2) Build the UI once (next build → out/). Skips when out/index.html already exists.
if [ ! -f out/index.html ]; then
  info "Building the app UI (first run only)…"
  [ -d node_modules ] || npm install || die "Could not install the app UI dependencies.|Check your internet connection and run this script again."
  npm run build || die "Failed to build the app UI.|See the messages above for details, then run this script again."
fi

# 3) Happy-path banner, then run in the foreground. Closing this window stops it.
say ""
say "AutoEditor is starting at http://localhost:4000"
say "Your browser will open automatically. Keep this window open."
say "To STOP the app: press Ctrl+C or close this window."
say "============================================================"
echo
OPEN_BROWSER=1 node server/index.js