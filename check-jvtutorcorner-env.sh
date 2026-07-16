#!/usr/bin/env bash
# check-jvtutorcorner-env.sh
# JV Tutor Corner - EC2 環境診斷 + 自動修復
# Ubuntu 24.04 | Xfce4 + XRDP + Chromium + Xvfb

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BLUE='\033[0;34m';   BOLD='\033[1m'; RESET='\033[0m'
OK="${GREEN}[OK]${RESET}   "
WARN="${YELLOW}[WARN]${RESET} "
ERR="${RED}[ERROR]${RESET}"
FIX="${BLUE}[FIX]${RESET}  "
DONE="${GREEN}[DONE]${RESET}"
FAIL="${RED}[FAIL]${RESET}"

DEBUG_LOGS=1
for arg in "${@:-}"; do
  case "$arg" in
    --no-debug-logs) DEBUG_LOGS=0 ;;
    --debug-logs|--diagnose|--troubleshoot) DEBUG_LOGS=1 ;;
  esac
done

FIXED=0; FAILED=0

section() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; echo -e "  ${CYAN}─────────────────────────────────${RESET}"; }
ok()      { echo -e "  ${OK}  $*"; }
wn()      { echo -e "  ${WARN} $*"; }
er()      { echo -e "  ${ERR} $*"; }
doing()   { echo -e "\n  ${FIX}  ${BLUE}自動修復：$*${RESET}"; }
pass_fix(){ echo -e "  ${DONE} $*"; ((FIXED++)); }
fail_fix(){ echo -e "  ${FAIL} 修復失敗：$* （請手動處理）"; ((FAILED++)); }

detect_xfce_launcher() {
  sudo -u ubuntu bash -lc 'command -v startxfce4 >/dev/null 2>&1 && command -v startxfce4 || (command -v xfce4-session >/dev/null 2>&1 && command -v xfce4-session || true)'
}

fix_broken_apt() {
  doing "修復 broken apt 依賴..."
  sudo apt --fix-broken install -y 2>/dev/null || sudo apt-get -f install -y 2>/dev/null || true
}

ensure_xfce_packages() {
  doing "補齊 XFCE / XRDP 套件..."
  sudo apt-get update -qq 2>/dev/null || true
  sudo apt-get install -y \
    xrdp \
    xorgxrdp \
    xfce4 \
    xfce4-session \
    xfce4-panel \
    xfdesktop4 \
    xfce4-settings \
    thunar \
    dbus-x11 \
    x11-xserver-utils 2>/dev/null || true
}

write_xfce_session_files() {
  local launcher="$1"
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"

  if [ -z "$launcher" ]; then
    launcher="/usr/bin/xfce4-session"
  fi

  cat <<EOF | sudo tee "$xs" > /dev/null
#!/bin/sh
exec $launcher
EOF
  sudo chmod 755 "$xs"
  sudo chown ubuntu:ubuntu "$xs"

  cat <<EOF | sudo tee "$xinitrc" > /dev/null
#!/bin/sh
exec $launcher
EOF
  sudo chmod 755 "$xinitrc"
  sudo chown ubuntu:ubuntu "$xinitrc"
}

collect_rdp_debug_logs() {
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"
  local xsession_errors="/home/ubuntu/.xsession-errors"
  local xfce_conf="/home/ubuntu/.config/xfce4"
  local session_cache="/home/ubuntu/.cache/sessions"

  echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║  XRDP / Xsession 排錯資訊                ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"

  echo -e "  ${BLUE}[INFO]${RESET} systemctl status xrdp"
  systemctl --no-pager -l status xrdp 2>/dev/null | tail -n 40 | sed 's/^/    /' || true

  echo -e "  ${BLUE}[INFO]${RESET} systemctl status xrdp-sesman"
  systemctl --no-pager -l status xrdp-sesman 2>/dev/null | tail -n 40 | sed 's/^/    /' || true

  echo -e "  ${BLUE}[INFO]${RESET} journalctl -u xrdp -u xrdp-sesman"
  journalctl -u xrdp -u xrdp-sesman -n 80 --no-pager 2>/dev/null | sed 's/^/    /' || true

  if [ -f "$xsession_errors" ]; then
    echo -e "  ${BLUE}[INFO]${RESET} ~/.xsession-errors"
    tail -n 80 "$xsession_errors" 2>/dev/null | sed 's/^/    /' || true
  fi

  if [ -f "$xs" ]; then
    echo -e "  ${BLUE}[INFO]${RESET} ~/.xsession"
    sed -n '1,20p' "$xs" 2>/dev/null | sed 's/^/    /' || true
  fi

  if [ -f "$xinitrc" ]; then
    echo -e "  ${BLUE}[INFO]${RESET} ~/.xinitrc"
    sed -n '1,20p' "$xinitrc" 2>/dev/null | sed 's/^/    /' || true
  fi

  if [ -d "$xfce_conf" ]; then
    echo -e "  ${BLUE}[INFO]${RESET} ~/.config/xfce4"
    find "$xfce_conf" -maxdepth 2 -type f 2>/dev/null | head -n 20 | sed 's/^/    /' || true
  fi

  if [ -d "$session_cache" ]; then
    echo -e "  ${BLUE}[INFO]${RESET} ~/.cache/sessions"
    find "$session_cache" -maxdepth 1 -type f 2>/dev/null | sed 's/^/    /' || true
  fi

  echo -e "  ${BLUE}[INFO]${RESET} 若只看到藍屏，可手動重置 XFCE："
  echo -e "    mv /home/ubuntu/.config/xfce4 /home/ubuntu/.config/xfce4.bak"
  echo -e "    mv /home/ubuntu/.cache/sessions /home/ubuntu/.cache/sessions.bak"
}

