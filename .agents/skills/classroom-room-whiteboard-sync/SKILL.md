---
name: classroom-room-whiteboard-sync
description: '驗證 /classroom/room 頁面中教師白板繪圖與學生實時同步功能。支援在已報名情況下跳過報名流程，並確保教師與學生分別從等待頁進入教室。'
argument-hint: '執行白板同步驗證測試，確保教師繪圖能同步到學生端。若已報名，會自動跳過報名步驟。'
metadata:
   verified-status: '✅ READY_FOR_TESTING'
   last-verified-date: '2026-04-08'
   architecture-aligned: true
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
   related-skills:
      - auto-login
      - classroom-wait
      - classroom-ready
      - classroom-room
      - student-enrollment-flow

# 教室白板同步驗證技能

## 快速啟動 (30 秒)

```bash
cd d:\jvtutorcorner-rwd
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium
```

**環境前置**：`.env.local` 須包含以下變數（缺一不可）:
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=jv_secure_bypass_2024
TEST_TEACHER_EMAIL=teacher@test.com
TEST_TEACHER_PASSWORD=123456
TEST_STUDENT_EMAIL=student@test.com
TEST_STUDENT_PASSWORD=123456
# OPTIONAL: If not set, tests will programmatically create a temporary test course and use its generated id
# TEST_COURSE_ID=      (optional)
```

---

## 📊 故障排除快速入門

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

## 🔥 壓力測試：3 組並行 (Stress Test with Isolation Verification)

### 新增測試：`Stress test: 3 concurrent teacher-student groups with isolation verification`

**目的**：驗證系統在多組並行課堂情況下，各組的等待室、教室、白板同步是否完全隔離，互不干擾。

**測試場景**：
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
# 執行單個壓力測試
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "Stress test" --project=chromium

# 完整執行（包括其他 2 個單一對測試）
npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium
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
| `Stress test: 3 concurrent groups...` | 3 (3T + 3S) | 隔離驗證 | ~180-240s |
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

