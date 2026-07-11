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
export CI=1
export npm_config_progress=false
export npm_config_audit=false
export npm_config_fund=false

log() {
  printf '%s\n' "$*"
}

step_start() {
  log ">>> START: $*"
}

step_done() {
  log ">>> DONE: $*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  if ! have_cmd node; then
    echo 0
    return 0
  fi

  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

require_root_tools() {
  have_cmd sudo || die "sudo is required on this EC2 host."
  have_cmd apt-get || die "apt-get is required. This bootstrap script targets Ubuntu/Debian EC2 images."
}

apt_package_exists() {
  apt-cache show "$1" >/dev/null 2>&1
}

pick_apt_package() {
  local preferred="$1"
  local fallback="$2"

  if apt_package_exists "$preferred"; then
    echo "$preferred"
    return 0
  fi

  echo "$fallback"
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

  step_start "Installing system packages: ${missing[*]}"
  sudo apt-get update
  DEBIAN_FRONTEND=noninteractive sudo apt-get install -y "${missing[@]}"
  step_done "System packages installed"
}

install_playwright_system_deps() {
  local asound_pkg
  asound_pkg="$(pick_apt_package libasound2t64 libasound2)"

  install_missing_apt_packages \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 "${asound_pkg}" libatspi2.0-0 libwayland-client0 \
    xvfb fonts-noto-cjk
}

ensure_node_22() {
  local current_major="0"

  current_major="$(node_major_version)"

  if [[ "$current_major" -lt 22 ]]; then
    step_start "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    DEBIAN_FRONTEND=noninteractive sudo apt-get install -y nodejs
    step_done "Node.js 22 installed"
  fi

  log "Node: $(node -v)  npm: $(npm -v)"
}

ensure_npm_toolchain() {
  if have_cmd npm && have_cmd npx; then
    log ">>> npm/npx already available."
    return 0
  fi

  step_start "Installing npm toolchain"
  DEBIAN_FRONTEND=noninteractive sudo apt-get install -y npm

  have_cmd npm || die "npm is still missing after installation."
  have_cmd npx || die "npx is still missing after installation."

  log "npm: $(npm -v)  npx: $(npx --version)"
  step_done "npm toolchain installed"
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

  step_start "Installing k6"
  if have_cmd brew; then
    brew install k6
    step_done "k6 installed"
    return 0
  fi

  if have_cmd apt-get; then
    sudo apt-get update
    sudo apt-get install -y k6
    step_done "k6 installed"
    return 0
  fi

  die "k6 installation requested, but no supported package manager was found."
}

check_host_resources() {
  local cpu_count mem_total_mb mem_available_mb swap_total_mb swap_free_mb load_1m
  local warn=0

  cpu_count="$(nproc 2>/dev/null || echo 1)"
  mem_total_mb="$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  mem_available_mb="$(awk '/MemAvailable/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  swap_total_mb="$(awk '/SwapTotal/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  swap_free_mb="$(awk '/SwapFree/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
  load_1m="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"

  log ""
  log "=== EC2 Host Resources ==="
  log "CPU cores       : ${cpu_count}"
  log "RAM total       : ${mem_total_mb} MB"
  log "RAM available   : ${mem_available_mb} MB"
  log "Swap total      : ${swap_total_mb} MB"
  log "Swap free       : ${swap_free_mb} MB"
  log "Load average 1m : ${load_1m}"

  if [[ "$cpu_count" -lt 2 ]]; then
    warn=1
  fi
  if [[ "$mem_total_mb" -lt 4096 || "$mem_available_mb" -lt 1024 ]]; then
    warn=1
  fi
  if [[ "$swap_total_mb" -eq 0 ]]; then
    warn=1
  fi

  if [[ "$warn" -eq 1 ]]; then
    log "⚠ 建議升規：目前 CPU / RAM / swap 對 npm ci + Playwright 偏緊。"
    log "  建議至少 2 vCPU / 4 GB RAM；若要穩定跑 Playwright，建議 4 vCPU / 8 GB RAM。"
  else
    log "✓ Host resources look reasonable for bootstrap and test runs."
  fi
  log "============================"
}

repair_environment_from_diagnostics() {
  log ""
  log "=== EC2 Auto-Fix Mode ==="
  log "Applying bootstrap repairs in dependency order..."

  ensure_node_22
  ensure_npm_toolchain
  install_project_deps
  ensure_playwright_dependency
  install_playwright_chromium
  ensure_optional_k6

  log "=== Auto-Fix Complete ==="
  log ""
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
  check_host_resources

  if have_cmd node; then
    log "node: $(node -v)"
    if [[ "$(node_major_version)" -lt 22 ]]; then
      log "node major: BELOW 22"
      mark_fail
      add_fix "Upgrade Node.js to 22+: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    else
      log "node major: OK"
    fi
  else
    log "node: MISSING"
    mark_fail
    add_fix "Install Node.js 22: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
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

  step_start "@playwright/test is missing; reinstalling project dependencies"
  if [[ -f package-lock.json ]]; then
    npm ci --ignore-scripts
  else
    npm install --ignore-scripts
  fi

  node -e "require.resolve('@playwright/test')" >/dev/null 2>&1 \
    || die "@playwright/test is still missing after reinstalling dependencies."
  step_done "@playwright/test restored"
}

install_project_deps() {
  if [[ -f package-lock.json ]]; then
    step_start "Installing project dependencies with npm ci"
    npm ci --ignore-scripts
    log ">>> npm ci completed"
    step_done "Project dependencies installed"
  else
    step_start "package-lock.json not found; falling back to npm install"
    npm install --ignore-scripts
    log ">>> npm install completed"
    step_done "Project dependencies installed"
  fi
}

install_playwright_chromium() {
  step_start "Installing Playwright Chromium browser"
  npx playwright install --with-deps chromium
  log ">>> playwright install completed"
  step_done "Playwright Chromium browser installed"
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

  local -a env_prefix=()
  local -a cmd=()
  local arg
  local saw_command=0

  for arg in "$@"; do
    if [[ "$saw_command" -eq 0 && "$arg" == *=* && "$arg" != *=*' '* ]]; then
      env_prefix+=("$arg")
    else
      saw_command=1
      cmd+=("$arg")
    fi
  done

  [[ ${#cmd[@]} -gt 0 ]] || die "No executable command found after environment assignments."

  if [[ ${#env_prefix[@]} -gt 0 ]]; then
    log ">>> Env prefix: ${env_prefix[*]}"
  fi
  log ">>> Running command: ${cmd[*]}"

  if [[ ${#env_prefix[@]} -gt 0 ]]; then
    exec env "${env_prefix[@]}" "${cmd[@]}"
  else
    exec "${cmd[@]}"
  fi
}

main() {
  cd "$PROJECT_ROOT"
  local diagnose_mode=0
  local fix_mode=0

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    log ">>> Detected OS: ${PRETTY_NAME:-unknown}"
  fi

  require_root_tools

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --diagnose)
        diagnose_mode=1
        shift
        ;;
      --fix)
        fix_mode=1
        shift
        ;;
      --)
        shift
        break
        ;;
      *)
        break
        ;;
    esac
  done

  if [[ "$diagnose_mode" -eq 1 ]]; then
    set +e
    diagnose_environment
    diag_exit=$?
    if [[ "$fix_mode" -eq 1 ]]; then
      repair_environment_from_diagnostics
      diagnose_environment
      diag_exit=$?
    fi
    set -e
    exit "$diag_exit"
  fi

  install_missing_apt_packages \
    git curl ca-certificates unzip \
    build-essential python3 python3-pip pkg-config
  install_playwright_system_deps

  ensure_node_22
  ensure_npm_toolchain
  install_project_deps
  ensure_playwright_dependency
  install_playwright_chromium
  ensure_optional_k6
  run_command_if_provided "$@"
}

main "$@"
