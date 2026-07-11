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
#   bash e2e/scripts/bootstrap-ec2.sh --diagnose
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

ensure_npm_toolchain() {
  if have_cmd npm && have_cmd npx; then
    log ">>> npm/npx already available."
    return 0
  fi

  log ">>> npm/npx not found; installing the npm toolchain..."
  DEBIAN_FRONTEND=noninteractive sudo apt-get install -y npm

  have_cmd npm || die "npm is still missing after installation."
  have_cmd npx || die "npx is still missing after installation."

  log "npm: $(npm -v)  npx: $(npx --version)"
}

ensure_optional_k6() {
  if have_cmd k6; then
    log ">>> k6 already available."
    return 0
  fi

  if [[ "${INSTALL_K6:-0}" != "1" ]]; then
    log ">>> k6 not installed (optional). Set INSTALL_K6=1 to install it."
    return 0
  fi

  log ">>> INSTALL_K6=1 detected; installing k6..."
  if have_cmd brew; then
    brew install k6
    return 0
  fi

  if have_cmd apt-get; then
    sudo apt-get update
    sudo apt-get install -y k6
    return 0
  fi

  die "k6 installation requested, but no supported package manager was found."
}

diagnose_environment() {
  local failures=0
  local -a fixes=()

  add_fix() {
    fixes+=("$1")
  }

  mark_fail() {
    failures=$((failures + 1))
  }

  log ""
  log "=== EC2 Environment Diagnostics ==="

  if have_cmd node; then
    log "node: $(node -v)"
  else
    log "node: MISSING"
    mark_fail
    add_fix "Install Node.js 20: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  fi

  if have_cmd npm; then
    log "npm: $(npm -v)"
  else
    log "npm: MISSING"
    mark_fail
    add_fix "If node is installed but npm is missing, run: sudo apt-get install -y npm"
  fi

  if have_cmd npx; then
    log "npx: $(npx --version)"
  else
    log "npx: MISSING"
    mark_fail
    add_fix "Reinstall npm toolchain: sudo apt-get install -y npm"
  fi

  if node -e "require.resolve('@playwright/test')" >/dev/null 2>&1; then
    log "@playwright/test: OK"
  else
    log "@playwright/test: MISSING"
    mark_fail
    add_fix "Run project dependency install: npm ci --ignore-scripts"
  fi

  if [[ -f playwright.config.ts ]]; then
    log "playwright.config.ts: FOUND"
    if npx playwright test --config=playwright.config.ts --list >/dev/null 2>&1; then
      log "playwright.config.ts load: OK"
    else
      log "playwright.config.ts load: FAILED"
      mark_fail
      add_fix "Reinstall Playwright project deps, then validate config: npm ci --ignore-scripts && npx playwright test --config=playwright.config.ts --list"
    fi
  else
    log "playwright.config.ts: MISSING"
    mark_fail
    add_fix "Ensure you are inside the repo root before running the script."
  fi

  if have_cmd npx && npx playwright --version >/dev/null 2>&1; then
    log "playwright cli: OK ($(npx playwright --version 2>/dev/null | tr -d '\r'))"
  else
    log "playwright cli: MISSING"
    mark_fail
    add_fix "Install project deps first: npm ci --ignore-scripts"
  fi

  if have_cmd npx && npx playwright install --dry-run chromium >/dev/null 2>&1; then
    log "chromium browser: OK or installable"
  else
    log "chromium browser: MISSING or not yet installable"
    mark_fail
    add_fix "Install Chromium and system deps: npx playwright install --with-deps chromium"
  fi

  if have_cmd k6; then
    log "k6: $(k6 version 2>/dev/null | tr -d '\r')"
  else
    log "k6: MISSING (optional)"
  fi

  log ""
  log "--- Suggested Fixes ---"
  if [[ ${#fixes[@]} -eq 0 ]]; then
    log "No blocking issues detected."
  else
    local fix
    for fix in "${fixes[@]}"; do
      log "- $fix"
    done
  fi

  log ""
  log "Exit status suggestion: ${failures} blocking issue(s) detected."
  log "=================================="
  log ""

  return "$failures"
}

ensure_playwright_dependency() {
  if node -e "require.resolve('@playwright/test')" >/dev/null 2>&1; then
    log ">>> @playwright/test is available."
    return 0
  fi

  log ">>> @playwright/test is missing; reinstalling project dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci --ignore-scripts
  else
    npm install --ignore-scripts
  fi

  node -e "require.resolve('@playwright/test')" >/dev/null 2>&1 \
    || die "@playwright/test is still missing after reinstalling dependencies."
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

  if [[ "${1:-}" == "--diagnose" ]]; then
    diagnose_environment
    diag_exit=$?
    if [[ "$diag_exit" -ne 0 ]]; then
      exit "$diag_exit"
    fi
    shift
  fi

  install_missing_apt_packages \
    git curl ca-certificates unzip \
    build-essential python3 python3-pip pkg-config \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 libwayland-client0 \
    xvfb fonts-noto-cjk

  ensure_node_20
  ensure_npm_toolchain
  install_project_deps
  ensure_playwright_dependency
  install_playwright_chromium
  ensure_optional_k6
  run_command_if_provided "$@"
}

main "$@"
