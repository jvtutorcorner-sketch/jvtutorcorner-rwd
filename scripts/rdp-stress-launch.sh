#!/usr/bin/env bash
set -euo pipefail

DEFAULT_URL="https://www.jvtutorcorner.com"
DEFAULT_WAIT_SECONDS=45

MODE="${1:-}"
shift || true

ARG1="${1:-}"
shift || true

ARG2="${1:-}"
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
  if command -v xdg-open >/dev/null 2>&1; then
    nohup xdg-open "$url" >/dev/null 2>&1 &
  elif command -v chromium >/dev/null 2>&1; then
    nohup chromium --new-window "$url" >/dev/null 2>&1 &
  elif command -v google-chrome >/dev/null 2>&1; then
    nohup google-chrome --new-window "$url" >/dev/null 2>&1 &
  elif command -v firefox >/dev/null 2>&1; then
    nohup firefox "$url" >/dev/null 2>&1 &
  else
    echo "No browser found to open: $url"
    return 1
  fi
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
    if [ -n "$ARG1" ]; then
      bash -lc "$ARG1"
    else
      usage
      exit 1
    fi
    ;;
  --rdp-open)
    URL="${ARG1:-$DEFAULT_URL}"
    CMD="${ARG2:-}"
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
