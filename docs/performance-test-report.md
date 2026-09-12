# JVTutorCorner 多環境壓測性能比較報告

> **版本**：v1.0（2026-07-17）  
> **狀態**：部分欄位待補充（標記 `[待補充]`）

---

## 1. 執行摘要

### MVP 壓測目標

**10 組並發教室**同時運行，且成功率 ≥ 95%（`merge-distributed-results.ps1` 預設門檻）。

每「組」定義：
- 1 位老師 + 1 位學生 = **最少 2 個 Chromium headless 進程**
- 完整流程：建立課程 → 審核 → 學生報名 → 進入教室 → PDF 上傳/同步 → 白板場景載入

| 環境 | 可達組數 | 狀態 |
|---|---|---|
| Windows（本機） | ~7 | 瓶頸確認 |
| Mac（本機） | ~7 | 瓶頸確認 |
| EC2 t3.medium（Ubuntu 24.04） | [待補充] | 測試進行中 |

**結論預判**：Windows / Mac 不足以達到 MVP。EC2 是突破上限的可行方案；若單機仍不足，改用分散式模式（多機合計）可確保達標。

---

## 2. 環境規格對比

| 規格項目 | Windows | Mac | EC2 Ubuntu |
|---|---|---|---|
| 作業系統 | Windows 10/11 | macOS `[待補充]` | Ubuntu 24.04 LTS |
| CPU | `[待補充]` 核 | `[待補充]`（M1/M2/Intel？） | 2 vCPU（Intel Xeon E5-2676 v3） |
| RAM | `[待補充]` GB | `[待補充]` GB | 4 GB |
| 儲存 | `[待補充]` SSD | `[待補充]` SSD | 6.8 GB gp2 EBS |
| Swap | 系統虛擬記憶體（自動） | 系統虛擬記憶體（自動） | 手動建立（~1GB） |
| Playwright 模式 | headless（預設） | headless（預設） | headless + Xvfb（虛擬顯示器） |
| GUI 層 | Windows Desktop | macOS Desktop | Xfce4 + XRDP（僅 debug 用） |
| 網路 | 家用寬頻 | 家用寬頻 | AWS ap-northeast-1（東京） |
| 測試環境 | `APP_ENV=production` | `APP_ENV=production` | `APP_ENV=production` |

---

## 3. 每組資源消耗估算

### 3.1 每 Chromium 進程（headless）

| 資源 | 閒置狀態 | 測試進行中（Agora RTC + WebSocket） |
|---|---|---|
| RAM | 100–150 MB | 150–250 MB |
| CPU | 0.02–0.05 vCPU | 0.1–0.4 vCPU（burst） |
| 磁碟 I/O | 幾乎為零 | PDF 上傳暫存、失敗截圖/影片 |
| 網路 | 待機 | WebSocket 持續、Agora STUN/RTP 封包 |

### 3.2 N 組並發需求試算

| 組數 | Browser 進程數 | RAM 預估 | CPU 預估（峰值） | 備注 |
|---|---|---|---|---|
| 3 組 | 6 | ~1.2 GB | ~0.8 vCPU | 輕鬆通過 |
| 5 組 | 10 | ~2.0 GB | ~1.5 vCPU | 本機可承受 |
| 7 組 | 14 | ~2.8 GB | ~2.1 vCPU | 本機極限（開始出現瓶頸） |
| 10 組 | 20 | **~4.0 GB** | **~3.0 vCPU** | 超過本機 RAM、接近 EC2 上限 |

> **關鍵瓶頸**：10 組需要約 4 GB RAM，這正好等於 EC2 t3.medium 的全部可用記憶體（不含 OS 開銷 ~0.5–0.8 GB）。

### 3.3 附加資源開銷

| 組件 | 說明 | 每組開銷 |
|---|---|---|
| WebSocket（白板同步） | 每組維持 1-2 條長連線 | 可忽略（<1MB/s） |
| Agora RTC | 假設裝置串流（`--use-fake-device-for-media-stream`） | 少量 CPU、~50 KB/s 網路 |
| PDF 暫存 | 老師上傳 PDF → 暫存於 `/tmp` | ~1–5 MB/組 |
| 失敗時影片 | `video: 'retain-on-failure'` | ~10–50 MB/次 |
| 失敗時截圖 | `screenshot: 'only-on-failure'` | ~100–500 KB/次 |

---

## 4. 四大瓶頸詳細分析

### 4.1 記憶體不足（OOM）→ Browser 進程被 Kill

