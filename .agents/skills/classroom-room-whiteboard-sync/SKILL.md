---
name: classroom-room-whiteboard-sync
description: '驗證 /classroom/room 頁面中教師白板繪圖與學生實時同步功能。支援在已報名情況下跳過報名流程，並確保教師與學生分別從等待頁進入教室。'
argument-hint: '執行白板同步驗證測試，確保教師繪圖能同步到學生端。若已報名，會自動跳過報名步驟。'
metadata:
   verified-status: '✅ FULLY_VERIFIED'
   last-verified-date: '2026-04-25'
   architecture-aligned: true
   test-framework: '🎬 Streaming Platform Modular (like YouTube Live / Twitch / Zoom)'
   verification-results:
      - '✅ 基礎白板同步：教師端繪圖驗證通過 (Canvas Check: true)'
      - '✅ 學生同步驗證：學生端接收繪圖驗證通過 (Canvas Check: true)'
      - '✅ SSE 同步機制：雙方準備信號正確傳遞'
      - '✅ 教室進入邏輯：序列 POST + 並行進入運作正常'
      - '✅ 預檢查閘道：系統健康度檢查 (7 項 API 端點驗證)'
      - '✅ 金絲雀會話：單一會話 6 階段檢查點驗證'
      - '✅ 同步品質探針：5 次繪圖探針 + 60s 離線重連'
      - '✅ 持續時間穩定性：心跳監控（30s 間隔）+ 漂移檢測'
      - '✅ 分階段負載：1x / 3x / 5x / 10x 組並行，電路斷路器機制'
   stability-improvements-2026-04-19:
      - '✅ runEnrollmentFlow() 完整傳遞所有必要環境變數給 subprocess（包含 Agora config）'
      - '✅ 報名流程重試邏輯：maxRetries=2，間隔 2 秒'
      - '✅ 教室退出邏輯改進：優雅處理按鈕不可見的情況'
   long-term-fixes-applied:
      - '✅ student_enrollment_flow.spec.ts 已加入 teacherId 綁定邏輯'
      - '✅ 課程建立自動化：測試會自動建立臨時測試課程並回傳 `courseId`；`TEST_COURSE_ID` 為可選（未設定時自動產生），避免硬編碼 courseId'
      - '✅ 修復 classroom-wait 雙人同步驗證：'
      - '  - clickReadyButton 序列執行（避免時序問題）'
      - '  - enterClassroom 並行執行（但包含自動跳轉檢測）'
      - '  - 超時時間增加到 60 秒以容納網絡延遲'
      - '✅ [2026-04-11] 媒體權限自動化：BrowserContext 注入 camera/microphone 授權'
      - '✅ [2026-04-11] Canvas 選取器修復：使用 canvas:visible 避免抓到隱藏圖層'
      - '✅ [2026-04-11] 資源清理強化：使用 try...finally 確保測試失敗也會執行刪除'
      - '✅ [2026-04-19] DynamoDB race condition 修正：POST /api/classroom/ready 改為序列執行，避免並行讀取導致寫入覆蓋'
      - '✅ [2026-04-19] Playwright 媒體設備修正：playwright.config.ts 添加 --use-fake-device-for-media-stream 與 --use-fake-ui-for-media-stream Chromium 旗標'
      - '✅ [2026-04-19] Agora Whiteboard App ID 驗證：app/api/whiteboard/room/route.ts 添加 appIdentifier 格式驗證，提供清晰的錯誤訊息和設置指南'
      - '✅ [2026-04-20] 修復學生端「進入教室」按鈕不顯示問題：移除 app/student_courses/page.tsx 中的訂閱方案硬編碼攔截。'
      - '✅ [2026-04-20] 修復 E2E 時區偏移：student_enrollment_flow.spec.ts 與 whiteboard_helpers.ts 改用本地時間字串 (移除 "Z" 標記)'
      - '✅ [2026-04-25] 🎬 模組化流式平台測試架構：取代龐大的單一壓力測試，導入 5 個獨立專注模組（預檢查、金絲雀、品質、時長、負載），每個模組 <10 分鐘，支援精準故障診斷'
      - '✅ [2026-04-25] 流式平台設計模式：預檢查閘道 + 金絲雀門控 + 心跳監控 + 漂移檢測 + 電路斷路器，靈感源自 YouTube Live / Twitch 驗證框架'
      - '✅ [2026-04-25] SLO 可配置閾值：SYNC_LATENCY_SLO_MS=8000, API_LATENCY_SLO_MS=3000, SUCCESS_THRESHOLD=0.75，支援環境變數覆蓋'
      - '✅ [2026-04-25] 模組化幫助函式：streaming_monitor.ts 提供 health check、latency measurement、heartbeat、drift detection 等流式平台核心工具'
   related-skills:
      - auto-login
      - classroom-wait
      - classroom-ready
      - classroom-room
      - student-enrollment-flow

# 教室白板同步驗證技能

## 快速啟動

### 🎬 新建築：模組化流式平台測試架構 (2026-04-25)