repair_xfce_desktop() {
  doing "修復 XFCE 桌面元件..."
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"
  local launcher
  launcher="$(detect_xfce_launcher)"
  ensure_xfce_packages

  sudo -u ubuntu bash -lc 'command -v xfce4-panel >/dev/null 2>&1 && command -v xfdesktop >/dev/null 2>&1 && (command -v startxfce4 >/dev/null 2>&1 || command -v xfce4-session >/dev/null 2>&1)'
  if [ $? -eq 0 ]; then
    pass_fix "XFCE 元件可用：xfce4-panel / xfdesktop / launcher"
  else
    fail_fix "XFCE 元件缺失：xfce4-panel 或 xfdesktop"
  fi

  sudo mkdir -p /home/ubuntu/.config /home/ubuntu/.cache
  sudo chown -R ubuntu:ubuntu /home/ubuntu/.config /home/ubuntu/.cache
  write_xfce_session_files "$launcher"
  sudo -u ubuntu bash -lc 'nohup xfce4-panel >/dev/null 2>&1 & disown || true; nohup xfdesktop >/dev/null 2>&1 & disown || true' || true
  sudo systemctl restart xrdp xrdp-sesman 2>/dev/null || true
}

ensure_rdp_session() {
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"

  doing "安裝 / 修復 xrdp + XFCE session..."
  fix_broken_apt
  ensure_xfce_packages
  launcher="$(detect_xfce_launcher)"
  write_xfce_session_files "$launcher"

  sudo systemctl restart xrdp xrdp-sesman 2>/dev/null || true
}

echo -e "\n${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║  JV Tutor Corner — EC2 診斷＋自動修復   ║${RESET}"
echo -e "${CYAN}${BOLD}║  $(date '+%Y-%m-%d %H:%M:%S')                   ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}"

# ═══════════════════════════════════════════════════════════
# 1. 系統資源
# ═══════════════════════════════════════════════════════════
section "系統資源"

# RAM
AVAIL_RAM=$(free -m | awk '/^Mem:/{print $7}')
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if   [ "$AVAIL_RAM" -ge 1024 ]; then ok "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB"
elif [ "$AVAIL_RAM" -ge 512  ]; then wn "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB（偏低，壓測時注意）"
else                                  er "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB（嚴重不足）"
fi

# 磁碟（先清理，再建 Swap，避免空間不夠）
ROOT_AVAIL=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
ROOT_PCT=$(df / | awk 'NR==2{print $5}')
if [ "$ROOT_AVAIL" -lt 2 ]; then
  wn "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）→ 自動清理"
  doing "清理 apt 快取、孤立套件、破損依賴與舊 journal..."
  sudo apt-get clean -y 2>/dev/null
  sudo apt-get autoremove -y 2>/dev/null
  sudo apt-get install -f -y 2>/dev/null
  sudo journalctl --vacuum-size=100M 2>/dev/null
  ROOT_AVAIL=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
  ROOT_PCT=$(df / | awk 'NR==2{print $5}')
  if [ "$ROOT_AVAIL" -ge 1 ]; then pass_fix "清理完成，磁碟可用：${ROOT_AVAIL}GB"
  else                             fail_fix "空間嚴重不足（${ROOT_AVAIL}GB），請在 AWS Console 擴充 EBS"
  fi
elif [ "$ROOT_AVAIL" -lt 5 ]; then
  wn "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）→ 偏少但可運行測試"