**現象**：Chrome 進程無預警崩潰，Playwright 拋出 `Target crashed`、`ERR_INSUFFICIENT_RESOURCES`  
**根本原因**：

```
10 組 × 2 進程 × ~200 MB = 4 GB
+ OS（~700 MB） + Node.js 測試進程（~300 MB）
= 約 5 GB 需求 > 本機可用 RAM
```

Windows / Mac 的虛擬記憶體（swap）雖然存在，但 **swap page fault** 在高頻 Agora RTC 回調下會導致大量 IO 等待，實際效果不佳。

**EC2 對策**：
- 建立 1 GB swap（`/swapfile`），提供緩衝
- Xvfb 替代真實 GUI，減少顯示層 RAM 開銷（省 ~100–200 MB）
- 測前執行 `check-jvtutorcorner-env.sh` 清理磁碟與確認 swap 存在

### 4.2 CPU 100% 飽和 → 系統卡死

**現象**：測試期間整機無法操作，Playwright timeout 大量出現  
**根本原因**：

- `fullyParallel: false`、`workers: 1`——測試本身是序列的，但**每組的 Browser 進程是同時存在的**
- Agora RTC 使用 WebRTC，即使是假裝置也有 STUN/DTLS 握手 CPU 開銷
- WebSocket 白板同步事件在所有組同時觸發（進教室、PDF 換頁），造成 **event loop 爆炸**
- 本機背景程式（防毒、Dock、通知）進一步搶佔 CPU

**EC2 對策**：
- t3.medium 是 **burstable 機型**，有 CPU Credit，短時間峰值可承受
- EC2 沒有桌面背景程式搶佔 CPU
- Xfce4 compositing 已停用，RDP 斷線後幾乎零 GUI 開銷

### 4.3 測試 Timeout

**現象**：單一步驟超過 60 秒（`timeout: 60000` in `playwright.config.ts:27`）  
**根本原因**：這是 4.1 與 4.2 的次生問題——RAM/CPU 資源不足導致 API 回應延遲、頁面載入緩慢、WebSocket 事件延遲，最終觸發 timeout。

**EC2 對策**：
- 資源更充裕時，同樣的步驟能在 60 秒內完成
- 若 EC2 仍 timeout，可在 `playwright.config.ts` 針對壓測場景個別提高 `timeout`（但優先解決資源問題）

### 4.4 磁碟 / 暫存空間不足

**現象**：PDF 上傳失敗、影片寫入失敗、甚至 Node.js 拋出 `ENOSPC`  
**根本原因**：

| 來源 | 大小 |
|---|---|
| Playwright 失敗影片（per test） | 10–50 MB |
| Playwright 失敗截圖 | ~300 KB |
| PDF 暫存 | ~2 MB/組 |
| Next.js build cache / .swc binaries | 2× 113 MB |
| Playwright Chrome cache | 258 MB |
| snap packages（舊） | 180 MB |

本機（Windows/Mac）磁碟通常充足，但壓測產生大量失敗影片時可能在測試工作目錄造成 I/O 飽和。  
**EC2 風險更高**：EBS 只有 6.8 GB，Playwright Chrome（258 MB）+ swapfile（1 GB）後可用空間不足 2 GB。

**EC2 對策**：
1. 執行 `setup-jvtutorcorner-env.sh` 預清理（移除舊 snap、apt cache、journal）
2. 壓測完立即 `scp` 報告到本機，EC2 上刪除 `playwright-report/` 和 `test-results/`
3. 長期建議：EBS 擴充至 15–20 GB（gp3 $1.6/月，一勞永逸）

---

## 5. EC2 的突破點

### 為什麼 EC2 有機會超越本機

| 面向 | 本機 Windows/Mac | EC2 t3.medium |
|---|---|---|
| 背景程式干擾 | 高（防毒、Dock、通知中心） | 幾乎為零 |
| RAM 競爭 | OS + 其他應用 ~2–3 GB | 僅 OS ~0.7 GB |
| GPU/顯示層開銷 | 有（真實 GPU） | 無（Xvfb 虛擬顯示） |
| Swap 策略 | 系統管理，page fault 延遲高 | 手動 1 GB `/swapfile`，可控 |
| CPU burstable | 否（固定） | 是（t3 CPU Credit） |
| 可調配置 | 受限（家用機型） | 可隨時升級規格（t3.large / c5） |

### 5.1 已套用的 EC2 最佳化設定

