#!/usr/bin/env bash
# setup-jvtutorcorner-env.sh
# JV Tutor Corner - EC2 一鍵環境建置腳本
# Ubuntu 24.04 | 6.8GB 小磁碟優化版
# 執行順序：磁碟清理 → Swap → XRDP → 環境驗證

set -euo pipefail

DEBUG_LOGS=0
for arg in "${@:-}"; do
  case "$arg" in
    --debug-logs|--diagnose|--troubleshoot) DEBUG_LOGS=1 ;;
  esac
done

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

detect_xfce_launcher() {
  if command -v startxfce4 >/dev/null 2>&1; then
    command -v startxfce4
  elif command -v xfce4-session >/dev/null 2>&1; then
    command -v xfce4-session
  else
    echo ""
  fi
}

detect_active_x_display() {
  local display
  display="$(ps -eo args= 2>/dev/null \
    | awk '/(^|[[:space:]])Xorg[[:space:]]+:[0-9]+/ {
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^:[0-9]+$/) { print $i ".0"; exit }
        }
      }')"
  if [ -n "$display" ]; then
    echo "$display"
    return 0
  fi
  display="$(ps -eo args= 2>/dev/null \
    | awk '/(^|[[:space:]])Xvnc[[:space:]]+:[0-9]+/ {
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^:[0-9]+$/) { print $i ".0"; exit }
        }
      }')"
  echo "$display"
}

detect_active_xauthority() {
  if [ -f /home/ubuntu/.Xauthority ]; then
    echo /home/ubuntu/.Xauthority
  else
    echo ""
  fi
}

fix_broken_apt() {
  echo -e "  ${BLUE}→${RESET} 修復 broken apt 依賴..."
  sudo apt --fix-broken install -y 2>/dev/null || sudo apt-get -f install -y 2>/dev/null || true
}

ensure_xfce_packages() {
  echo -e "  ${BLUE}→${RESET} 補齊 XFCE / XRDP 套件..."
  sudo apt-get update -qq 2>/dev/null || true
  sudo apt-get install -y \
    xrdp \
    xorgxrdp \
    xfce4 \
    xfce4-session \
    xfwm4 \
    xfce4-panel \
    xfdesktop4 \
    xfce4-settings \
    thunar \
    dbus-x11 \
    x11-xserver-utils \
    x11-utils \
    xdotool \
    at-spi2-core 2>/dev/null || true
}

write_low_load_xfce_profile() {
  local xfce_conf_dir="/home/ubuntu/.config/xfce4/xfconf/xfce-perchannel-xml"
  local gtk3_dir="/home/ubuntu/.config/gtk-3.0"
  local gtk4_dir="/home/ubuntu/.config/gtk-4.0"
  local autostart_dir="/home/ubuntu/.config/autostart"

  sudo mkdir -p "$xfce_conf_dir" "$gtk3_dir" "$gtk4_dir" "$autostart_dir"

  cat <<'EOF' | sudo tee "$gtk3_dir/settings.ini" > /dev/null
[Settings]
gtk-enable-animations=0
gtk-enable-event-sounds=0
gtk-enable-input-feedback-sounds=0
EOF

  cat <<'EOF' | sudo tee "$gtk4_dir/settings.ini" > /dev/null
[Settings]
gtk-enable-animations=0
gtk-enable-event-sounds=0
gtk-enable-input-feedback-sounds=0
EOF

  cat <<'XMLEOF' | sudo tee "$xfce_conf_dir/xfce4-notifyd.xml" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-notifyd" version="1.0">
  <property name="applications" type="empty"/>
  <property name="theme" type="empty"/>
  <property name="do-not-disturb" type="bool" value="true"/>
</channel>
XMLEOF

  cat <<'XMLEOF' | sudo tee "$xfce_conf_dir/xfce4-desktop.xml" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-desktop" version="1.0">
  <property name="desktop-icons" type="empty">
    <property name="style" type="int" value="0"/>
  </property>
  <property name="backdrop" type="empty"/>
</channel>
XMLEOF

  printf '[Desktop Entry]\nHidden=true\n' | sudo tee "$autostart_dir/xfce4-notifyd.desktop" > /dev/null
  printf '[Desktop Entry]\nHidden=true\n' | sudo tee "$autostart_dir/xfce4-power-manager.desktop" > /dev/null

  sudo chown -R ubuntu:ubuntu /home/ubuntu/.config/xfce4 /home/ubuntu/.config/gtk-3.0 /home/ubuntu/.config/gtk-4.0 /home/ubuntu/.config/autostart
}

