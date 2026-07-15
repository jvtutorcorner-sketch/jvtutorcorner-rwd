#!/usr/bin/env bash
# setup-jvtutorcorner-env.sh
# JV Tutor Corner - EC2 一鍵環境建置腳本
# Ubuntu 24.04 | 6.8GB 小磁碟優化版
# 執行順序：磁碟清理 → Swap → XRDP → 環境驗證

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BLUE='\033[0;34m';   BOLD='\033[1m'; RESET='\033[0m'
OK="${GREEN}[OK]${RESET}   "; WARN="${YELLOW}[WARN]${RESET} "; ERR="${RED}[ERROR]${RESET}"
STEP="${CYAN}[STEP]${RESET}"; DONE="${GREEN}[DONE]${RESET} "; FAIL="${RED}[FAIL]${RESET} "

PASS=0; FAILED=0
ok()    { echo -e "  ${OK}  $*"; ((PASS++)); }
wn()    { echo -e "  ${WARN} $*"; }
er()    { echo -e "  ${ERR} $*"; }
step()  { echo -e "\n${CYAN}${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }
done_() { echo -e "  ${DONE}$*"; }
fail_() { echo -e "  ${FAIL}$*"; ((FAILED++)); }
run()   { echo -e "  ${BLUE}→${RESET} $*"; eval "$*"; }

echo -e "\n${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║  JV Tutor Corner — EC2 一鍵環境建置     ║${RESET}"
echo -e "${CYAN}${BOLD}║  $(date '+%Y-%m-%d %H:%M:%S')                   ║${RESET}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}"

# ═══════════════════════════════════════════════════════════
# STEP 1: 磁碟清理（優先執行，為後續步驟騰出空間）
# ═══════════════════════════════════════════════════════════
step "STEP 1／5  磁碟清理"

BEFORE=$(df -BM / | awk 'NR==2{gsub("M","",$4); print $4}')
echo -e "  清理前可用：${BEFORE}MB"

# 移除舊版 amazon-ssm-agent snap（新版仍保留，安全）
OLD_SSM=$(ls /var/lib/snapd/snaps/amazon-ssm-agent_*.snap 2>/dev/null | sort | head -1)
LATEST_SSM=$(ls /var/lib/snapd/snaps/amazon-ssm-agent_*.snap 2>/dev/null | sort | tail -1)
if [ -n "$OLD_SSM" ] && [ "$OLD_SSM" != "$LATEST_SSM" ]; then
  run "sudo rm -f '$OLD_SSM'"
  done_ "移除舊版 SSM Agent snap：$(basename $OLD_SSM)"
fi

# 清除 snap 殘留快取與中斷下載
run "sudo rm -rf /var/lib/snapd/cache/*"
run "sudo rm -rf /var/lib/snapd/snaps/*.partial"
done_ "Snap 快取與 partial 已清除"

# 清除 apt 快取
run "sudo apt-get clean -y 2>/dev/null || true"
run "sudo apt-get autoremove -y 2>/dev/null || true"
done_ "APT 快取已清除"

# 壓縮 systemd journal
run "sudo journalctl --vacuum-size=50M 2>/dev/null || true"
done_ "Journal 已壓縮至 50MB"

# 清除 /tmp
run "sudo rm -rf /tmp/* 2>/dev/null || true"
done_ "/tmp 已清除"

# 修復破損套件（如 libyelp0 / libwebkit2gtk）
echo -e "  ${BLUE}→${RESET} 修復破損套件依賴..."
sudo apt-get install -f -y 2>/dev/null || true
done_ "破損套件已嘗試修復"

# 移除已知不需要的 GUI 輔助工具（yelp 是 GNOME 說明瀏覽器，壓測不需要）
if dpkg -l yelp &>/dev/null 2>&1; then
  run "sudo apt-get remove -y --purge yelp libyelp0 2>/dev/null || true"
  done_ "已移除 yelp（釋出空間）"
fi

AFTER=$(df -BM / | awk 'NR==2{gsub("M","",$4); print $4}')
FREED=$(( AFTER - BEFORE ))
echo -e "\n  清理後可用：${AFTER}MB（釋出 ${FREED}MB）"

# ═══════════════════════════════════════════════════════════
# STEP 2: Swap 建置（依可用空間動態決定大小）
# ═══════════════════════════════════════════════════════════
step "STEP 2／5  Swap 建置"

CURRENT_SWAP=$(free -m | awk '/^Swap:/{print $2}')
if [ "$CURRENT_SWAP" -ge 512 ]; then
  ok "Swap 已存在：${CURRENT_SWAP}MB，跳過"
else
  # 清除可能的殘留（fallocate 失敗留下的半成品）
  sudo swapoff /swapfile 2>/dev/null || true
  sudo rm -f /swapfile

  DISK_FREE_MB=$(df -BM / | awk 'NR==2{gsub("M","",$4); print $4}')
  # 保留 512MB buffer，最多 2048MB swap
  SWAP_MB=$(( DISK_FREE_MB - 512 ))
  [ "$SWAP_MB" -gt 2048 ] && SWAP_MB=2048
  [ "$SWAP_MB" -lt 512  ] && SWAP_MB=0

  if [ "$SWAP_MB" -ge 512 ]; then
    echo -e "  ${BLUE}→${RESET} 建立 ${SWAP_MB}MB Swap（磁碟可用 ${DISK_FREE_MB}MB）..."
    if sudo fallocate -l "${SWAP_MB}M" /swapfile 2>/dev/null; then
      sudo chmod 600 /swapfile
      sudo mkswap /swapfile
      sudo swapon /swapfile
      grep -q '/swapfile' /etc/fstab \
        || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
      NEW_SWAP=$(free -m | awk '/^Swap:/{print $2}')
      ok "Swap 已建立：${NEW_SWAP}MB（開機永久生效）"
    else
      sudo rm -f /swapfile   # 立即清除 partial，避免佔用空間
      fail_ "Swap 建立失敗：磁碟可用空間不足（${DISK_FREE_MB}MB）"
    fi
  else
    fail_ "磁碟空間太少（${DISK_FREE_MB}MB），無法建立 Swap，建議在 AWS Console 擴充 EBS"
  fi
fi

# ═══════════════════════════════════════════════════════════
# STEP 3: XRDP 遠端桌面設定
# ═══════════════════════════════════════════════════════════
step "STEP 3／5  XRDP 遠端桌面"

# xrdp 服務
if ! systemctl is-active --quiet xrdp 2>/dev/null; then
  echo -e "  ${BLUE}→${RESET} 啟動 xrdp..."
  sudo systemctl enable xrdp 2>/dev/null
  sudo systemctl start xrdp 2>/dev/null
  sleep 2
fi

if systemctl is-active --quiet xrdp 2>/dev/null; then
  ok "xrdp 服務：active (running)"
else
  fail_ "xrdp 啟動失敗（執行 journalctl -xe -u xrdp 排查）"
fi

# Port 3389
if ! ss -tlnp 2>/dev/null | grep -q ':3389'; then
  sudo systemctl restart xrdp 2>/dev/null
  sudo ufw allow 3389/tcp 2>/dev/null || true
  sleep 2
fi

if ss -tlnp 2>/dev/null | grep -q ':3389'; then
  ok "Port 3389：監聽中（$(ss -tlnp | grep ':3389' | awk '{print $4}' | head -1)）"
else
  fail_ "Port 3389 未監聽 → 請確認 EC2 Security Group 已開放 TCP 3389 Inbound"
fi

# ~/.xsession
XS="/home/ubuntu/.xsession"
if [ ! -f "$XS" ] || ! grep -qiE "xfce|startx" "$XS" 2>/dev/null; then
  echo 'startxfce4' | sudo tee "$XS" > /dev/null
  sudo chmod +x "$XS"
  sudo chown ubuntu:ubuntu "$XS"
  sudo systemctl restart xrdp 2>/dev/null
  ok "~/.xsession：已建立（startxfce4），xrdp 已重啟"
else
  ok "~/.xsession：已設定（$(head -1 $XS)）"
fi

# ═══════════════════════════════════════════════════════════
# STEP 4: Chromium 與自動化環境驗證
# ═══════════════════════════════════════════════════════════
step "STEP 4／5  Chromium 與自動化環境"

# 優先偵測 Playwright 快取中的 Chrome（已由 npm install 安裝，不需重新下載）
PLAYWRIGHT_CHROME=$(find /home/ubuntu/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1)
CB=$(which chromium-browser 2>/dev/null \
  || which chromium 2>/dev/null \
  || which google-chrome 2>/dev/null \
  || echo "$PLAYWRIGHT_CHROME")

if [ -n "$CB" ]; then
  CHROME_VER=$($CB --version 2>/dev/null || echo "版本無法讀取")
  ok "Chromium：${CHROME_VER}"
  echo -e "         路徑：${CB}"

  # ldd 動態連結庫
  REAL_BIN=$(readlink -f "$CB" 2>/dev/null || echo "$CB")
  MISSING=$(ldd "$REAL_BIN" 2>/dev/null | grep "not found" || true)
  if [ -z "$MISSING" ]; then
    ok "動態連結庫 (ldd)：所有依賴已滿足"
  else
    wn "缺少 $(echo "$MISSING" | grep -c .) 個函式庫，嘗試安裝..."
    sudo apt-get install -y \
      libnss3 libgbm1 libdrm2 libxshmfence1 \
      libatk1.0-0 libatk-bridge2.0-0 \
      libxcomposite1 libxdamage1 libxrandr2 \
      libxfixes3 libxkbcommon0 libpango-1.0-0 \
      libcairo2 libasound2t64 libdbus-1-3 \
      libglib2.0-0 fonts-liberation 2>/dev/null || true
    STILL=$(ldd "$REAL_BIN" 2>/dev/null | grep "not found" || true)
    if [ -z "$STILL" ]; then ok "動態連結庫：修復完成"
    else                     fail_ "仍缺少函式庫：$(echo "$STILL" | head -1)"
    fi
  fi
else
  fail_ "Chromium 未找到（請確認 npx playwright install chromium 已執行）"
fi

# Xvfb
if command -v Xvfb &>/dev/null; then
  ok "Xvfb：已安裝"
else
  echo -e "  ${BLUE}→${RESET} 安裝 Xvfb..."
  sudo apt-get install -y xvfb 2>/dev/null && ok "Xvfb：已安裝" || fail_ "Xvfb 安裝失敗"
fi

# ═══════════════════════════════════════════════════════════
# STEP 5: 最終健康報告
# ═══════════════════════════════════════════════════════════
step "STEP 5／5  健康報告"

echo -e ""
echo -e "  ${BOLD}系統資源${RESET}"
free -h | awk 'NR<=2{printf "  %s\n", $0}'
echo -e ""
echo -e "  ${BOLD}磁碟使用${RESET}"
df -h / | awk 'NR<=2{printf "  %s\n", $0}'

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  建置結果摘要                            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e "  ${GREEN}通過${RESET} : ${PASS} 項"
echo -e "  ${RED}失敗${RESET} : ${FAILED} 項"

if [ "$FAILED" -eq 0 ]; then
  echo -e "\n  ${GREEN}${BOLD}✓ 環境就緒，可執行 Selenium / Chromium 壓測！${RESET}"
  echo -e "\n  ${BOLD}RDP 連線資訊：${RESET}"
  echo -e "  主機：$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<EC2 Public IP>')"
  echo -e "  Port：3389  ／  使用者：ubuntu"
else
  echo -e "\n  ${YELLOW}⚠ 有 ${FAILED} 項失敗，請查看上方 [FAIL] 訊息${RESET}"
fi

echo ""
