#!/usr/bin/env bash
# bootstrap-ec2.sh
#
# One-time setup for an Ubuntu EC2 node that will run Playwright / Node tests.
# It checks for the required system packages, installs anything missing, then
# installs project dependencies and Playwright Chromium before optionally
# running the command you pass in after `--`.
#
# Usage:
#   bash e2e/scripts/bootstrap-ec2.sh
#   bash e2e/scripts/bootstrap-ec2.sh -- npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium
#   bash e2e/scripts/bootstrap-ec2.sh -- bash -lc 'STRESS_GROUP_COUNT=1 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_root_tools() {
  have_cmd sudo || die "sudo is required on this EC2 host."
  have_cmd apt-get || die "apt-get is required. This bootstrap script targets Ubuntu/Debian EC2 images."
}

install_missing_apt_packages() {
  local -a packages=("$@")
  local -a missing=()
  local pkg

  for pkg in "${packages[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    log ">>> System packages already installed."
    return 0
  fi

  log ">>> Installing system packages: ${missing[*]}"
  sudo apt-get update
  DEBIAN_FRONTEND=noninteractive sudo apt-get install -y "${missing[@]}"
}

ensure_node_20() {
  local current_major="0"

  if have_cmd node; then
    current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  fi

  if [[ "$current_major" -lt 20 ]]; then
    log ">>> Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    DEBIAN_FRONTEND=noninteractive sudo apt-get install -y nodejs
  fi

  log "Node: $(node -v)  npm: $(npm -v)"
}

install_project_deps() {
  if [[ -f package-lock.json ]]; then
    log ">>> Installing project dependencies with npm ci..."
    npm ci --ignore-scripts
  else
    log ">>> package-lock.json not found; falling back to npm install..."
    npm install --ignore-scripts
  fi
}

install_playwright_chromium() {
  log ">>> Installing Playwright Chromium browser..."
  npx playwright install --with-deps chromium
}

run_command_if_provided() {
  if [[ $# -eq 0 ]]; then
    log ""
    log "✓ Bootstrap complete."
    log "  Next steps:"
    log "    1. Export your EC2/stress env vars or source .env.stress"
    log "    2. Run a test, for example:"
    log "       npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium"
    return 0
  fi

  if [[ "${1:-}" == "--" ]]; then
    shift
  fi

  [[ $# -gt 0 ]] || die "No command provided after --."

  log ">>> Running command: $*"
  exec "$@"
}

main() {
  cd "$PROJECT_ROOT"

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    log ">>> Detected OS: ${PRETTY_NAME:-unknown}"
  fi

  require_root_tools

  install_missing_apt_packages \
    git curl ca-certificates unzip \
    build-essential python3 python3-pip pkg-config \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 libwayland-client0 \
    xvfb fonts-noto-cjk

  ensure_node_20
  install_project_deps
  install_playwright_chromium
  run_command_if_provided "$@"
}

main "$@"
