#!/usr/bin/env bash
set -euo pipefail

DEFAULT_URL="https://www.jvtutorcorner.com"
DEFAULT_WAIT_SECONDS=45

MODE="${1:-}"
shift || true

WAIT_SECONDS="${WAIT_SECONDS:-$DEFAULT_WAIT_SECONDS}"

detect_display() {
  ps -eo args= 2>/dev/null | awk '
    /(^|[[:space:]])Xorg[[:space:]]+:[0-9]+/ {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^:[0-9]+$/) {
          d = $i ".0"
        }
      }
    }
    END { print d }
  '
}

wait_for_display() {
  local i display
  for i in $(seq 1 "$WAIT_SECONDS"); do
    display="${DISPLAY:-$(detect_display)}"
    if [ -n "$display" ]; then
      echo "$display"
      return 0
    fi
    sleep 1
  done
  return 1
}

open_browser() {
  local url="$1"
  local win_w=960
  local win_h=1080
  local win_x=0
  local win_y=0
  local -a browser_cmd=()

  # Get screen dimensions to split window
  if command -v xdpyinfo >/dev/null 2>&1; then
    local screen_w screen_h
    screen_w=$(xdpyinfo 2>/dev/null | grep "dimensions:" | awk '{print $2}' | cut -d'x' -f1) || screen_w=1920
    screen_h=$(xdpyinfo 2>/dev/null | grep "dimensions:" | awk '{print $2}' | cut -d'x' -f2 | cut -d' ' -f1) || screen_h=1080
    win_w=$((screen_w / 2 - 5))
    win_h=$screen_h
  fi

  if command -v chromium >/dev/null 2>&1; then
    browser_cmd=(chromium --new-window --window-size="$win_w,$win_h" --window-position="$win_x,$win_y" "$url")
  elif command -v google-chrome >/dev/null 2>&1; then
    browser_cmd=(google-chrome --new-window --window-size="$win_w,$win_h" --window-position="$win_x,$win_y" "$url")
  elif command -v firefox >/dev/null 2>&1; then
    browser_cmd=(firefox -new-window "$url")
  elif command -v xdg-open >/dev/null 2>&1; then
    # Fallback only: xdg-open can exist without a default browser association,
    # which produces "Failed to execute default Web Browser".
    browser_cmd=(xdg-open "$url")
  else
    echo "No browser found to open: $url"
    return 1
  fi

  nohup "${browser_cmd[@]}" >/dev/null 2>&1 &
}

open_terminal() {
  local cmd="$1"
  local term_cmd

  if [ -n "$cmd" ]; then
    term_cmd="$cmd; echo; echo '[DONE] Press Enter to close'; read -r"
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
    if [ -n "$cmd" ]; then
      bash -lc "$cmd"
    fi
    return 1
  fi
}

usage() {
  cat <<'EOF'
Usage:
  rdp-stress-launch.sh --ssh-only [command]
  rdp-stress-launch.sh --rdp-open [url] [command]

Examples:
  rdp-stress-launch.sh --ssh-only "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
  rdp-stress-launch.sh --rdp-open https://www.jvtutorcorner.com "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
EOF
}

case "$MODE" in
  --ssh-only)
    if [ "$#" -gt 0 ]; then
      bash -lc "$*"
    else
      usage
      exit 1
    fi
    ;;
  --rdp-open)
    URL="${1:-$DEFAULT_URL}"
    shift || true
    if [ "${1:-}" = "--" ]; then
      shift || true
    fi
    CMD="${*:-}"
    DISPLAY_VALUE="${DISPLAY:-$(wait_for_display || true)}"
    XAUTHORITY_VALUE="${XAUTHORITY:-/home/ubuntu/.Xauthority}"
    if [ -z "$DISPLAY_VALUE" ]; then
      echo "No active X display found after waiting ${WAIT_SECONDS}s."
      exit 1
    fi
    export DISPLAY="$DISPLAY_VALUE"
    export XAUTHORITY="$XAUTHORITY_VALUE"
    open_browser "$URL"
    open_terminal "$CMD"
    echo "Launched on DISPLAY=$DISPLAY"
    echo "Browser URL: $URL"
    if [ -n "$CMD" ]; then
      echo "Terminal command: $CMD"
    fi
    ;;
  "")
    usage
    exit 1
    ;;
  *)
    usage
    exit 1
    ;;
esac