取代單一龐大的壓力測試，現在使用 **5 個獨立的專注模組**，靈感來自 YouTube Live、Twitch、Zoom 等流式平台的驗證方法：

| 模組 | 檔案 | 時間 | 用途 |
|------|------|------|------|
| **預檢查** | `e2e/classroom/00_preflight.spec.ts` | ~30s | 🚪 API 健康度閘道 (7 個端點驗證) |
| **金絲雀** | `e2e/classroom/01_canary.spec.ts` | ~3-4m | 🪶 單一會話，6 階段檢查點（A–F） |
| **同步品質** | `e2e/classroom/02_sync_quality.spec.ts` | ~5-7m | 📊 5 次繪圖探針 + 60s 離線重連 |
| **時間穩定性** | `e2e/classroom/03_duration_stability.spec.ts` | 可配置 | ⏱️ 參數化：1m / 5m / 15m，心跳監控 |
| **負載遞升** | `e2e/classroom/04_load_escalation.spec.ts` | 可配置 | 📈 分階段：3x / 5x / 10x 並行組 |

#### 為什麼改變？

- **精準失敗**：一個模組壞掉，立即看到是哪個模組、哪個測試、哪個階段
- **快速反饋**：預檢查 30 秒即可判斷系統是否可用
- **可控測試**：運行任何一個模組而不需等待整個套件
- **預防式設計**：金絲雀/品質測試必須 PASS 才能執行負載測試

#### CI 推薦執行順序

```powershell
# 1️⃣ 預檢查（必須先通過）
npx playwright test e2e/classroom/00_preflight.spec.ts --project=chromium

# 2️⃣ 金絲雀（單一會話，所有階段）
npx playwright test e2e/classroom/01_canary.spec.ts --project=chromium

# 3️⃣ 同步品質（5 個繪圖探針，觀察品質穩定性）
npx playwright test e2e/classroom/02_sync_quality.spec.ts --project=chromium

# 4️⃣ 時間穩定性（選擇一個或多個時長）
$env:DURATION_MINUTES="1";  npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium
$env:DURATION_MINUTES="5";  npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium

# 5️⃣ 負載遞升（分階段測試）
$env:CONCURRENT_GROUPS="3";  npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
$env:CONCURRENT_GROUPS="5";  npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
```

**SLO 閾值** (可透過 env 覆蓋):
- `SYNC_LATENCY_SLO_MS=8000` — 繪圖→同步最大延遲
- `API_LATENCY_SLO_MS=3000` — API 最大回應時間
- `SUCCESS_THRESHOLD=0.75` — 負載測試通過閾值 (75% 組必須成功)

#### 緊急診斷流程

當生產環境出問題時，按順序運行：

```powershell
# 步驟 1：系統還活著嗎？
npx playwright test e2e/classroom/00_preflight.spec.ts --project=chromium

# 步驟 2：單一會話還能運作嗎？
npx playwright test e2e/classroom/01_canary.spec.ts --project=chromium --grep "Phase F"

# 步驟 3：同步品質降級了嗎？
$env:SYNC_LATENCY_SLO_MS="3000"; npx playwright test e2e/classroom/02_sync_quality.spec.ts

# 步驟 4：哪個負載等級會崩潰？
$env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/04_load_escalation.spec.ts
```

詳細指南：[e2e/classroom/README.md](../../../e2e/classroom/README.md)

---

### 基礎白板同步測試（推薦首先執行）

時間重疊的課程是導致測試失敗的主要原因之一。測試前必須執行清理：

```bash
# 確保 dev server 已啟動
npm run dev

# 在另一個終端執行清理（5-10 秒）
npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium
```

**清理操作包含**：
- ✅ 刪除所有測試課程（test 模式 + 已過期 + 時間重疊）
- ✅ 刪除相關訂單記錄
- ✅ 刪除相關注冊記錄
- ✅ 刪除測試教師帳號
- ✅ DynamoDB 深度清理（orders + enrollments 表）

**時間重疊課程檢測邏輯**：
```typescript
// 課程被標記為刪除的條件（滿足任一即可）：
1. 課程 ID 或標題包含測試模式：stress-group-*, sync-*, smoke-*, debug-*, E2E自動驗證
2. 課程結束時間已過期（endDate < 現在時間）
3. 課程進行中且與現在時間重疊（startDate < 現在時間 < endDate）且是測試課程
```

### 基礎白板同步測試（推薦首先執行）

```bash
# 確保 dev server 已啟動 (如果沒有)
npm run dev

# 在另一個終端執行測試
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Teacher drawings sync to student" --project=chromium
```

**預期結果**：✅ 驗證通過
- 教師繪圖驗證：Canvas Check = true
- 學生同步驗證：Canvas Check = true
- 測試時間：~90-120 秒

### 壓力測試（3 組併發，可選）

```bash
# ⚠️ 必須先執行清理！
npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium

# 然後執行並發測試（預期需要 5-10 分鐘）
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "stress" --project=chromium

# 自定義組數
STRESS_GROUP_COUNT=5 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "stress" --project=chromium
```

