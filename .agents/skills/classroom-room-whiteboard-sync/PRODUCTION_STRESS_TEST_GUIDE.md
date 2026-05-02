# 正式環境壓力測試指南
## Production Environment Stress Testing Guide

**最後更新日期**: 2026-04-25  
**測試環境**: https://www.jvtutorcorner.com  
**Skill**: `classroom-room-whiteboard-sync`

---

## 📋 目錄

1. [前置準備](#前置準備)
2. [快速開始](#快速開始)
3. [測試方案對比](#測試方案對比)
4. [詳細使用指南](#詳細使用指南)
5. [結果分析](#結果分析)
6. [故障排查](#故障排查)

---

## 前置準備

### 1️⃣ 環境配置

確保 `.env.production` 文件已配置正確的認證信息：

```bash
# 複製為 .env.production（如果尚未存在）
cp .env.local .env.production
```

編輯 `.env.production` 並確認以下變數：

```env
NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com
QA_TEACHER_EMAIL=lin@test.com
QA_TEACHER_PASSWORD=<YOUR_PASSWORD>
QA_STUDENT_EMAIL=pro@test.com
QA_STUDENT_PASSWORD=<YOUR_PASSWORD>
LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>
```

### 2️⃣ 安裝依賴

#### Playwright 測試（推薦首先）

```bash
# Playwright 通常已安裝，但確保版本是最新
npm install

# 如果需要重新安裝瀏覽器
npx playwright install chromium
```

#### k6 負載測試工具（可選）

若要進行真正的負載測試，需要安裝 k6：

**Windows (Chocolatey)**:
```powershell
choco install k6
```

**Windows (Manual)**:
1. 下載: https://github.com/grafana/k6/releases
2. 解壓到 `C:\Program Files\k6`
3. 將 `C:\Program Files\k6` 加入 PATH

**macOS**:
```bash
brew install k6
```

**驗證安裝**:
```bash
k6 version
# 應該輸出類似: k6 v0.46.0
```

### 3️⃣ 驗證連接

測試與正式環境的連接：

```bash
# 測試基礎連接
curl -I https://www.jvtutorcorner.com

# 測試 API 可用性
curl https://www.jvtutorcorner.com/api/health
```

---

## 快速開始

### 🚀 基礎 E2E 壓力測試（推薦）

最簡單的方式是使用 Playwright 進行 E2E 壓力測試：

```bash
# 3 組並發（教師-學生對）- 預估時間: 3-5 分鐘
npm run test:production:stress

# 或手動執行
NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium
```

### 📊 真正的負載測試（k6）

```bash
# 基礎負載測試 (10 虛擬用戶, 30 秒)
k6 run .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js --env BASE_URL=https://www.jvtutorcorner.com

# 50 虛擬用戶的壓力測試
k6 run -e VUSER=50 .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js --env BASE_URL=https://www.jvtutorcorner.com

# Spike 測試（突然流量激增）
k6 run -e TEST_TYPE=spike -e VUSER=10 .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js --env BASE_URL=https://www.jvtutorcorner.com
```

### 🔧 自訂壓力測試腳本

使用提供的 Node.js 腳本進行多次迴圈測試：

```bash
# 運行 3 次壓力測試，每次 5 組並發
STRESS_RUNS=3 STRESS_GROUP_COUNT=5 node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

---

## 測試方案對比

| 方案 | 工具 | 用途 | 真實性 | 複雜度 | 時間 | 推薦 |
|------|------|------|--------|--------|------|------|
| **Playwright E2E** | Playwright | 驗證功能完整性 | ⭐⭐⭐⭐ | 低 | 3-5 分 | ✅ 首選 |
| **Node.js 腳本** | Node.js | 多輪迴圈測試 | ⭐⭐⭐ | 中 | 可自訂 | ✅ 二選 |
| **k6 負載測試** | k6 | 真正負載測試 | ⭐⭐ | 高 | 5-10 分 | ⭐ 進階 |

---

## 詳細使用指南

### Playwright E2E 壓力測試

#### 執行基礎測試

```bash
# 設定正式環境 URL 並運行
NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com \
  npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  -g "Stress test" \
  --project=chromium
```

#### 自訂並發組數

```bash
# 5 組並發
STRESS_GROUP_COUNT=5 \
  NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com \
  npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  -g "Stress test" \
  --project=chromium
```

#### 詳細模式執行

```bash
# 顯示詳細日誌
NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com \
  npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  -g "Stress test" \
  --project=chromium \
  --reporter=verbose
```

#### 生成 HTML 報告

```bash
NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com \
  npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  -g "Stress test" \
  --project=chromium \
  --reporter=html

# 打開報告
npx playwright show-report
```

---

### k6 負載測試詳解

#### 基礎負載測試

```bash
k6 run \
  -e BASE_URL=https://www.jvtutorcorner.com \
  -e QA_TEACHER_EMAIL=lin@test.com \
  -e QA_TEACHER_PASSWORD=<YOUR_PASSWORD> \
  -e QA_STUDENT_EMAIL=pro@test.com \
  -e QA_STUDENT_PASSWORD=<YOUR_PASSWORD> \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
```

#### 壓力測試（逐步增加負載）

```bash
k6 run \
  -e BASE_URL=https://www.jvtutorcorner.com \
  -e TEST_TYPE=stress \
  -e VUSER=20 \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
```

**預期行為**:
- 階段 1 (30 秒): 逐步增加到 20 虛擬用戶
- 階段 2 (60 秒): 增加到 40 虛擬用戶
- 階段 3 (60 秒): 增加到 60 虛擬用戶
- 階段 4 (30 秒): 逐步降至 0

#### Spike 測試（突發流量）

```bash
k6 run \
  -e BASE_URL=https://www.jvtutorcorner.com \
  -e TEST_TYPE=spike \
  -e VUSER=10 \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
```

**預期行為**:
- 20 秒内增加到 10 用戶
- 突然激增到 50 用戶（5 秒）
- 恢復到 10 用戶（20 秒）
- 逐步降至 0

#### 性能報告匯出

```bash
# 匯出為 JSON
k6 run \
  -e BASE_URL=https://www.jvtutorcorner.com \
  --out json=results.json \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js

# 使用 Grafana 儀表板（需要 Grafana 設置）
k6 run \
  -e BASE_URL=https://www.jvtutorcorner.com \
  --out influxdb=http://localhost:8086/k6 \
  .agents/skills/classroom-room-whiteboard-sync/scripts/production_load_test.js
```

---

### Node.js 多輪測試

#### 基本執行

```bash
# 使用 .env.production 配置
node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

#### 自訂配置

```bash
# 10 組並發，運行 2 次
STRESS_GROUP_COUNT=10 STRESS_RUNS=2 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

#### 調試模式

```bash
# 詳細日誌輸出
STRESS_TEST_LOG_LEVEL=verbose \
  STRESS_GROUP_COUNT=3 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

---

## 結果分析

### Playwright 測試結果

成功的壓力測試應輸出類似：

```
✅ [stress] Group 0: Teacher & Student entered classroom
   - Canvas Check: true
✅ [stress] Group 1: Teacher & Student entered classroom
   - Canvas Check: true
✅ [stress] Group 2: Teacher & Student entered classroom
   - Canvas Check: true
✅ All stress test groups completed successfully
```

### k6 測試結果

k6 會輸出詳細的性能指標：

```
     checks....................: 95.00% ✓ 190, ✗ 10
     data_received..............: 2.3 MB
     data_sent..................: 1.1 MB
     group_duration.............: avg=2.3s min=1.1s med=2.2s max=5.4s p(90)=3.8s p(95)=4.2s
     http_req_duration...........: avg=450ms min=100ms med=420ms max=2.3s p(90)=850ms p(95)=1.2s
     http_req_failed............: 5.00% ✓ 10
     login_error_rate...........: 3.00% ✓ 6
     classroom_entry_error_rate.: 8.00% ✓ 16
     whiteboard_sync_error_rate.: 12.00% ✓ 24
```

### 關鍵指標說明

| 指標 | 說明 | 健康範圍 |
|------|------|---------|
| **http_req_duration (p95)** | 95% 的請求在此時間內完成 | < 2000ms |
| **http_req_failed** | 失敗的請求比例 | < 5% |
| **login_error_rate** | 登入失敗率 | < 3% |
| **classroom_entry_error_rate** | 進入教室失敗率 | < 10% |
| **whiteboard_sync_error_rate** | 白板同步失敗率 | < 20% |
| **checks** | 通過的斷言 | > 95% |

---

## 故障排查

### ❌ 連接失敗

**症狀**: `Error: getaddrinfo ENOTFOUND www.jvtutorcorner.com`

**解決方案**:
```bash
# 檢查網絡連接
ping www.jvtutorcorner.com

# 檢查 DNS
nslookup www.jvtutorcorner.com

# 測試 HTTPS
curl -v https://www.jvtutorcorner.com
```

### ❌ 登入失敗

**症狀**: `❌ Login failed (401): Unauthorized`

**解決方案**:
1. 驗證 `.env.production` 中的認證信息
2. 確認 QA 帳戶在正式環境中存在
3. 檢查 bypass secret 是否正確

```bash
# 手動測試登入
curl -X POST https://www.jvtutorcorner.com/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lin@test.com",
    "password": "<YOUR_PASSWORD>",
    "captchaValue": "<YOUR_BYPASS_SECRET>"
  }'
```

### ❌ 超時失敗

**症狀**: `Error: Timeout 300000ms exceeded`

**解決方案**:
1. 增加超時時間
2. 降低並發組數
3. 檢查正式環境的網絡延遲

```bash
# 增加超時時間到 600 秒
STRESS_TEST_TIMEOUT=600000 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

### ❌ 白板同步失敗

**症狀**: `Canvas Check: false`

**解決方案**:
1. 檢查 Agora Whiteboard App ID 配置
2. 驗證 WebSocket 連接
3. 查看瀏覽器控制台日誌

```bash
# 啟用詳細日誌
STRESS_TEST_LOG_LEVEL=verbose \
  NEXT_PUBLIC_BASE_URL=https://www.jvtutorcorner.com \
  npx playwright test \
  e2e/classroom_room_whiteboard_sync.spec.ts \
  -g "Stress test" \
  --project=chromium \
  --reporter=verbose
```

### ❌ 並發衝突

**症狀**: 部分群組進入教室後無法同步

**解決方案**:
1. 降低並發組數（從 3 降至 2）
2. 增加 GROUP_SETUP_DELAY

```bash
# 延保 5 秒的設置延遲
GROUP_SETUP_DELAY=5000 \
  STRESS_GROUP_COUNT=2 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

---

## 🎯 性能基準線

基於歷史測試數據，以下是預期的性能基準：

### Playwright E2E 測試

| 並發組數 | 通過率 | 平均時間 | 備註 |
|---------|-------|---------|------|
| 1 組 | 95%+ | 90-120s | 基礎測試 |
| 3 組 | 90%+ | 180-240s | 標準壓力 |
| 5 組 | 85%+ | 300-420s | 高負載 |
| 10 組 | 70%+ | 600s+ | 極限測試 |

### k6 負載測試

| 虛擬用戶 | HTTP 成功率 | P95 延遲 | 備註 |
|---------|-----------|---------|------|
| 10 | 98%+ | < 800ms | 正常 |
| 50 | 95%+ | < 1200ms | 中等負載 |
| 100 | 90%+ | < 2000ms | 高負載 |
| 200 | 80%+ | < 3000ms | 極限 |

---

## 📝 注意事項

⚠️ **警告**: 在正式環境進行壓力測試時請注意：

1. **時間選擇**: 在非業務高峰期進行測試
2. **用戶通知**: 通知相關人員，以免被誤認為攻擊
3. **測試帳戶**: 確保使用專用的 QA 帳戶
4. **數據清理**: 測試完成後清理生成的臨時數據
5. **監控告警**: 檢查是否觸發了異常流量告警

---

## 📞 支持

如有問題或需要進一步幫助，請參考：

- [Playwright 文檔](https://playwright.dev/)
- [k6 文檔](https://k6.io/docs/)
- [classroom-room-whiteboard-sync SKILL](../SKILL.md)
- [auto-login SKILL](../../auto-login/SKILL.md)

---

**最後編輯**: 2026-04-25
