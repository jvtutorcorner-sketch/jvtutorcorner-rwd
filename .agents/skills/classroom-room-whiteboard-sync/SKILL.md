---
name: classroom-room-whiteboard-sync
description: '驗證 /classroom/room 頁面中教師白板繪圖與學生實時同步功能。支援在已報名情況下跳過報名流程，並確保教師與學生分別從等待頁進入教室。'
argument-hint: '執行白板同步驗證測試，確保教師繪圖能同步到學生端。若已報名，會自動跳過報名步驟。'
metadata:
   verified-status: '✅ FULLY_VERIFIED'
   last-verified-date: '2026-04-19'
   architecture-aligned: true
   verification-results:
      - '✅ 基礎白板同步：教師端繪圖驗證通過 (Canvas Check: true)'
      - '✅ 學生同步驗證：學生端接收繪圖驗證通過 (Canvas Check: true)'
      - '✅ SSE 同步機制：雙方準備信號正確傳遞'
      - '✅ 教室進入邏輯：序列 POST + 並行進入運作正常'
      - '⚠️ 壓力測試（3 組併發）：報名流程在 subprocess 環境下有穩定性問題（後續調試）'
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
   related-skills:
      - auto-login
      - classroom-wait
      - classroom-ready
      - classroom-room
      - student-enrollment-flow

# 教室白板同步驗證技能

## 快速啟動

### 基礎白板同步測試（推薦首先執行）

```bash
# 確保 dev server 已啟動
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
# 執行並發測試（預期需要 5-10 分鐘）
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium

# 自定義組數
STRESS_GROUP_COUNT=5 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium
```

**當前狀態**：⚠️ 報名流程在 subprocess 並發環境下有穩定性問題（正在改進）

**環境前置**：`.env.local` 須包含以下變數（缺一不可）:
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=123456
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=123456
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

---

## � 最新修復日誌 (2026-04-19)

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
- [`e2e/classroom_room_whiteboard_sync.spec.ts`](../../../e2e/classroom_room_whiteboard_sync.spec.ts) 行 45-90
- `runEnrollmentFlow()` 現傳遞完整環境變數：Agora 配置、bypass secret、base URL 等
- 添加 2 次重試邏輯，提高並發環境穩定性

---

## ✅ 驗證報告 (2026-04-19)

### 基礎同步測試：`Teacher drawings sync to student`
**狀態**：✅ 驗證通過

**核心驗證項**：
- ✅ Step 1：教師登入 → goToWaitRoom
- ✅ Step 2：學生登入 → goToWaitRoom
- ✅ Step 3：序列點擊「準備好」（teacher → student）
- ✅ Step 4：並行進入教室
- ✅ Step 5：教師繪圖驗證 (Canvas Check: **true**)
- ✅ Step 6：學生同步驗證 (Canvas Check: **true**)
- ✅ Step 7：優雅退出教室

**補充說明**：
- 白板同步的核心功能已完全驗證
- 教師繪圖可靠地同步到學生端
- 所有操作序列和時序正確無誤

### 壓力測試：`Stress test: 3 concurrent teacher-student groups`
**狀態**：⚠️ 報名流程在 subprocess 環境有穩定性問題

**已改進項**：
- ✅ 完整環境變數傳遞
- ✅ 報名流程重試邏輯（2 次）
- ✅ 詳細日誌輸出

**後續建議**：
1. 檢查報名流程的並發帳號創建
2. 確認 DynamoDB 課程表寫入限流
3. 考慮序列化報名步驟

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