write_xfce_session_files() {
  local launcher="$1"
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"
  local session_cmd
  local xfwm4_xml="/home/ubuntu/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml"
  local autostart_dir="/home/ubuntu/.config/autostart"
  local autostart_sh="$autostart_dir/xrdp-xfce-recovery.sh"
  local autostart_desktop="$autostart_dir/xrdp-xfce-recovery.desktop"

  if [ -z "$launcher" ]; then
    launcher="/usr/bin/xfce4-session"
  fi

  session_cmd="exec $launcher"
  if command -v dbus-launch >/dev/null 2>&1; then
    session_cmd="exec dbus-launch --exit-with-session $launcher"
  fi

  cat <<EOF | sudo tee "$xs" > /dev/null
#!/bin/sh
# Suppress AT-SPI accessibility bus lookups — prevents 3-5s click delay under XRDP
export NO_AT_BRIDGE=1
# Kill stale compositing managers left from crashed sessions
pkill -x compton  2>/dev/null || true
pkill -x picom    2>/dev/null || true
pkill -x xcompmgr 2>/dev/null || true
$session_cmd
EOF
  sudo chmod 755 "$xs"
  sudo chown ubuntu:ubuntu "$xs"

  cat <<EOF | sudo tee "$xinitrc" > /dev/null
#!/bin/sh
pkill -x compton  2>/dev/null || true
pkill -x picom    2>/dev/null || true
pkill -x xcompmgr 2>/dev/null || true
$session_cmd
EOF
  sudo chmod 755 "$xinitrc"
  sudo chown ubuntu:ubuntu "$xinitrc"

  # Write all xfconf XML overrides
  local xfce_conf_dir="/home/ubuntu/.config/xfce4/xfconf/xfce-perchannel-xml"
  sudo mkdir -p "$xfce_conf_dir"

  # Disable xfwm4 compositing — prevents "another compositor running" black screen under XRDP
  cat <<'XMLEOF' | sudo tee "$xfwm4_xml" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="use_compositing" type="bool" value="false"/>
  </property>
</channel>
XMLEOF

  # Disable xfce4-screensaver — it activates under XRDP and swallows all mouse input
  cat <<'XMLEOF' | sudo tee "$xfce_conf_dir/xfce4-screensaver.xml" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-screensaver" version="1.0">
  <property name="saver" type="empty">
    <property name="enabled" type="bool" value="false"/>
  </property>
  <property name="lock" type="empty">
    <property name="enabled" type="bool" value="false"/>
  </property>
</channel>
XMLEOF

  # Disable DPMS / screen-blank via power-manager (secondary source of screen blanking)
  cat <<'XMLEOF' | sudo tee "$xfce_conf_dir/xfce4-power-manager.xml" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-power-manager" version="1.0">
  <property name="xfce4-power-manager" type="empty">
    <property name="dpms-enabled" type="bool" value="false"/>
    <property name="blank-on-ac" type="int" value="0"/>
    <property name="dpms-on-ac-sleep" type="uint" value="0"/>
    <property name="dpms-on-ac-off" type="uint" value="0"/>
  </property>
</channel>
XMLEOF
  sudo chown -R ubuntu:ubuntu "/home/ubuntu/.config/xfce4"
  write_low_load_xfce_profile

  # Disable light-locker — requires LightDM; always crashes under XRDP
  sudo mkdir -p "$autostart_dir"
  printf '[Desktop Entry]\nHidden=true\n' | sudo tee "$autostart_dir/light-locker.desktop" > /dev/null
  printf '[Desktop Entry]\nHidden=true\n' | sudo tee "$autostart_dir/xfce4-screensaver.desktop" > /dev/null
  cat <<'EOF' | sudo tee "$autostart_sh" > /dev/null
#!/bin/sh
set -u
detect_display() {
  ps -eo args= 2>/dev/null | awk '/(^|[[:space:]])Xorg[[:space:]]+:[0-9]+/ {
    for (i = 1; i <= NF; i++) if ($i ~ /^:[0-9]+$/) { print $i ".0"; exit }
  }'
}
export DISPLAY="${DISPLAY:-$(detect_display)}"
export XAUTHORITY="${XAUTHORITY:-/home/ubuntu/.Xauthority}"
if [ -z "$DISPLAY" ]; then
  exit 0
