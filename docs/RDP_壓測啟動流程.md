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

它會提供兩種模式：

- `--ssh-only`：只在 SSH 裡執行壓測命令，不開任何 GUI
- `--rdp-open`：等到偵測到 active display 後，才在遠端桌面開瀏覽器與終端機

`--rdp-open` 會：

- 自動偵測目前 active X display
- 以目前的 RDP session 開啟瀏覽器
- 以目前的 RDP session 開啟終端機

如果你要手動指定 session，可以先設定：

```bash
DISPLAY=:10.0 bash scripts/rdp-stress-launch.sh --rdp-open
```

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

### 3. 讓 RDP 自動開正式環境網頁與終端機

```bash
bash scripts/rdp-stress-launch.sh --ssh-only "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
```

這個模式只跑壓測，不會開 RDP 視窗。

## 典型搭配

### 只開網頁

```bash
bash scripts/rdp-stress-launch.sh --rdp-open https://www.jvtutorcorner.com
```

### 開網頁並在終端機執行測試

```bash
bash scripts/rdp-stress-launch.sh --rdp-open https://www.jvtutorcorner.com "cd ~/jvtutorcorner-rwd && npm run test:stress"
```

### 用正式環境網址並執行壓測

```bash
bash scripts/rdp-stress-launch.sh --rdp-open https://www.jvtutorcorner.com "cd ~/jvtutorcorner-rwd && bash scripts/classroom_stress_test.sh"
```

## 前置條件

- EC2 上已經有可用的 XRDP session
- `xfce4-terminal`、`xdg-open` 或 `chromium` / `google-chrome` / `firefox` 至少有一個可用
- `--rdp-open` 模式下，你已經先登入 RDP，讓 active display 存在，或等腳本在 `WAIT_SECONDS` 內偵測到

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

如果沒有 active display，`--rdp-open` 會等待一段時間後才失敗。

你也可以調整等待秒數：

```bash
WAIT_SECONDS=90 bash scripts/rdp-stress-launch.sh --rdp-open
```
