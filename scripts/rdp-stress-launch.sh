#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3000}"
CMD="${2:-}"

detect_display() {
  ps -eo args= 2>/dev/null | awk '/(^|[[:space:]])Xorg[[:space:]]+:[0-9]+/ {
    for (i = 1; i <= NF; i++) if ($i ~ /^:[0-9]+$/) { print $i ".0"; exit }
  }'
}

DISPLAY_VALUE="${DISPLAY:-$(detect_display)}"
XAUTHORITY_VALUE="${XAUTHORITY:-/home/ubuntu/.Xauthority}"

if [ -z "$DISPLAY_VALUE" ]; then
  echo "No active X display found."
  exit 1
fi

export DISPLAY="$DISPLAY_VALUE"
export XAUTHORITY="$XAUTHORITY_VALUE"

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    nohup xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v chromium >/dev/null 2>&1; then
    nohup chromium --new-window "$URL" >/dev/null 2>&1 &
  elif command -v google-chrome >/dev/null 2>&1; then
    nohup google-chrome --new-window "$URL" >/dev/null 2>&1 &
  elif command -v firefox >/dev/null 2>&1; then
    nohup firefox "$URL" >/dev/null 2>&1 &
  else
    echo "No browser found to open: $URL"
  fi
}

open_terminal() {
  local term_cmd
  if [ -n "$CMD" ]; then
    term_cmd="$CMD; echo; echo '[DONE] Press Enter to close'; read -r"
  else
    term_cmd='echo "[INFO] Terminal opened from SSH launcher"; exec bash'
  fi

  if command -v xfce4-terminal >/dev/null 2>&1; then
    nohup xfce4-terminal --hold --command "bash -lc '$term_cmd'" >/dev/null 2>&1 &
  elif command -v gnome-terminal >/dev/null 2>&1; then
    nohup gnome-terminal -- bash -lc "$term_cmd" >/dev/null 2>&1 &
  elif command -v xterm >/dev/null 2>&1; then
    nohup xterm -e bash -lc "$term_cmd" >/dev/null 2>&1 &
  else
    echo "No terminal emulator found."
    if [ -n "$CMD" ]; then
      bash -lc "$CMD"
    fi
  fi
}

open_browser
open_terminal

echo "Launched on DISPLAY=$DISPLAY"
echo "Browser URL: $URL"
if [ -n "$CMD" ]; then
  echo "Terminal command: $CMD"
fi
