# RDP 壓測啟動流程

這份流程的目標是：

1. 先透過 SSH 在 EC2 上啟動壓力測試
2. 再讓目前的 XRDP 桌面自動打開測試網頁
3. 需要時在遠端桌面中自動開終端機執行指定命令

## 新增腳本

請使用：

```bash
scripts/rdp-stress-launch.sh
```

它會：

- 自動偵測目前 active X display
- 以目前的 RDP session 開啟瀏覽器
- 以目前的 RDP session 開啟終端機

## 使用方式

### 1. 先透過 SSH 登入 EC2

```bash
ssh ubuntu@<EC2_IP>
```

### 2. 先在 SSH 內啟動壓力測試

依你的測試腳本執行，例如：

```bash
bash scripts/classroom_stress_test.sh
```

或是你自己的 `playwright` / `k6` 指令。

### 3. 讓 RDP 自動開網頁與終端機

```bash
bash scripts/rdp-stress-launch.sh http://localhost:3000 "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
```

第二個參數是要在遠端桌面終端機執行的指令。

## 典型搭配

### 只開網頁

```bash
bash scripts/rdp-stress-launch.sh https://www.jvtutorcorner.com
```

### 開網頁並在終端機執行測試

```bash
bash scripts/rdp-stress-launch.sh http://localhost:3000 "cd ~/jvtutorcorner-rwd && npm run test:stress"
```

### 開本機測試頁並執行壓測

```bash
bash scripts/rdp-stress-launch.sh http://localhost:3000 "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
```

## 前置條件

- EC2 上已經有可用的 XRDP session
- `xfce4-terminal`、`xdg-open` 或 `chromium` / `google-chrome` / `firefox` 至少有一個可用
- 你已經先登入 RDP，讓 active display 存在

## 如果沒有跳出視窗

先確認：

```bash
echo $DISPLAY
ps -eo args= | grep Xorg
which xfce4-terminal
which xdg-open
which chromium
which google-chrome
which firefox
```

如果沒有 active display，這支 launcher 不會硬開視窗，因為那樣會開到錯誤的 session。