fi
# Kill screensaver first — it activates under XRDP and blocks all input
xfce4-screensaver-command --deactivate 2>/dev/null || true
pkill -x xfce4-screensaver 2>/dev/null || true
pkill -x light-locker 2>/dev/null || true
# Disable screensaver + DPMS via xfconf
xfconf-query -c xfce4-screensaver -p /saver/enabled -s false 2>/dev/null || true
xfconf-query -c xfce4-screensaver -p /lock/enabled -s false 2>/dev/null || true
xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false 2>/dev/null || true
xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0 2>/dev/null || true
# Disable notifications and event sounds in the live session
xfconf-query -c xfce4-notifyd -p /do-not-disturb -s true 2>/dev/null || true
xfconf-query -c xfce4-desktop -p /desktop-icons/style -s 0 2>/dev/null || true
# Restart xfwm4 to clear any compositor conflict
pkill -x xfwm4 2>/dev/null || true
nohup xfwm4 --display="$DISPLAY" --replace --compositor=off >/dev/null 2>&1 &
EOF
  sudo chmod 755 "$autostart_sh"
  cat <<EOF | sudo tee "$autostart_desktop" > /dev/null
[Desktop Entry]
Type=Application
Name=XRDP XFCE Recovery
Exec=/bin/sh $autostart_sh
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
OnlyShowIn=XFCE;
EOF
  sudo chown -R ubuntu:ubuntu "$autostart_dir"
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

  diagnose_xrdp_input
}

diagnose_xrdp_input() {
  local display
  local xauth
  display="$(detect_active_x_display)"
  xauth="$(detect_active_xauthority)"
  [ -z "$display" ] && display="${DISPLAY:-}"
  [ -z "$xauth" ] && xauth="/home/ubuntu/.Xauthority"

  echo -e "\n  ${BLUE}[INFO]${RESET} ── X11 輸入診斷（點擊失效排查）──"

  echo -e "  ${BLUE}[INFO]${RESET} 關鍵 X session 程序"
  ps aux | grep -E 'xfwm4|xfce4-screensaver|light-locker|xscreensaver|xflock' \
    | grep -v grep | sed 's/^/    /' || echo "    （無匹配程序）"

  echo -e "  ${BLUE}[INFO]${RESET} 活動視窗管理員 (_NET_WM_NAME)"
  if [ -n "$display" ]; then
    sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xprop -root _NET_WM_NAME 2>/dev/null | sed 's/^/    /' || echo "    （無法取得，X session 可能未運行）"
  else
    echo "    （無法偵測 active display）"
  fi

  echo -e "  ${BLUE}[INFO]${RESET} 目前聚焦視窗名稱"
  if [ -n "$display" ]; then
    sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xdotool getactivewindow getwindowname 2>/dev/null | sed 's/^/    /' || echo "    （無法取得）"
  else
    echo "    （無法偵測 active display）"
  fi

  echo -e "  ${BLUE}[INFO]${RESET} X clients（top 20）"
  if [ -n "$display" ]; then
    sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xlsclients 2>/dev/null | head -20 | sed 's/^/    /' || echo "    （無法取得）"
  else
    echo "    （無法偵測 active display）"
  fi

  echo -e "  ${BLUE}[INFO]${RESET} xfce4-screensaver 狀態"
  if [ -n "$display" ]; then
    sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xfce4-screensaver-command --query 2>/dev/null | sed 's/^/    /' \
    || sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xscreensaver-command -info 2>/dev/null | head -5 | sed 's/^/    /' \
    || echo "    （無 screensaver 執行或工具未安裝）"
  else
    echo "    （無法偵測 active display）"
  fi

  echo -e "  ${BLUE}[INFO]${RESET} XTest / xorgxrdp 擴充功能"
  if [ -n "$display" ]; then
    sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
      xdpyinfo 2>/dev/null | grep -Ei 'XTEST|XInputExtension|XRDP|xorgxrdp' \
      | sed 's/^/    /' || echo "    （無法取得 xdpyinfo）"
  else
    echo "    （無法偵測 active display）"
  fi
}

