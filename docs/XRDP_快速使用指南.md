# XRDP 快速使用指南

本文件說明 `setup-jvtutorcorner-env.sh` 與 `check-jvtutorcorner-env.sh` 的用途、執行順序、常見問題與排錯方式。

## 目的

這兩支腳本是用來在 EC2 Ubuntu 環境中建立與修復 XRDP + XFCE 遠端桌面。

- `setup-jvtutorcorner-env.sh`
  - 初次建置或重建環境時使用
  - 會補齊 XRDP / XFCE 套件
  - 會產生 `.xsession`、`.xinitrc`
  - 會套用低負載與快速登入設定

- `check-jvtutorcorner-env.sh`
  - 環境已經可以進去，但出現藍屏、黑屏、無法點擊、登入後自動斷線時使用
  - 會自動檢查、修復、並輸出關鍵 log
  - 會嘗試修正目前 active display 對應的 session

## 建議執行順序

1. 先更新程式碼

```bash
git pull --rebase
```

2. 初次建置或完整重建時，先跑 setup

```bash
sudo bash setup-jvtutorcorner-env.sh
```

3. 如果已經能登入，但畫面異常或操作卡住，改跑 check

```bash
sudo bash check-jvtutorcorner-env.sh
```

## 你現在這版腳本做了什麼

### 1. 修復 XRDP 常見登入失敗

腳本會處理這些情況：

- `startxfce4: not found`
- `xfce4-session: not found`
- 登入後立刻跳回登入畫面
- 藍屏、黑屏、畫面出現但不能點
- session 啟動後很快結束

### 2. 套用輕量化 RDP 模式

目前腳本會自動套用：

- 關桌布
- 關動畫
- 關 compositor
- 關 screen saver / lock
- 關通知
- 關音效提示
- 降低 XFCE 背景負載

### 3. 套用極簡快速登入模式

為了縮短首屏顯示時間，腳本會：

- 先啟動桌面骨架
- 再延後啟動 `xfce4-panel`
- 避免 panel 初始化卡住登入流程

## 需要注意的帳號

這份腳本預設使用：

- 系統使用者：`ubuntu`
- RDP 連線時請使用對應的 `ubuntu` 帳號與密碼

如果你要檢查密碼，通常不是用腳本直接顯示，而是直接重設：

```bash
sudo passwd ubuntu
```

## 常見問題

### 1. 登入後直接斷線

先執行：

```bash
sudo bash check-jvtutorcorner-env.sh
```

它會輸出：

- `systemctl status xrdp`
- `systemctl status xrdp-sesman`
- `journalctl -u xrdp -u xrdp-sesman`
- `~/.xsession-errors`

### 2. 看到藍屏但沒有桌面

通常代表 XFCE 元件沒起來，或者 session launcher 有問題。

檢查：

```bash
cat /home/ubuntu/.xsession
command -v startxfce4
command -v xfce4-session
```

如果 `startxfce4` 和 `xfce4-session` 都找不到，請先讓腳本重裝 XFCE 套件。

### 3. 可以看到桌面，但無法點擊

這通常與以下因素有關：

- `xfwm4` compositor
- screensaver / lock
- active display 沒有被正確修復

請跑：

```bash
sudo bash check-jvtutorcorner-env.sh --debug-logs
```

### 4. 登入後延遲 20 秒，現在只剩 0.5 秒左右

這代表目前已經接近正常狀態。

再往下優化通常只剩：

- 減少 panel plugin
- 延後載入非必要 autostart
- 進一步壓縮桌面元件

## 排錯指令

### 查看服務狀態

```bash
systemctl status xrdp xrdp-sesman --no-pager
```

### 查看最近 log

```bash
journalctl -u xrdp -u xrdp-sesman -n 80 --no-pager
```

### 查看使用者 session log

```bash
cat /home/ubuntu/.xsession-errors
```

### 驗證 XFCE launcher

```bash
command -v startxfce4
command -v xfce4-session
```

### 檢查目前桌面設定

```bash
cat /home/ubuntu/.xsession
cat /home/ubuntu/.xinitrc
ls -la /home/ubuntu/.config/autostart
```

## RDP 連線建議

為了讓目前這組輕量模式發揮最佳效果，RDP 客戶端建議：

- 色彩深度選 `16-bit`
- 解析度先用 `1280x720`
- 若要測試效能，再逐步提高解析度

## 何時用 setup，何時用 check

- `setup-jvtutorcorner-env.sh`
  - 新機建置
  - 套件缺失
  - `.xsession` 需要重建
  - 要重新套用整套桌面設定

- `check-jvtutorcorner-env.sh`
  - 已經可登入，但出現異常
  - 想看完整排錯 log
  - 要修復目前 active session

## 建議的實際流程

1. `git pull --rebase`
2. `sudo bash setup-jvtutorcorner-env.sh`
3. 重新連線 RDP
4. 若仍有問題，執行 `sudo bash check-jvtutorcorner-env.sh --debug-logs`
5. 依輸出 log 判斷是 launcher、XFCE 元件，還是 session/顯示卡住

