#!/usr/bin/env bash
# check-jvtutor-env.sh
# JV Tutor Corner - EC2 環境健康診斷
# Ubuntu 24.04 | Xfce4 + XRDP + Chromium + Xvfb

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BOLD='\033[1m';      RESET='\033[0m'
OK="${GREEN}[OK]${RESET}   "
WARN="${YELLOW}[WARN]${RESET} "
ERR="${RED}[ERROR]${RESET}"
ERRORS=(); WARNINGS=()
add_err()  { ERRORS+=("$1"); }
add_warn() { WARNINGS+=("$1"); }
section()  { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; echo -e "  ${CYAN}─────────────────────────────────${RESET}"; }
ok()       { echo -e "  ${OK}  $*"; }
wn()       { echo -e "  ${WARN} $*"; }
er()       { echo -e "  ${ERR} $*"; }

echo -e "\n${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║  JV Tutor Corner — EC2 環境診斷         ║${RESET}"
echo -e "${CYAN}${BOLD}║  $(date '+%Y-%m-%d %H:%M:%S')                   ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}"

# ── 1. 系統資源 ───────────────────────────────────────────
section "系統資源"

AVAIL_RAM=$(free -m | awk '/^Mem:/{print $7}')
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if   [ "$AVAIL_RAM" -ge 1024 ]; then ok "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB"
elif [ "$AVAIL_RAM" -ge 512  ]; then wn "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB（偏低）"; add_warn "RAM_LOW"
else                                  er "RAM 可用：${AVAIL_RAM}MB / ${TOTAL_RAM}MB（嚴重不足）"; add_err "RAM_CRITICAL"
fi

TOTAL_SWAP=$(free -m | awk '/^Swap:/{print $2}')
USED_SWAP=$(free -m  | awk '/^Swap:/{print $3}')
if   [ "$TOTAL_SWAP" -ge 2048 ]; then ok "Swap：${TOTAL_SWAP}MB（已用 ${USED_SWAP}MB）"
elif [ "$TOTAL_SWAP" -ge 512  ]; then wn "Swap：${TOTAL_SWAP}MB（建議 ≥ 2GB）"; add_warn "SWAP_LOW"
else                                   wn "Swap：未啟用（0MB）→ OOM 高風險"; add_err "SWAP_NONE"
fi

ROOT_AVAIL=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
ROOT_PCT=$(df /        | awk 'NR==2{print $5}')
if   [ "$ROOT_AVAIL" -ge 5 ]; then ok "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）"
elif [ "$ROOT_AVAIL" -ge 2 ]; then wn "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）→ 偏少"; add_warn "DISK_LOW"
else                                er "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）→ 嚴重不足"; add_err "DISK_FULL"
fi

# ── 2. 遠端連線 (RDP) ────────────────────────────────────
section "遠端連線 (RDP)"

if systemctl is-active --quiet xrdp 2>/dev/null; then
  ok "xrdp 服務：active (running)"
else
  er "xrdp 服務：$(systemctl show xrdp --property=ActiveState --value 2>/dev/null || echo unknown)"
  add_err "XRDP_DOWN"
fi

if ss -tlnp 2>/dev/null | grep -q ':3389'; then
  ok "Port 3389：監聽中（$(ss -tlnp | grep ':3389' | awk '{print $4}' | head -1)）"
else
  er "Port 3389：未監聽"
  add_err "PORT_3389"
fi

XS="/home/ubuntu/.xsession"
if [ -f "$XS" ] && grep -qiE "xfce|startx" "$XS" 2>/dev/null; then
  ok "~/.xsession：已設定（$(head -1 $XS)）"
elif [ -f "$XS" ]; then
  wn "~/.xsession：內容可疑 → $(head -1 $XS)"; add_warn "XSESSION_CONTENT"
else
  er "~/.xsession：不存在 → RDP 登入後將出現黑畫面"
  add_err "XSESSION_MISSING"
fi

# ── 3. Chromium 與自動化環境 ─────────────────────────────
section "Chromium 與自動化環境"