else
  ok "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）"
fi

# Swap（依可用磁碟動態決定大小，至少保留 512MB 餘裕）
TOTAL_SWAP=$(free -m | awk '/^Swap:/{print $2}')
if [ "$TOTAL_SWAP" -ge 512 ]; then
  ok "Swap：${TOTAL_SWAP}MB"
else
  wn "Swap：${TOTAL_SWAP}MB → OOM 高風險"
  DISK_FREE_MB=$(df -BM / | awk 'NR==2{gsub("M","",$4); print $4}')
  SWAP_SIZE_MB=$(( DISK_FREE_MB - 512 ))
  [ "$SWAP_SIZE_MB" -lt 512 ] && SWAP_SIZE_MB=0
  if [ "$SWAP_SIZE_MB" -gt 0 ]; then
    doing "建立 ${SWAP_SIZE_MB}MB Swap 檔案（磁碟可用 ${DISK_FREE_MB}MB）..."
    sudo swapoff /swapfile 2>/dev/null
    sudo rm -f /swapfile
    if sudo fallocate -l "${SWAP_SIZE_MB}M" /swapfile 2>/dev/null; then
      sudo chmod 600 /swapfile \
        && sudo mkswap /swapfile \
        && sudo swapon /swapfile \
        && (grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null)
    else
      sudo rm -f /swapfile
    fi
    NEW_SWAP=$(free -m | awk '/^Swap:/{print $2}')
    if [ "$NEW_SWAP" -ge 512 ]; then pass_fix "Swap 已啟用：${NEW_SWAP}MB"
    else                             fail_fix "Swap 建立失敗，請擴充 EBS 後重試"
    fi
  else
    fail_fix "磁碟空間不足以建立 Swap（可用 ${DISK_FREE_MB}MB），請擴充 EBS"
  fi
fi

# ═══════════════════════════════════════════════════════════
# 2. 遠端連線 (RDP)
# ═══════════════════════════════════════════════════════════
section "遠端連線 (RDP)"

ensure_rdp_session

if systemctl is-active --quiet xrdp 2>/dev/null; then
  ok "xrdp 服務：active (running)"
else
  er "xrdp 服務：$(systemctl show xrdp --property=ActiveState --value 2>/dev/null || echo unknown)"
  doing "啟動 xrdp..."
  sudo systemctl enable xrdp 2>/dev/null
  sudo systemctl start xrdp 2>/dev/null
  sleep 2
  if systemctl is-active --quiet xrdp; then pass_fix "xrdp 已啟動"
  else                                       fail_fix "xrdp 啟動失敗（執行 journalctl -xe -u xrdp 排查）"
  fi
fi

# Port 3389
if ss -tlnp 2>/dev/null | grep -q ':3389'; then
  ok "Port 3389：監聽中（$(ss -tlnp | grep ':3389' | awk '{print $4}' | head -1)）"
else
  er "Port 3389：未監聽"
  doing "重啟 xrdp 並開放 ufw 防火牆..."
  sudo systemctl restart xrdp 2>/dev/null
  sudo ufw allow 3389/tcp 2>/dev/null
  sleep 2
  if ss -tlnp 2>/dev/null | grep -q ':3389'; then pass_fix "Port 3389 現在正在監聽"
  else                                              fail_fix "Port 3389 仍未監聽，請確認 EC2 Security Group 已開放 TCP 3389"
  fi
fi

repair_xfce_desktop

XS="/home/ubuntu/.xsession"
if [ -f "$XS" ] && grep -Eq "startxfce4|xfce4-session|/usr/bin/xfce4-session|/usr/bin/startxfce4" "$XS" 2>/dev/null; then
  ok "~/.xsession：已設定（$(head -1 "$XS")）"
else
  [ -f "$XS" ] && er "~/.xsession：內容可疑 → $(head -1 "$XS")" \
               || er "~/.xsession：不存在 → RDP 登入後將出現黑畫面"
  doing "建立 ~/.xsession（XFCE launcher）..."
  launcher="$(detect_xfce_launcher)"
  [ -z "$launcher" ] && launcher="/usr/bin/xfce4-session"
  write_xfce_session_files "$launcher"
  sudo systemctl restart xrdp xrdp-sesman 2>/dev/null || true
  if [ -f "$XS" ]; then pass_fix "~/.xsession 已建立（startxfce4），xrdp 已重啟"
  else                  fail_fix "~/.xsession 建立失敗"
  fi
fi