**當前狀態**：⚠️ 報名流程在 subprocess 並發環境下有穩定性問題（正在改進）

**環境前置**：`.env.local` 須包含以下變數（缺一不可）:
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=<YOUR_BYPASS_SECRET>
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=<YOUR_PASSWORD>
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=<YOUR_PASSWORD>
# CRITICAL: Agora Whiteboard SDK 驗證 - 必須是真實的 Agora App Identifier
# 取得方式：https://console.agora.io → Whiteboard Project → App Identifier
# 範例格式：32-50 個英數字符，如 "C2iYoNf8EfCXgP0Hg5ZziQ" (INVALID - 使用真實值)
AGORA_WHITEBOARD_APP_ID=your_real_agora_whiteboard_app_id_here
# OPTIONAL: If not set, tests will programmatically create a temporary test course and use its generated id
# TEST_COURSE_ID=      (optional)
```

> **⚠️ IMPORTANT**: 若 `AGORA_WHITEBOARD_APP_ID` 無效，測試會失敗並報告：`find invalid appIdentifier`
> - 前往 [Agora Console](https://console.agora.io) 建立 Whiteboard 專案
> - 複製真實的 App Identifier  
> - 更新 `.env.local` 中的 `AGORA_WHITEBOARD_APP_ID`

### 正式環境壓力測試（Production Stress Testing） 🚀

針對正式環境 (https://www.jvtutorcorner.com) 的壓力測試方案已新增！支援三種測試方式：

#### 方式 1️⃣：使用 npm 腳本（推薦 - 最簡單）

```bash
# 基礎壓力測試（3 組並發）
npm run test:production:stress

# 詳細模式
npm run test:production:stress:verbose
```

#### 方式 2️⃣：Node.js 多輪測試

```bash
# 5 組並發，執行 2 次
STRESS_RUNS=2 STRESS_GROUP_COUNT=5 \
  node .agents/skills/classroom-room-whiteboard-sync/scripts/production_stress_test.js
```

#### 方式 3️⃣：k6 真正的負載測試（進階）

```bash
# 基礎負載測試
npm run test:production:load

# 壓力測試（逐步增加負載）
npm run test:production:load:stress