CB=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null)
if [ -n "$CB" ]; then
  ok "Chromium：$($CB --version 2>/dev/null)（路徑：$CB）"
  REAL_BIN=$(readlink -f "$CB" 2>/dev/null || echo "$CB")
  MISSING=$(ldd "$REAL_BIN" 2>/dev/null | grep "not found")
  if [ -z "$MISSING" ]; then
    ok "動態連結庫 (ldd)：所有依賴已滿足"
  else
    er "動態連結庫 (ldd)：缺少 $(echo "$MISSING" | grep -c .) 個函式庫"
    echo "$MISSING" | while IFS= read -r lib; do
      echo -e "          ${RED}✗${RESET} ${lib}"
    done
    add_err "CHROMIUM_MISSING_LIBS"
  fi
else
  er "Chromium：未找到（chromium-browser / chromium / google-chrome）"
  add_err "CHROMIUM_NOT_FOUND"
fi

if command -v Xvfb &>/dev/null; then
  ok "Xvfb：已安裝（$(Xvfb -version 2>&1 | head -1)）"
else
  er "Xvfb：未安裝 → Headless 測試無法使用虛擬顯示器"
  add_err "XVFB_MISSING"
fi

# ── 摘要 ─────────────────────────────────────────────────
echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  診斷摘要                                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e "  ${RED}ERROR${RESET} : ${#ERRORS[@]} 項  |  ${YELLOW}WARN${RESET} : ${#WARNINGS[@]} 項"
if [ ${#ERRORS[@]} -eq 0 ]; then
  echo -e "\n  ${GREEN}${BOLD}✓ 所有關鍵項目通過，環境就緒！${RESET}"
else
  echo -e "\n  ${RED}✗ 請修復下方 ERROR 項目後再執行壓測${RESET}"
fi

# ── 快速修復建議 ─────────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║  快速修復建議                            ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
  for e in "${ERRORS[@]}"; do case "$e" in
    XRDP_DOWN)
      echo -e "\n${RED}▶ [FIX] xrdp 服務未運行${RESET}"
      echo "  sudo systemctl enable xrdp && sudo systemctl start xrdp" ;;
    PORT_3389)
      echo -e "\n${RED}▶ [FIX] Port 3389 未監聽${RESET}"
      echo "  sudo systemctl restart xrdp"
      echo "  sudo ufw allow 3389/tcp          # 若有啟用 ufw"
      echo "  # 確認 EC2 Security Group 已開放 TCP 3389 Inbound" ;;
    XSESSION_MISSING)
      echo -e "\n${RED}▶ [FIX] ~/.xsession 未設定（RDP 黑畫面）${RESET}"
      echo "  echo 'startxfce4' | sudo tee /home/ubuntu/.xsession"
      echo "  sudo chmod +x /home/ubuntu/.xsession"
      echo "  sudo chown ubuntu:ubuntu /home/ubuntu/.xsession"
      echo "  sudo systemctl restart xrdp" ;;
    CHROMIUM_NOT_FOUND)
      echo -e "\n${RED}▶ [FIX] Chromium 未安裝${RESET}"
      echo "  sudo apt-get update && sudo apt-get install -y chromium-browser" ;;
    CHROMIUM_MISSING_LIBS)
      echo -e "\n${RED}▶ [FIX] 動態連結庫缺失${RESET}"
      echo "  sudo apt-get install -y \\"
      echo "    libnss3 libgbm1 libdrm2 libxshmfence1 \\"
      echo "    libatk1.0-0 libatk-bridge2.0-0 \\"
      echo "    libxcomposite1 libxdamage1 libxrandr2 \\"
      echo "    libxfixes3 libxkbcommon0 libpango-1.0-0 \\"
      echo "    libcairo2 libasound2t64 libdbus-1-3 \\"
      echo "    libglib2.0-0 fonts-liberation" ;;
    XVFB_MISSING)
      echo -e "\n${RED}▶ [FIX] Xvfb 未安裝${RESET}"
      echo "  sudo apt-get install -y xvfb"
      echo "  # 啟動虛擬顯示器："
      echo "  Xvfb :99 -screen 0 1920x1080x24 & export DISPLAY=:99" ;;
    SWAP_NONE|RAM_CRITICAL)
      echo -e "\n${RED}▶ [FIX] Swap 未啟用 / RAM 不足${RESET}"
      echo "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
      echo "  sudo mkswap /swapfile && sudo swapon /swapfile"
      echo "  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab" ;;
    DISK_FULL)
      echo -e "\n${RED}▶ [FIX] 磁碟空間不足${RESET}"
      echo "  sudo apt-get clean && sudo apt-get autoremove -y"
      echo "  du -sh /* 2>/dev/null | sort -rh | head -10" ;;
  esac; done
fi

echo ""