repair_xfce_input() {
  local display
  local xauth

  display="$(detect_active_x_display)"
  xauth="$(detect_active_xauthority)"
  [ -z "$xauth" ] && xauth="/home/ubuntu/.Xauthority"
  if [ -z "$display" ]; then
    wn "未偵測到 active display，跳過即時 session 修復（下次登入時 autostart 仍會生效）"
    return 0
  fi

  echo -e "  ${BLUE}→${RESET} 終止螢幕保護程式 / 鎖定畫面..."
  # First try graceful deactivate, then force-kill
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfce4-screensaver-command --deactivate 2>/dev/null || true
  pkill -u ubuntu -x xfce4-screensaver 2>/dev/null && wn "xfce4-screensaver 已終止" || true
  pkill -u ubuntu -x xscreensaver      2>/dev/null && wn "xscreensaver 已終止"      || true
  pkill -u ubuntu -x light-locker      2>/dev/null && wn "light-locker 已終止"      || true
  pkill -u ubuntu -x xflock4           2>/dev/null && wn "xflock4 已終止"           || true

  # Disable screensaver + DPMS via xfconf in the live session
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfce4-screensaver -p /saver/enabled -s false 2>/dev/null || true
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfce4-screensaver -p /lock/enabled -s false 2>/dev/null || true
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false 2>/dev/null || true
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0 2>/dev/null || true

  echo -e "  ${BLUE}→${RESET} 即時關閉 xfwm4 compositing（點擊延遲的次要原因）..."
  local comp_state
  comp_state="$(sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfwm4 -p /general/use_compositing 2>/dev/null || echo unknown)"
  wn "compositing 目前狀態：$comp_state"
  sudo -u ubuntu DISPLAY="$display" XAUTHORITY="$xauth" \
    xfconf-query -c xfwm4 -p /general/use_compositing -s false 2>/dev/null \
  && ok "xfwm4 compositing 已即時關閉" \
  || wn "xfconf-query 無法執行（X session 可能未運行，將由 xfwm4.xml 在下次登入生效）"

  echo -e "  ${BLUE}→${RESET} 重啟 xfwm4（--replace 強制接管輸入焦點）..."
  pkill -u ubuntu -x xfwm4 2>/dev/null || true
  sudo -u ubuntu bash -c \
    "DISPLAY=$display XAUTHORITY=$xauth nohup xfwm4 --replace --compositor=off >/dev/null 2>&1 & disown" || true
  if pgrep -u ubuntu -x xfwm4 > /dev/null 2>&1; then
    ok "xfwm4 已重新啟動"
  else
    wn "xfwm4 未能啟動（X session 可能未運行）"
  fi
}

repair_xfce_desktop() {
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"
  local xfce_conf="/home/ubuntu/.config/xfce4"
  local session_cache="/home/ubuntu/.cache/sessions"
  local launcher

  launcher="$(sudo -u ubuntu bash -lc 'command -v startxfce4 >/dev/null 2>&1 && command -v startxfce4 || (command -v xfce4-session >/dev/null 2>&1 && command -v xfce4-session || true)')"

  echo -e "  ${BLUE}→${RESET} 修復 XFCE 桌面元件..."
  fix_broken_apt
  ensure_xfce_packages

  sudo -u ubuntu bash -lc 'command -v xfce4-panel >/dev/null 2>&1 && command -v xfdesktop >/dev/null 2>&1 && (command -v startxfce4 >/dev/null 2>&1 || command -v xfce4-session >/dev/null 2>&1)'
  if [ $? -eq 0 ]; then
    ok "XFCE 元件：xfce4-panel / xfdesktop / launcher 可用"
  else
    fail_ "XFCE 元件：缺少 xfce4-panel 或 xfdesktop"
  fi

  sudo mkdir -p /home/ubuntu/.config /home/ubuntu/.cache
  sudo chown -R ubuntu:ubuntu /home/ubuntu/.config /home/ubuntu/.cache

  if [ -d "$xfce_conf" ] || [ -d "$session_cache" ]; then
    wn "若登入後仍為藍屏，可考慮重置 XFCE 設定："
    wn "mv /home/ubuntu/.config/xfce4 /home/ubuntu/.config/xfce4.bak"
    wn "mv /home/ubuntu/.cache/sessions /home/ubuntu/.cache/sessions.bak"
  fi

  write_xfce_session_files "$launcher"
  repair_xfce_input

  sudo -u ubuntu bash -lc 'nohup xfce4-panel >/dev/null 2>&1 & disown || true; nohup xfdesktop >/dev/null 2>&1 & disown || true' || true
  sudo systemctl restart xrdp xrdp-sesman 2>/dev/null || true
}