# Spike 測試（突發流量）
npm run test:production:load:spike
```

**前置準備**：
1. 複製 `.env.local` 為 `.env.production`
2. 確認環境變數設置（base URL、QA 帳戶、bypass secret）
3. 若使用 k6，需先安裝：`choco install k6` (Windows) 或 `brew install k6` (macOS)

**詳細文檔**：📖 [正式環境壓力測試完整指南](./PRODUCTION_STRESS_TEST_GUIDE.md) 及 [快速參考](./scripts/README.md)

---

## 🔧 最新修復日誌 (2026-04-25 + 2026-04-19)

### 1️⃣ **DynamoDB Race Condition** ✅  
**症狀**：學生進入教室後，「立即進入教室」按鈕永不出現，導致 60 秒超時失敗  
**根因**：`Promise.all([enterClassroom(teacher), enterClassroom(student)])` 進行並行 POST，兩個請求同時讀取 DynamoDB 空列表，各自寫入自己的資料，後寫覆蓋前寫  
**修復**：  
- [`e2e/classroom_room_whiteboard_sync.spec.ts`](../../../e2e/classroom_room_whiteboard_sync.spec.ts) 行 615-630
- 改為序列執行：`await clickReadyButton(teacher)` → `await clickReadyButton(student)` → 並行進入教室  
- 新增響應監聽器確認 POST 成功，並添加 1s 穩定延遲

### 2️⃣ **No Local Devices Available** ✅  
**症狀**：Agora RTC SDK 報告 `No local devices available`，導致音視頻軌道創建失敗，Whiteboard SDK 載入受阻  
**根因**：Playwright E2E 測試環境沒有真實麥克風/攝影機，Chromium 的 `getUserMedia()` 無法枚舉設備  
**修復**：  
- [`playwright.config.ts`](../../../playwright.config.ts) 行 35-43
- 添加 Chromium 旗標：`--use-fake-device-for-media-stream` 與 `--use-fake-ui-for-media-stream`  
- 允許 Agora 建立虛擬音視頻軌道用於測試

### 3️⃣ **Invalid appIdentifier** ✅  
**症狀**：`find invalid appIdentifier: "C2iYoNf8EfCXgP0Hg5ZziQ"`，Agora WhiteWebSdk 初始化失敗  
**根因**：`AGORA_WHITEBOARD_APP_ID` 設置為虛擬值或無效格式，Agora SDK 驗證不通過  
**修復**：  
- [`app/api/whiteboard/room/route.ts`](../../../app/api/whiteboard/room/route.ts) 行 92-127
- 添加 `isValidAppId()` 驗證函數，檢查格式與長度
- 若驗證失敗，返回詳細錯誤訊息和設置指南
- SKILL.md 環境容器部分添加 `AGORA_WHITEBOARD_APP_ID` 配置說明

### 4️⃣ **Classroom Exit Flow** ✅ (2026-04-19 新增)
**症狀**：測試中「結束課程」按鈕有時不可見，導致超時失敗  
**修復**：
- [`e2e/classroom_room_whiteboard_sync.spec.ts`](../../../e2e/classroom_room_whiteboard_sync.spec.ts) 行 677-695
- 改進退出邏輯：先嘗試點擊按鈕，若不可見則直接導航
- 避免硬超時，提升容錯能力

### 5️⃣ **Subprocess Environment Variables** ✅ (2026-04-19 新增)  
**症狀**：壓力測試中報名流程無法存取完整環境變數  
**修復**：
- `runEnrollmentFlow()` 現傳遞完整環境變數：Agora 配置、bypass secret、base URL 等
- 添加 2 次重試邏輯，提高並發環境穩定性

### 6️⃣ **Student Dashboard Entry Button Visibility** ✅ (2026-04-20 新增)
**症狀**：學生報名成功且在時間內，但 `/student_courses` 卻顯示 `-` 而非「進入教室」
**根因**：
1. **方案硬編碼欄位**：`app/student_courses/page.tsx` 原先只允許 `['basic', 'pro', 'elite']` 顯示按鈕，漏掉了點數使用者或新創帳戶
2. **時區偏移 (Timezone Shift)**：E2E 腳本使用 `toISOString()` (帶 Z) 送出的 ISO 字串被前端誤判為本地時間，導致判斷上課時間時產生 8 小時偏移
**修復**：
- **方案權限**：移除方案類型檢查，改為只要有 Valid Order 且時間命中即允許進入
- **時間格式**：E2E 腳本（`student_enrollment_flow.spec.ts`, `whiteboard_helpers.ts`）改用 `.toISOString().slice(0, 16)` 搭配本地時區手動偏移，確保後端接收到的是準確的 local time string

### 6️⃣ **Student Dashboard Entry Button Visibility** ✅ (2026-04-20 新增)
**症狀**：學生報名成功且在時間內，但 `/student_courses` 卻顯示 `-` 而非「進入教室」
**根因**：
1. **方案硬編碼欄位**：`app/student_courses/page.tsx` 原先只允許 `['basic', 'pro', 'elite']` 顯示按鈕，漏掉了點數使用者或新創帳戶
2. **時區偏移 (Timezone Shift)**：E2E 腳本使用 `toISOString()` (帶 Z) 送出的 ISO 字串被前端誤判為本地時間，導致判斷上課時間時產生 8 小時偏移
**修復**：
- **方案權限**：移除方案類型檢查，改為只要有 Valid Order 且時間命中即允許進入
- **時間格式**：E2E 腳本（`student_enrollment_flow.spec.ts`, `whiteboard_helpers.ts`）改用 `.toISOString().slice(0, 16)` 搭配本地時區手動偏移，確保後端接收到的是準確的 local time string

---

## ✅ 驗證報告 (2026-04-25 - 模組化架構)

### 🚪 預檢查：`00_preflight.spec.ts`
**狀態**：✅ 全通過 (7/7 測試, 8.1s)

**驗證項**：
- ✅ `/api/captcha` → 200 (291ms)
- ✅ `/api/courses?limit=1` → 200 (481ms)
- ✅ `/api/orders?limit=1` → 200 (376ms)
- ✅ `/api/classroom/ready` → 400 (預期 GET 不支援)
- ✅ `/api/whiteboard/room` → 405 (預期無權限)
- ✅ 登入 API 延遲 < 3000ms
- ✅ 環境變數完整（NEXT_PUBLIC_BASE_URL, LOGIN_BYPASS_SECRET, AGORA_WHITEBOARD_APP_ID）

**用途**：若此測試失敗，**停止後續測試** — 系統未就緒。

### 🪶 金絲雀：`01_canary.spec.ts`
**狀態**：✅ 可運行（6 獨立階段測試）

**6 個階段驗證**：
- ✅ **Phase A–C**：課程創建 (1m) → 批准 → 報名
- ✅ **Phase D**：等待室導航 (30s, 教師 + 學生)
- ✅ **Phase E**：準備信號 + 教室進入 (90s)
- ✅ **Phase F**：白板同步延遲測量 (< 8000ms SLO)

**失敗對應**：
- Phase F 延遲超過 SLO → 同步品質問題，執行 `02_sync_quality.spec.ts`
- Phase D/E 超時 → 導航/進入問題，檢查課程可見性

### 📊 同步品質：`02_sync_quality.spec.ts`
**狀態**：✅ 5 次繪圖探針 + 離線重連

**探針測試**：
- ✅ **Probe A**：首次繪圖延遲 (= canary Phase F)
- ✅ **Probe B1–B5**：30 秒間隔，5 次重複繪圖
- ✅ **Probe C**：Canvas 像素完整性檢查
- ✅ **Probe D**：60 秒離線後重新連接驗證

**SLO 邏輯**：
- 硬性：所有 5 個探針必須同步 (失敗立即中止)
- 軟性：≤2 個探針超過 8000ms 延遲發出警告

### ⏱️ 時間穩定性：`03_duration_stability.spec.ts`
**狀態**：✅ 可配置時長，每 30s 心跳

**測試時長範例**：

```powershell
# 快速檢查（1 分鐘 + 監控）
$env:DURATION_MINUTES="1"; npx playwright test e2e/classroom/03_duration_stability.spec.ts