```bash
# 1. Swap（防 OOM）
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile

# 2. 磁碟清理（確保 >2GB 可用）
sudo bash setup-jvtutorcorner-env.sh   # 包含 apt cache / snap / journal 清理

# 3. headless 模式（不需要 Xorg 真實顯示）
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 &

# 4. NO_AT_BRIDGE=1（消除 AT-SPI bridge 3-5 秒延遲）
export NO_AT_BRIDGE=1

# 5. 執行壓測
APP_ENV=production CONCURRENT_GROUPS=10 npx playwright test \
  --project=chromium \
  e2e/classroom/07_room_pdf_sync_stress.spec.ts
```

### 5.2 環境健康確認

執行前用 `check-jvtutorcorner-env.sh` 確認：

| 檢查項目 | 合格標準 |
|---|---|
| RAM 可用 | ≥ 500 MB（其餘由 swap 補充） |
| Swap | ≥ 512 MB |
| 磁碟可用 | ≥ 2 GB |
| xrdp 服務 | 不影響壓測（停用亦可） |
| Chromium | Playwright cache 路徑可用 |

---

## 6. 分散式測試策略（終極保底方案）

若單一 EC2 t3.medium 仍無法穩定支撐 10 組，改用**分散式模式**：

```
機器 A（EC2 t3.medium）    → CONCURRENT_GROUPS=5  → results-machine-A.json
機器 B（本機 Windows/Mac）  → CONCURRENT_GROUPS=5  → results-machine-B.json
合計                                                → 10 組
```

合併結果：

```powershell
# 在任一機器執行
powershell -ExecutionPolicy Bypass -File e2e/scripts/merge-distributed-results.ps1 `
  -ResultsGlob "results-machine-*.json" -SuccessThreshold 0.95
```

**優點**：
- 充分利用現有硬體
- 每台機器只需負擔 5 組（~2 GB RAM），均在舒適區間
- 透過 `SYNC_START_TIME` 讓多機同時開始，模擬真實並發負載

**缺點**：
- 需要協調兩台機器同步啟動
- 本機 5 組可能仍有 CPU burst 問題（但比 7 組低很多）

---

## 7. 測試執行建議流程

### 標準流程（EC2 單機）

```
1. aws ec2 start-instances
2. SSH：sudo bash check-jvtutorcorner-env.sh   ← 確認環境健康
3. SSH：APP_ENV=production CONCURRENT_GROUPS=10 \
        npx playwright test --project=chromium \
        e2e/classroom/07_room_pdf_sync_stress.spec.ts
4. SSH：scp -r ubuntu@<IP>:~/jvtutorcorner-rwd/playwright-report ./
5. aws ec2 stop-instances                       ← 立即停機
6. 本機：開啟 playwright-report/index.html
```

### 測試失敗排查流程（需要 RDP 時）

```
1. aws ec2 start-instances
2. RDP 連入（mstsc → <EC2 IP>:3389，帳號 ubuntu）
3. 重現失敗步驟（HEADLESS=false 可在 Xfce4 看到瀏覽器視窗）
4. 排查完畢 → 斷開 RDP
5. aws ec2 stop-instances
```

---

## 8. MVP 達成結論

| 情境 | 組數 | 狀態 | 達標 |
|---|---|---|---|
| Windows / Mac 本機 | 7 | 瓶頸確認 | ✗ |
| EC2 t3.medium（單機） | [待補充] | 測試中 | [待確認] |
| EC2 t3.large（8GB RAM） | 預估 10+ | 未測試 | ✓（預期） |
| 分散式（EC2 5 + 本機 5） | 10 | 可行 | ✓ |

> **建議**：EC2 測試結果出來後填入第三列。若單機 10 組成功率 ≥ 95%，MVP 達標；否則改分散式模式或升級至 t3.large（$0.0832/hr）。

---

## 9. 後續行動清單

- [ ] 補充 Windows CPU/RAM 規格
- [ ] 補充 Mac 機型/RAM 規格
- [ ] EC2 壓測完成後填入「實際可達組數」與「失敗模式細節」
- [ ] 若 10 組未達標：決定分散式 vs. 升級 EC2 規格
- [ ] 長期：EBS 擴充至 20 GB（$1.6/月）消除磁碟壓力

---

*本報告依據 `playwright.config.ts`、`e2e/classroom/07_room_pdf_sync_stress.spec.ts`、`e2e/scripts/merge-distributed-results.ps1` 及歷次 EC2 操作記錄生成。*
