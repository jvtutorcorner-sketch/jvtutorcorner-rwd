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

FIXED=0; FAILED=0

section() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; echo -e "  ${CYAN}─────────────────────────────────${RESET}"; }
ok()      { echo -e "  ${OK}  $*"; }
wn()      { echo -e "  ${WARN} $*"; }
er()      { echo -e "  ${ERR} $*"; }
doing()   { echo -e "\n  ${FIX}  ${BLUE}自動修復：$*${RESET}"; }
pass_fix(){ echo -e "  ${DONE} $*"; ((FIXED++)); }
fail_fix(){ echo -e "  ${FAIL} 修復失敗：$* （請手動處理）"; ((FAILED++)); }

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

# Swap
TOTAL_SWAP=$(free -m | awk '/^Swap:/{print $2}')
if [ "$TOTAL_SWAP" -ge 2048 ]; then
  ok "Swap：${TOTAL_SWAP}MB"
else
  wn "Swap：${TOTAL_SWAP}MB → OOM 高風險"
  doing "建立 2GB Swap 檔案..."
  if [ -f /swapfile ]; then
    sudo swapoff /swapfile 2>/dev/null
    sudo rm -f /swapfile
  fi
  sudo fallocate -l 2G /swapfile \
    && sudo chmod 600 /swapfile \
    && sudo mkswap /swapfile \
    && sudo swapon /swapfile \
    && (grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null)
  NEW_SWAP=$(free -m | awk '/^Swap:/{print $2}')
  if [ "$NEW_SWAP" -ge 2048 ]; then pass_fix "Swap 已啟用：${NEW_SWAP}MB"
  else                               fail_fix "Swap 建立失敗（目前 ${NEW_SWAP}MB）"
  fi
fi

# 磁碟
ROOT_AVAIL=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
ROOT_PCT=$(df / | awk 'NR==2{print $5}')
if [ "$ROOT_AVAIL" -ge 5 ]; then
  ok "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）"
else
  wn "磁碟可用：${ROOT_AVAIL}GB（使用率 ${ROOT_PCT}）→ 自動清理 apt 快取"
  doing "清理 apt 快取、孤立套件與舊 journal..."
  sudo apt-get clean -y 2>/dev/null
  sudo apt-get autoremove -y 2>/dev/null
  sudo journalctl --vacuum-size=100M 2>/dev/null
  NEW_AVAIL=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
  if [ "$NEW_AVAIL" -ge 2 ]; then pass_fix "清理完成，磁碟可用：${NEW_AVAIL}GB"
  else                             fail_fix "空間仍嚴重不足（${NEW_AVAIL}GB），請在 AWS Console 擴充 EBS"
  fi
fi

# ═══════════════════════════════════════════════════════════
# 2. 遠端連線 (RDP)
# ═══════════════════════════════════════════════════════════
section "遠端連線 (RDP)"

# xrdp 服務
if systemctl is-active --quiet xrdp 2>/dev/null; then
  ok "xrdp 服務：active (running)"
else
  er "xrdp 服務：$(systemctl show xrdp --property=ActiveState --value 2>/dev/null || echo unknown)"
  doing "啟動 xrdp..."
  sudo systemctl enable xrdp 2>/dev/null
  sudo systemctl start xrdp 2>/dev/null
  sleep 2
  if ! systemctl is-active --quiet xrdp; then
    doing "xrdp 未安裝，正在安裝..."
    sudo apt-get update -qq && sudo apt-get install -y xrdp 2>/dev/null
    sudo systemctl enable xrdp && sudo systemctl start xrdp
    sleep 2
  fi
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

# ~/.xsession
XS="/home/ubuntu/.xsession"
if [ -f "$XS" ] && grep -qiE "xfce|startx" "$XS" 2>/dev/null; then
  ok "~/.xsession：已設定（$(head -1 $XS)）"
else
  [ -f "$XS" ] && er "~/.xsession：內容可疑 → $(head -1 $XS)" \
               || er "~/.xsession：不存在 → RDP 登入後將出現黑畫面"
  doing "建立 ~/.xsession（startxfce4）..."
  echo 'startxfce4' | sudo tee "$XS" > /dev/null
  sudo chmod +x "$XS" && sudo chown ubuntu:ubuntu "$XS"
  sudo systemctl restart xrdp 2>/dev/null
  if [ -f "$XS" ]; then pass_fix "~/.xsession 已建立（startxfce4），xrdp 已重啟"
  else                  fail_fix "~/.xsession 建立失敗"
  fi
fi

# ═══════════════════════════════════════════════════════════
# 3. Chromium 與自動化環境
# ═══════════════════════════════════════════════════════════
section "Chromium 與自動化環境"

# Chromium
CB=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null)
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

echo ""