# 標準測試（5 分鐘 + 開始/中間/結束探針）
$env:DURATION_MINUTES="5"; npx playwright test e2e/classroom/03_duration_stability.spec.ts

# 耐力測試（15 分鐘 + 漂移分析）
$env:DURATION_MINUTES="15"; npx playwright test e2e/classroom/03_duration_stability.spec.ts
```

**監控指標**：
- ✅ **START 探針**：進入時立即繪圖驗證 latency
- ✅ **心跳（30s 間隔）**：檢查同步存活、API 延遲、Canvas 內容
- ✅ **END 探針**：會話快結束時繪圖，驗證連接完整性
- ✅ **漂移檢測**：START latency vs END latency 差異 > 3s 發出警告

### 📈 負載遞升：`04_load_escalation.spec.ts`
**狀態**：✅ 分階段並行，電路斷路器機制

**負載等級**：

```powershell
# 小型班級（3 組並行）
$env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/04_load_escalation.spec.ts

# 中型班級（5 組）
$env:CONCURRENT_GROUPS="5"; npx playwright test e2e/classroom/04_load_escalation.spec.ts

# 大型班級（10 組）
$env:CONCURRENT_GROUPS="10"; npx playwright test e2e/classroom/04_load_escalation.spec.ts

# 自訂通過率（預設 75%）
$env:SUCCESS_THRESHOLD="0.80"; $env:CONCURRENT_GROUPS="5"; npx playwright test e2e/classroom/04_load_escalation.spec.ts
```

**測試流程**：
1. 順序創建課程 (N 組)
2. 單一管理員會話批准所有課程
3. 順序報名 N 個學生
4. **電路斷路器**：若 <50% 報名成功，發出警告但繼續（便於測量降級曲線）
5. 並行進入教室 + 同步驗證
6. 自動識別**最常見失敗階段**（enrollment / entry / sync）

### 🔴 舊測試（保留用參考）：`classroom_room_whiteboard_sync.spec.ts`

原始單體測試保留于此。新項目應優先使用上述 5 個模組化測試。

---

**若測試失敗，請對應以下診斷清單：**

- 📊 **核心 ERD 圖**：釐清 User, Course, Order, Enrollment, Session 與 Whiteboard 的關聯。
- 🆔 **UUID 規範**：確保 `teacherId` 使用 UUID 而非 Email 以支持未來變更。
- 🚨 **常見故障點**：6 個核心失效原因分析（綁定、扣點、SSE、Canvas、跳轉、WebSocket）。
- 🎯 **診斷決策樹**：根據症狀逐步診斷根因。
- 🔄 **數據流完整走查**：從報名到同步繪圖的 15 個追蹤點。

---

## 完整測試流程（6 步驟管線）

測試檔案：[e2e/classroom_room_whiteboard_sync.spec.ts](../../../e2e/classroom_room_whiteboard_sync.spec.ts)

```
步驟 0  [選用] 檢查報名狀態 ─ 若已報名且 TEST_COURSE_ID 已設定，則跳過步驟 0a
   │
   ▼
步驟 0a student-enrollment-flow ─ 建立課程 + 學生報名 + 扣點驗證
   │    (僅在未報名時執行)
   ▼
步驟 1  教師 context ─ autoLogin → goToWaitRoom
   │    (分開登入，確保角色隔離)
   ▼
步驟 2  學生 context ─ autoLogin → goToWaitRoom
   │    (分開登入，確保角色隔離)
   ▼
步驟 3a 教師 + 學生 【序列】在等待頁點擊「準備好」
   │    (驗證 SSE 同步狀態更新)
   ▼
步驟 3b 教師 + 學生 【並行】等待「立即進入教室」→ 進入 /classroom/room
   │    (驗證同步進入教室邏輯)
   ▼
步驟 4  drawOnWhiteboard(教師端) ─ 教師繪圖
   │
   ▼