if [ -f /var/log/xrdp-sesman.log ]; then
  echo -e "  ${BLUE}[INFO]${RESET} 最近的 xrdp-sesman 錯誤摘要："
  tail -n 10 /var/log/xrdp-sesman.log 2>/dev/null | sed 's/^/          /'
fi

sudo -u ubuntu bash -lc 'test -x ~/.xsession && test -f ~/.xsession && grep -Eq "startxfce4|xfce4-session|/usr/bin/xfce4-session|/usr/bin/startxfce4" ~/.xsession' \
  && pass_fix "使用者 session 啟動檔案檢查通過" \
  || fail_fix "使用者 session 啟動檔案檢查失敗"

# ═══════════════════════════════════════════════════════════
# 3. Chromium 與自動化環境
# ═══════════════════════════════════════════════════════════
section "Chromium 與自動化環境"

# Chromium（含 Playwright 快取路徑）
PLAYWRIGHT_CHROME=$(find /home/ubuntu/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1)
CB=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null || echo "$PLAYWRIGHT_CHROME")
if [ -n "$CB" ]; then
  ok "Chromium：$($CB --version 2>/dev/null)（路徑：$CB）"

  # ldd 動態連結庫
  REAL_BIN=$(readlink -f "$CB" 2>/dev/null || echo "$CB")
  MISSING=$(ldd "$REAL_BIN" 2>/dev/null | grep "not found")
  if [ -z "$MISSING" ]; then
    ok "動態連結庫 (ldd)：所有依賴已滿足"
  else
    er "動態連結庫 (ldd)：缺少 $(echo "$MISSING" | grep -c .) 個函式庫"
    echo "$MISSING" | while IFS= read -r lib; do echo -e "          ${RED}✗${RESET} ${lib}"; done
    doing "安裝 Chromium 常見依賴套件..."
    sudo apt-get install -y \
      libnss3 libgbm1 libdrm2 libxshmfence1 \
      libatk1.0-0 libatk-bridge2.0-0 \
      libxcomposite1 libxdamage1 libxrandr2 \
      libxfixes3 libxkbcommon0 libpango-1.0-0 \
      libcairo2 libasound2t64 libdbus-1-3 \
      libglib2.0-0 fonts-liberation 2>/dev/null
    STILL_MISSING=$(ldd "$REAL_BIN" 2>/dev/null | grep "not found")
    if [ -z "$STILL_MISSING" ]; then pass_fix "所有動態連結庫已修復"
    else                              fail_fix "仍缺少函式庫：$(echo "$STILL_MISSING" | head -1)"
    fi
  fi
else
  er "Chromium：未找到"
  doing "安裝 Google Chrome（繞過 snap，避免 EC2 卡頓）..."
  sudo apt-get update -qq 2>/dev/null
  # 下載 Google Chrome 穩定版 deb（snap-free，EC2 友善）
  wget -q -O /tmp/google-chrome.deb \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && sudo dpkg -i /tmp/google-chrome.deb 2>/dev/null \
    && sudo apt-get install -f -y 2>/dev/null \
    && rm -f /tmp/google-chrome.deb
  CB=$(which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null)
  if [ -n "$CB" ]; then pass_fix "Google Chrome 已安裝：$($CB --version 2>/dev/null)"
  else                  fail_fix "Chrome 安裝失敗（請手動執行：sudo dpkg -i google-chrome-stable_current_amd64.deb）"
  fi
fi

# Xvfb
if command -v Xvfb &>/dev/null; then
  ok "Xvfb：已安裝"
else
  er "Xvfb：未安裝"
  doing "安裝 Xvfb..."
  sudo apt-get install -y xvfb 2>/dev/null
  if command -v Xvfb &>/dev/null; then pass_fix "Xvfb 已安裝"
  else                                 fail_fix "Xvfb 安裝失敗"
  fi
fi

# ═══════════════════════════════════════════════════════════
# 最終摘要
# ═══════════════════════════════════════════════════════════
echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  執行結果摘要                            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e "  ${GREEN}自動修復成功${RESET} : ${FIXED} 項"
echo -e "  ${RED}需手動處理${RESET}   : ${FAILED} 項"

if [ "$FAILED" -eq 0 ]; then
  echo -e "\n  ${GREEN}${BOLD}✓ 環境就緒，可執行 Selenium / Chromium 壓測！${RESET}"
else
  echo -e "\n  ${YELLOW}⚠ 有 ${FAILED} 項需要手動介入，請查看上方 [FAIL] 訊息${RESET}"
fi

if [ "$FAILED" -gt 0 ] && [ "$DEBUG_LOGS" -eq 1 ]; then
  collect_rdp_debug_logs
fi

echo ""