optimize_xrdp_config() {
  local ini="/etc/xrdp/xrdp.ini"
  if [ ! -f "$ini" ]; then
    wn "xrdp.ini 不存在，跳過效能優化"
    return 0
  fi

  echo -e "  ${BLUE}→${RESET} 優化 xrdp.ini（降色彩深度 16-bit → 大幅減少滑鼠移動延遲）..."

  # Reduce from 32-bit to 16-bit — single biggest improvement for cursor movement lag
  if grep -q '^max_bpp=' "$ini"; then
    sudo sed -i 's/^max_bpp=.*/max_bpp=16/' "$ini"
  else
    sudo sed -i '/^\[Globals\]/a max_bpp=16' "$ini"
  fi

  # Bulk compression for WAN connections
  if ! grep -q '^bulk_compression=' "$ini"; then
    sudo sed -i '/^\[Globals\]/a bulk_compression=yes' "$ini"
  else
    sudo sed -i 's/^bulk_compression=.*/bulk_compression=yes/' "$ini"
  fi

  ok "xrdp.ini 優化完成（max_bpp=16、bulk_compression=yes）"
  wn "重要：RDP 客戶端連線時也需選 16-bit 色彩深度，否則設定不完全生效"
}

ensure_rdp_session() {
  local xs="/home/ubuntu/.xsession"
  local xinitrc="/home/ubuntu/.xinitrc"

  echo -e "  ${BLUE}→${RESET} 安裝 xrdp / XFCE session 依賴..."
  fix_broken_apt
  ensure_xfce_packages
  optimize_xrdp_config

  launcher="$(detect_xfce_launcher)"
  write_xfce_session_files "$launcher"
  sudo mkdir -p /home/ubuntu/.config /home/ubuntu/.cache
  sudo chown -R ubuntu:ubuntu /home/ubuntu/.config /home/ubuntu/.cache

  repair_xfce_desktop

  sudo systemctl restart xrdp xrdp-sesman 2>/dev/null || true

  if [ -n "$launcher" ]; then
    ok "XFCE session：$launcher 已可用"
  else
    fail_ "XFCE session：找不到 startxfce4 / xfce4-session"
  fi
}

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

ensure_rdp_session

if systemctl is-active --quiet xrdp 2>/dev/null; then
  ok "xrdp 服務：active (running)"
else
  fail_ "xrdp 啟動失敗（執行 journalctl -xe -u xrdp 排查）"
fi

# Port 3389
if ! ss -tlnp 2>/dev/null | grep -q ':3389'; then
  sudo systemctl restart xrdp 2>/dev/null
  sudo ufw allow 3389/tcp 2>/dev/null || true
fi

if ss -tlnp 2>/dev/null | grep -q ':3389'; then
  ok "Port 3389：監聽中（$(ss -tlnp | grep ':3389' | awk '{print $4}' | head -1)）"
else
  fail_ "Port 3389 未監聽 → 請確認 EC2 Security Group 已開放 TCP 3389 Inbound"
fi

XS="/home/ubuntu/.xsession"
if [ -f "$XS" ]; then
  ok "~/.xsession：已設定（$(head -1 "$XS")）"
else
  fail_ "~/.xsession：不存在"
fi

if [ -f /home/ubuntu/.xinitrc ]; then
  ok "~/.xinitrc：已建立"
fi

sudo -u ubuntu bash -lc 'test -x ~/.xsession && test -f ~/.xsession && grep -Eq "startxfce4|xfce4-session" ~/.xsession' \
  && ok "RDP session：使用者啟動檔案檢查通過" \
  || fail_ "RDP session：使用者啟動檔案檢查失敗"

if [ -f /var/log/xrdp-sesman.log ]; then
  echo -e "  ${BLUE}→${RESET} 最近的 xrdp-sesman 錯誤摘要："
  tail -n 8 /var/log/xrdp-sesman.log 2>/dev/null | sed 's/^/    /'
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
  if [ "$DEBUG_LOGS" -eq 1 ]; then
    collect_rdp_debug_logs
  fi
fi

echo ""