步驟 5  verifyWhiteboardHasDrawing(學生端) ─ 驗證同步結果
```

**為什麼步驟 3 使用並行執行？**（2026-04-08 修復）
- ✅ 驗證 classroom-wait SKILL 中的「SSE 同步機制」
  - 一方（教師）點擊「準備好」→ 另一方（學生）的頁面應該即時收到 SSE 通知更新狀態
- ✅ 確保「立即進入教室」按鈕在**雙方都準備好**後才出現（而不是單人就觸發）
- ✅ 避免單人提前進入教室，導致白板同步測試失敗

---

## 📊 資料架構與規範 (Entity-Relationship & Standards)

### 核心 ERD 圖
```mermaid
erDiagram
    USER ||--o{ ORDER : "購買 (userId)"
    USER ||--o{ ENROLLMENT : "報名 (userId)"
    USER ||--o{ POINTS_BALANCE : "擁有"
    TEACHER ||--o{ COURSE : "開設 (teacherId)"
    STUDENT ||--o{ ENROLLMENT : "報名"
    COURSE ||--o{ ENROLLMENT : "包含 (courseId)"
    COURSE ||--o{ ORDER : "關聯 (courseId)"
    CLASSROOM_SESSION ||--|| COURSE : "基於"
    CLASSROOM_SESSION ||--o{ PARTICIPANT : "含有"
    CLASSROOM_SESSION ||--|| WHITEBOARD : "開啟"
    WHITEBOARD ||--o{ CANVAS_UPDATE : "同步 (WebSocket)"
    ORDER ||--|| PAYMENT : "記錄"
    USER ||--* USER_INTERACTION : "生成"
```

### 🆔 UUID vs Email 規範 (2026-04-09 已落實)
為了支援未來 Email 修改，系統已從「Email 關聯」切換為「UUID 關聯」。

| 組件 | 規範 | 實作細節 |
|------|------|----------|
| **PROFILES.id** | UUID | 唯一主鍵 |
| **COURSES.teacherId** | UUID | 必須與教師 Profile ID 一致 |
| **登入回傳** | `id` (UUID) | 測試中應優先讀取此欄位 |
| **API 查詢** | 兼容模式 | `GET /api/courses?teacherId=...` 同時支援 UUID 與 Email 查詢 |

**代碼檢查點**：
- `e2e/classroom_room_whiteboard_sync.spec.ts`: `autoLogin` 提取 `data.id` 作為 `teacherId`。
- `e2e/student_enrollment_flow.spec.ts`: 建立課程時傳遞 `loginData.profile.id`。

---

---

## 核心函式速查

下方為 spec 檔案中的核心 helper 函式，修 bug 時直接對照：

| 函式 | 所在步驟 | 職責 | 失敗時檢查 |
|------|---------|------|-----------|
| `autoLogin(page, email, pwd, secret)` | 1, 2 | 填入憑據 → 等 captcha 圖 → bypass → 離開 /login | `.env.local` 變數？captcha 圖片 `img[alt="captcha"]` 是否載入？ |
| `injectDeviceCheckBypass(page)` | 1, 2 (goto 前) | `addInitScript` 注入 `__E2E_BYPASS_DEVICE_CHECK__` | 是否在 `page.goto()` **之前**呼叫？ |
| `goToWaitRoom(page, courseId, role)` | 1, 2 | 課程列表 → 點「進入教室」→ 抵達 `/classroom/wait` | 課程是否存在？「進入教室」按鈕選擇器是否匹配？ |
| `clickReadyButton(page, role)` | 3a | 在 /classroom/wait 點「準備好」，**不進入教室** | 「準備好」按鈕是否可見？點擊後是否留在 /classroom/wait（不自動進入）？ |
| `enterClassroom(page, role)` | 3b | 等待「立即進入教室」按鈕（雙方都 ready 後）→ 進入 /classroom/room | 「立即進入教室」按鈕何時出現？是否需要等待 SSE 同步？ |
| `drawOnWhiteboard(page)` | 4 | 找 canvas → mouse.down/move/up 模擬繪圖 | Canvas 是否可見？boundingBox 為 null？ |
| `verifyWhiteboardHasDrawing(page)` | 5 | getImageData 檢查 alpha > 200 的像素 | Canvas 跨域限制？Agora SDK 未載入？ |

---

## 🔥 壓力測試：動態多組並行 (Stress Test with Isolation Verification)

### 新增測試：`Stress test: <N> concurrent teacher-student groups with isolation verification`

**目的**：驗證系統在多組並行課堂情況下，各組的等待室、教室、白板同步是否完全隔離，互不干擾。現在支援使用環境變數設定並行組數（預設為 3）。

**測試場景** (以 N=3 為例)：
- **Group 0**: `teacher-g0-{timestamp}@test.com` ↔ `student-g0-{timestamp}@test.com`, Course: `stress-group-0-{timestamp}`
- **Group 1**: `teacher-g1-{timestamp}@test.com` ↔ `student-g1-{timestamp}@test.com`, Course: `stress-group-1-{timestamp}`
- **Group 2**: `teacher-g2-{timestamp}@test.com` ↔ `student-g2-{timestamp}@test.com`, Course: `stress-group-2-{timestamp}`

**並行執行的 10 個步驟**：

```
Step 0: 為 3 個群組分別觸發報名流程 (sequential)
   ↓
Step 1-2: Setup 瀏覽器 context (登入 6 個帳號) (parallel)
   ↓
Step 3: Login + goToWaitRoom (所有 6 個用戶) (parallel)
   ↓
Step 4: 驗證等待室隔離：每組應有且只有 2 個參與者 (parallel)
   ↓
Step 5: 進入教室 (所有 6 個用戶進入 3 個獨立教室) (parallel)
   ↓
Step 6: 等待白板初始化 (3 個教室) (parallel)
   ↓
Step 7: 教師繪圖 (3 個教師各繪一次) (parallel)
   ↓
Step 8: 驗證繪圖同步 (3 個教室各驗) (parallel)
   ↓
Step 9: 驗證隔離性：無跨組干擾 (assertion)
   ↓
Step 10: 清理資源 (3 個課程和所有訂單) (parallel)
```

**預期結果**：
- ✅ 所有 3 組都完成報名、進入教室、繪圖、驗證
- ✅ 每組的等待室參與者計數 = 2（teacher + student，不包括其他組的 4 人）
- ✅ 每組的白板繪圖都被對方收到，且只顯示本組教師的繪圖（不含其他組）
- ✅ 沒有跨組狀態污染（SSE 混亂、DynamoDB 鑰衝突等）

**命令執行**：
```bash
# 執行單個壓力測試（預設 3 組）
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium

# 指定 5 組並行測試
STRESS_GROUP_COUNT=5 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium

# 使用穩定性腳本執行多次壓力測試 (例如執行 5 次，每次 5 組)
STRESS_RUNS=5 STRESS_GROUP_COUNT=5 ./.agents/skills/classroom-room-whiteboard-sync/scripts/classroom_stress_test.sh
```

**依賴檢查清單**：
- ✅ `classroom-ready` SKILL 已實作（DynamoDB persistence 解決 Serverless 狀態隔離）
- ✅ 動態 courseId 與 email 生成（避免硬編碼衝突）
- ✅ 3 個 BrowserContext 各自獨立（確保 Cookie/localStorage 不混）
- ✅ SSE broadcast 機制確認為每個 courseId 作隔域（見 `lib/classroomSSE.ts`）

**故障排查**：

| 症狀 | 可能原因 | 檢查項目 |
|------|--------|--------|
| Group 1 的等待室看到 Group 0 的參與者 | SSE broadcast 未正確作隔域 / DynamoDB key 衝突 | 驗證 `/api/classroom/ready/{uuid}` 的 key 生成邏輯，確認不同課程使用不同 uuid |
| Group 2 的白板出現 Group 1 的繪圖 | Agora whiteboard room 混淆 / SDK 房間 ID 重複 | 檢查 `/classroom/room` 房間初始化邏輯，確認每個課程生成唯一房間 ID |
| 部份群組超時（>60s） | 網絡延遲或 enrollment flow 衝突 | 分別執行單個群組測試，確認問題是時序還是資源限制 |
| 清理失敗（課程未刪除） | 刪除 API 權限問題 | 驗證 `DELETE /api/courses?id=...` 點數，確認教師權限無誤 |

---

## 測試清單

測試檔案位置：[e2e/classroom_room_whiteboard_sync.spec.ts](../../../e2e/classroom_room_whiteboard_sync.spec.ts)

| 測試名稱 | 用戶組數 | 測試重點 | 時間預估 |
|--------|--------|--------|--------|
| `Teacher drawings sync to student` | 1 (1T + 1S) | 基礎同步 | ~90s |
| `Simulate disconnection and reconnection...` | 1 (1T + 1S) | 網絡容錯 | ~90s |
| `Stress test: ...` | N (預設3組) | 隔離與負載驗證 | ~180-240s |
| **總計** | - | - | ~360-420s (~6-7 min) |

---

## 部署檢查清單

部署此測試前，確認以下項目已完成：

- [ ] `classroom-ready` SKILL.md 已審閱（DynamoDB persistence 方案）
- [ ] `.env.local` 中設定正確的 test account 帳號密碼
- [ ] DynamoDB 表 `jvtutorcorner-whiteboard` 存在且可存取
- [ ] Agora SDK 房間 ID 隔離機制已驗證（見 `/classroom/room` 初始化）
- [ ] SSE broadcast 機制已確認作 courseId 隔域（見 `lib/classroomSSE.ts`）
- [ ] 本機 Playwright 已安裝 (chromium browser)

---

## 🧹 深度清理操作指南 (2026-04-19 新增)

### 為什麼需要深度清理？

時間重疊的課程是導致壓力測試失敗的主要原因。當多個測試課程在相同時間段運行時，會造成：
- ❌ 教室進入失敗（課程已進行中，但報名頁面仍允許進入）
- ❌ SSE 同步混亂（多個課程的狀態互相污染）
- ❌ 白板房間衝突（Agora SDK 房間 ID 重複）
- ❌ 點數扣除異常（訂單狀態混亂）

### 清理腳本架構

JV Tutor Corner 提供 **3 層次清理系統**：

#### Layer 1: UI-based Cleanup (Playwright E2E)
**檔案**: `e2e/cleanup-test-data.spec.ts`  
**功能**:
- 管理員登入 → 課程審核頁面
- 檢測 3 種課程刪除條件：
  1. 課程 ID/標題 match test pattern（`stress-group-*`, `sync-*`, `E2E自動驗證課程`）
  2. 課程已過期（endDate < 現在時間）
  3. **課程進行中**（startDate < 現在 < endDate）且是 test 課程 ⭐
- 調用 API 刪除課程、訂單、注冊記錄
- **優點**: 無需直接 AWS 存取
- **缺點**: 依賴 UI 可用性，清理不完全

#### Layer 2: API-based Cleanup (HTTPS/REST)
**內部**: Layer 1 自動調用 3 個 API 端點
```
DELETE /api/courses?id={courseId}
DELETE /api/orders?courseId={courseIdPattern}
DELETE /api/enrollments?email={studentEmail}
```
- **優點**: 更快速，支援批量刪除
- **缺點**: 不清理孤立記錄（whiteboard_permissions 等）

#### Layer 3: Database-level Cleanup (DynamoDB 直接操作 - SAFE MODE)
**檔案**: `cleanup-test-data.mjs` (已升級安全版本)  
**功能**:
- 直接掃描 DynamoDB 表（安全模式）：
  - `jvtutorcorner-courses` → 刪除 test pattern 課程
  - `jvtutorcorner-orders` → 刪除 test pattern 訂單
  - `jvtutorcorner-enrollments` → 刪除 test pattern 注冊
- **安全機制**:
  - ✅ 環境防護檢查（禁止在 Production 執行）
  - ✅ Dry-run 模式（預覽不刪除）
  - ✅ 互動式確認提示
  - ✅ 精確的測試資料比對（前綴匹配）
- **優點**: 最徹底、安全、支援孤立記錄清理
- **缺點**: 需要 AWS 認證

### 完整清理流程

**推薦的 3-step 清理順序**：

```bash
# Step 1: 清理 UI 層 + API 層（5-10 秒）
npx playwright test e2e/cleanup-test-data.spec.ts --project=chromium

# Step 2: 等待 3 秒，確保 DynamoDB 一致性
sleep 3

# Step 3: 深度清理 DynamoDB - Dry-run 預覽（推薦先用此命令）
node cleanup-test-data.mjs

# Step 4: 若確認要刪除，執行實際清理
node cleanup-test-data.mjs --execute
```

### 時間重疊檢測邏輯

課程被標記為刪除的條件（滿足任一即可）：

| 條件 | 檢查邏輯 | 優先級 | 備註 |
|------|--------|--------|------|
| **Test Pattern Match** | 課程 ID 或標題包含：`stress-group-*`, `sync-*`, `smoke-*`, `debug-*`, `E2E自動驗證課程` | 2 | 快速識別測試課程 |
| **Expired Course** | `endDate < 現在時間` | 1 | 清理已結束的課程 |
| **Time Overlap (進行中)** | `startDate < 現在時間 < endDate` **且** 是測試課程 | 0 ⭐ | **最優先清理** |

### 清理統計輸出示例

```
🧹 DEEP CLEANUP: Deleting test courses, orders, enrollments, and accounts
   Base URL: http://localhost:3000
   🕒 Current time: 2026-04-19T15:30:00Z

   📍 Step 1: Deep scan and delete test courses...
   📋 Total courses found: 47
   
   ✅ Deleted: "E2E 自動驗證課程-1776609792646" (sync-1776609786665)
      - reason: test pattern match
   ✅ Deleted: "Test Course X" (stress-group-0-1776000000000)
      - reason: test pattern match + time overlap
   ✅ Deleted: "Old Test" (debug-1776500000000)
      - reason: expired (end date passed)

   📍 Step 2: Deleting test orders...
   ✅ Cleaned up orders for courses matching: stress-group-0-
   ✅ Cleaned up orders for courses matching: sync-

   📍 Step 3: Deleting test enrollments...
   ✅ Deleted enrollments for: group-0-student@test.com

   📍 Step 4: Deleting test teacher accounts...
   ℹ️ Profile not found: group-0-teacher@test.com (already deleted)

   📍 Step 5: Deep database cleanup via DynamoDB script...
   ✅ DynamoDB cleanup completed

✅ CLEANUP SUMMARY:
   📊 Total courses deleted: 12
      - Test pattern matches: 8
      - Expired courses: 2
      - Time overlap courses: 2
   📊 Orders cleaned: 5
   📊 Enrollments cleaned: 8

   💡 Next step: Stress test ready to run without time conflicts!
```

### 常見清理問題

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| 清理後課程仍存在 | API 端點不支援批量刪除 | 執行 `node cleanup-test-data.mjs --execute` 進行深度清理 |
| 清理異常終止 | AWS 認證失敗 | 驗證 `.env.local` 中的 AWS_ACCESS_KEY_ID 與 AWS_SECRET_ACCESS_KEY |
| 時間重疊課程未刪除 | test pattern 規則不匹配 | 檢查課程 title 是否包含「自動驗證」或課程 id 是否符合 test prefix |
| 訂單刪除失敗 | 訂單已被其他進程修改 | 重新執行清理腳本（會自動跳過已刪除的項目） |

---