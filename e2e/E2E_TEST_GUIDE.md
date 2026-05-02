# JV Tutor Corner — E2E 測試完整指南

## 環境需求 (Prerequisites)

### 必要環境變數 (.env.local)
```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
LOGIN_BYPASS_SECRET=your-bypass-secret
QA_CAPTCHA_BYPASS=your-bypass-secret
# ... 其他測試帳號資訊
```

### 關鍵機制：Captcha 繞過 Header
系統支援透過 `X-E2E-Secret` Header 進行繞過，其值必須與 `LOGIN_BYPASS_SECRET` 一致。這在遠端伺服器未開啟表單繞過時非常有用。

### 啟動開發伺服器
```bash
npm run dev
```

### 環境切換 (Environment Switching)
測試環境由 `APP_ENV` 環境變數控制，這會決定加載哪一個 `.env` 檔案：
- **Local (預設)**: 加載 `.env.local`，對向 `http://localhost:3000`。
- **Production**: 加載 `.env.production`。此檔案包含生產環境金鑰，且 `NEXT_PUBLIC_BASE_URL` 應設為 `http://localhost:3000` 以支持 **Local-to-Production (L2P)** 測試模式。

> [!IMPORTANT]
> **.env.production 的特殊處理：**
> 為了支援自動化測試，`lib/captcha.ts` 會在找不到環境變數時，主動讀取本地的 `.env.production` 檔案來獲取 `LOGIN_BYPASS_SECRET`。這讓您不需要將秘密資訊 push 到遠端伺服器，也能在本地執行完整流程。

執行指令範例：
```bash
# 執行本地測試
npm run test:local

# 執行正式環境測試
npm run test:prod
```

---

## Playwright 設定 (playwright.config.ts)

| 設定項目 | 值 |
|---|---|
| 測試目錄 | `./e2e` |
| 測試檔案 | `**/*.spec.ts` |
| 預設 Timeout | 60,000 ms |
| 平行執行 | 否 (fullyParallel: false) |
| Workers | 1 |
| 瀏覽器 | Chrome (Desktop) |
| 報告格式 | HTML + JSON + List |
| 失敗時截圖 | 是 |
| 失敗時錄影 | 是 |
| BASE_URL | `NEXT_PUBLIC_BASE_URL` 環境變數 |

---

## 測試檔案一覽與執行指令

> [!TIP]
> **環境切換核心規則：**
> - 執行 **Local** 測試：使用 `APP_ENV=local` 或 `npm run test:local`
> - 執行 **Production** 測試：使用 `APP_ENV=production` 或 `npm run test:prod`
> - 系統會根據 `APP_ENV` 自動加載對應的 `.env.local` 或 `.env.production`，因此指令中只需指定環境即可。
> - 指令範例中預設使用 `APP_ENV=local`，若要測試正式環境，請將其替換為 `production`。

### 1. 課程剩餘時間驗證 — `verify_remaining_time.spec.ts`

**目的：** 驗證教師結束課程後，剩餘時間正確更新於 DB 並同步至儀表板。

**測試群組：** `Remaining Time Update Verification`  
**Timeout：** 300,000 ms

**流程：**
1. 透過子程序執行 enrollment flow (60分鐘課程)
2. 教師/學生雙重登入，繞過設備檢查
3. 驗證初始剩餘時間顯示 60m
4. 進入等待室 → 點擊準備 → 進入教室
5. 教室內停留 65 秒觸發定期同步
6. 教師點擊「結束課程」，確認 dialog
7. 驗證兩端儀表板剩餘時間 < 60m

```bash
# 本地環境執行 (預設)
npx cross-env APP_ENV=local npx playwright test e2e/verify_remaining_time.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/verify_remaining_time.spec.ts

# 使用 npm scripts (最簡潔)
npm run test:local -- e2e/verify_remaining_time.spec.ts
npm run test:prod -- e2e/verify_remaining_time.spec.ts

# 顯示瀏覽器 (Headed)
npx cross-env APP_ENV=local npx playwright test e2e/verify_remaining_time.spec.ts --headed

# UI 模式
npx cross-env APP_ENV=local npx playwright test e2e/verify_remaining_time.spec.ts --ui
```

---

### 2. 白板同步測試 — `classroom_room_whiteboard_sync.spec.ts`

**目的：** 驗證師生間白板繪圖同步、斷線重連後計時器同步，以及多組並發隔離性。

**測試群組（4個）：**

| 群組標籤 | 測試名稱 | Timeout |
|---|---|---|
| `[smoke]` | Quick classroom entry and canvas load | 120,000 ms |
| `[standard]` | Teacher drawings sync to student | 300,000 ms |
| `[standard]` | Simulate disconnection and reconnection | 300,000 ms |
| `[stress]` | 3 concurrent teacher-student groups | 600,000 ms |
| `[debug]` | Single group verbose whiteboard debug | 600,000 ms |

```bash
# 本地執行
npx cross-env APP_ENV=local npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts

# 執行特定標籤 (如 smoke)
npx cross-env APP_ENV=local npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "smoke"

# 壓力測試 (Stress) - 自訂並發組數與時長
# STRESS_GROUP_COUNT: 組數 (預設 3)
# STRESS_TEST_DURATION: 課程分鐘 (預設 60)
# STRESS_STAY_SECONDS: 教室停留秒數 (預設 10)
npx cross-env APP_ENV=local STRESS_GROUP_COUNT=10 STRESS_TEST_DURATION=2 STRESS_STAY_SECONDS=60 npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts -g "stress"
```

---

### 3. 學生報名完整流程 — `student_enrollment_flow.spec.ts`

**目的：** 模擬學生購買點數 → 報名課程 → 驗證點數扣除 → 進入教室的完整流程。

**測試名稱：** `Student Enrollment Flow (Simulated Payment)`  
**Timeout：** 300,000 ms

**流程：**
1. 嘗試尋找現有可用課程；找不到則建立測試課程
2. 清除既有訂單（避免時間衝突）
3. 學生登入 (透過 `X-E2E-Secret` Header 繞過 Captcha)
4. 判斷點數是否充足，不足則購買最大點數套餐
5. 記錄報名前點數餘額
6. 點擊「立即報名課程」→「確認報名」
7. 處理時間重疊衝突（自動 retry 至多 3 次）
8. 驗證重定向至 `/student_courses`
9. 驗證 API 點數正確扣除
10. 至 `/pricing` 頁面確認 UI 點數更新
11. 找到「進入教室」按鈕並點擊

```bash
# 本地執行
npx cross-env APP_ENV=local npx playwright test e2e/student_enrollment_flow.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/student_enrollment_flow.spec.ts
```

---

### 4. 電子郵件服務驗證 — `email_service_verification.spec.ts`

**目的：** 驗證 Gmail SMTP 及 Resend 郵件提供商的連線、白名單安全機制與設定解析。

**測試群組：** `Email Service Integration`

| 子群組 | 測試數 | 說明 |
|---|---|---|
| Gmail SMTP Provider | 4 | 成功發送、非白名單封鎖、verification 繞過、格式驗證 |
| Resend Provider | 2 | 成功發送、非白名單封鎖 |
| Configuration Resolution | 1 | 缺少憑證時應回 503 |

```bash
# 本地執行
npx cross-env APP_ENV=local npx playwright test e2e/email_service_verification.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/email_service_verification.spec.ts
```

> **注意：** 若 Gmail 或 Resend 憑證未配置，相關測試會回傳 503 並自動跳過斷言。

---

### 5. 首頁驗證 — `homepage_verification.spec.ts`

**目的：** 驗證首頁響應式設計、語言切換、行動版選單、Hero、How it Works、按鈕尺寸、效能。

**測試裝置：** 手機 (375px) / 平板 (768px) / 桌面 (1920px)

| 測試群組 | 測試數 |
|---|---|
| 0. 響應式設計驗證 | 3 |
| 1. 語言切換驗證 | 5 |
| 2. 行動版菜單驗證 | 4 |
| 3. Hero 部分詳細驗證 | 4 |
| 4. How it Works 部分驗證 | 3 |
| 5. 按鈕尺寸 (WCAG 標準) | 1 |
| 6. Carousel 響應式驗證 | 2 |
| 7. 字體與文本視覺層級 | 1 |
| 8. 圖片與媒體響應式 | 2 |
| 9. 效能相關檢查 | 2 |

```bash
# 本地執行
npx cross-env APP_ENV=local npx playwright test e2e/homepage_verification.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/homepage_verification.spec.ts
```

---

### 6. 導覽列驗證 — `navbar_verification.spec.ts`

**目的：** 驗證學生/教師註冊後自動登入、Navbar 顯示狀態、Product Tour 多頁面流程、下拉選單與登出功能。

**測試數：** 2（學生角色 + 教師角色）

```bash
# 本地執行
npx cross-env APP_ENV=local npx playwright test e2e/navbar_verification.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/navbar_verification.spec.ts
```

---

### 7. 點數 Escrow 邊界條件 — `points-escrow-edge-cases-simple.spec.ts`

**目的：** 用 API 直接驗證點數暫存系統的各種邊界條件。

| 測試 ID | 測試名稱 |
|---|---|
| 00-SETUP | 初始化學生點數為 10000 |
| E1 | 點數不足時報名失敗（預期 HTTP 400）|
| E2 | 點數恰好等於課程點數，報名後 balance=0 |
| E3 | 點數=0 時報名失敗 |
| E5 | Escrow 釋放後狀態應為 RELEASED |
| E6 | Escrow 退款後點數恢復 |
| E10 | 重複釋放應為 idempotent（點數不重複增加）|

```bash
# 本地環境執行 (預設)
npx cross-env APP_ENV=local npx playwright test e2e/points-escrow-edge-cases-simple.spec.ts

# 正式環境執行
npx cross-env APP_ENV=production npx playwright test e2e/points-escrow-edge-cases-simple.spec.ts
```

---

### 8. Stripe 支付驗證 — `stripe_payment_verification.spec.ts`

**目的：** 驗證 Stripe 支付流程（Pricing → Checkout → 測試信用卡）與 Webhook 端點存活。

**預設目標環境：** `QA_TEST_BASE_URL`（預設 `http://www.jvtutorcorner.com`）  
**Stripe 測試卡號：** `4242 4242 4242 4242`

| 測試名稱 | 說明 |
|---|---|
| Student Auto-Login Flow | 學生登入並到達 `/student_courses` |
| Navigate to Pricing Page | 選擇點數套餐並到達結帳頁 |
| Complete Stripe Payment | 填入測試卡號完成支付 |
| Admin Stripe Connection Diagnostics | 管理員在 `/apps` 頁面測試 Stripe 連線 |
| Verify Payment Status in Profile | 確認 `/settings/profile` 顯示點數 |
| Verify webhook endpoint | Webhook 端點存在（預期 400/401/500，非 404）|

```bash
# 測試本地環境
npm run test:local e2e/stripe_payment_verification.spec.ts

# 測試正式環境 Stripe
npm run test:prod e2e/stripe_payment_verification.spec.ts

# 只測 Webhook
npx playwright test e2e/stripe_payment_verification.spec.ts -g "Webhook"

# 只測管理員診斷
npx playwright test e2e/stripe_payment_verification.spec.ts -g "Admin"
```

---

### 9. 課程對齊驗證 — `course_alignment_verification.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/course_alignment_verification.spec.ts
```

### 10. 課程管理流程 — `course_management_flow.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/course_management_flow.spec.ts
```

### 11. 推薦系統問卷 — `recommendation_onboarding.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/recommendation_onboarding.spec.ts
```

### 12. 學生課程頁驗證 — `student_courses_verification.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/student_courses_verification.spec.ts
```

### 13. 教師課程頁驗證 — `teacher_courses_verification.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/teacher_courses_verification.spec.ts
```

### 14. 訂單退款驗證 — `order_refund.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/order_refund.spec.ts
```

### 15. 點數購買（模擬）— `point_purchase_simulated.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/point_purchase_simulated.spec.ts
```

### 16. 點數購買（真實）— `point_purchase_real.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/point_purchase_real.spec.ts
```

### 17. LINE Pay 模擬 — `line_pay_simulated.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/line_pay_simulated.spec.ts
```

### 18. 定價綜合測試 — `pricing_comprehensive.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/pricing_comprehensive.spec.ts
```

### 19. 教室等待頁驗證 — `classroom_wait_verification.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/classroom_wait_verification.spec.ts
```

### 20. 教室房間驗證 — `classroom_room_verification.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/classroom_room_verification.spec.ts
```

### 21. 教室設備權限 — `classroom-wait-device-permissions.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/classroom-wait-device-permissions.spec.ts
```

### 22. 點數 Escrow 教師流程 — `admin-teacher-escrow.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/admin-teacher-escrow.spec.ts
```

### 23. 資料清理 — `cleanup-test-data.spec.ts`
```bash
npx cross-env APP_ENV=local npx playwright test e2e/cleanup-test-data.spec.ts
```

---

## 批次執行指令

### 執行全部測試
```bash
# 本地環境
npx cross-env APP_ENV=local npx playwright test

# 正式環境
npx cross-env APP_ENV=production npx playwright test
```

### 依標籤篩選

> [!TIP]
> 所有 `-g` / `--grep` 的字串會對應到 `test.describe('[tag] …')` 的描述名稱。

```bash
# ── Smoke：最快速冒煙驗證（白板入室、Canvas 可見）
npx cross-env APP_ENV=local npx playwright test -g "smoke"

# ── Quick：快速白板同步（quick-sync-test.spec.ts）
npx cross-env APP_ENV=local npx playwright test -g "quick"
npx cross-env APP_ENV=local npx playwright test e2e/quick-sync-test.spec.ts

# ── Standard：完整白板同步繪圖驗證
npx cross-env APP_ENV=local npx playwright test -g "standard"

# ── Stress：並發壓力測試（多組 Teacher+Student 同時入室）
npx cross-env APP_ENV=local npx playwright test -g "stress"
npx cross-env APP_ENV=local npx playwright test -g "stress-multi-duration"

# ── Stress（指定 Duration 與並發數）
npx cross-env APP_ENV=local TEST_DURATIONS=1,3 TEST_CONCURRENT_LOADS=1,3 npx playwright test -g "stress-multi-duration"

# ── Verification：UI 頁面驗證（student/teacher_courses、classroom-wait）
npx cross-env APP_ENV=local npx playwright test --grep "verification"

# ── Escrow：點數暫存釋放流程
npx cross-env APP_ENV=local npx playwright test --grep "escrow"

# ── Payment：支付閘道 (Stripe/PayPal/LINE Pay) 驗證
npx cross-env APP_ENV=local npx playwright test --grep "payment"

# ── Email：郵件發送功能驗證
npx cross-env APP_ENV=local npx playwright test --grep "email"

# ── 正式環境執行（只跑 smoke + verification）
npx cross-env APP_ENV=production npx playwright test --grep "smoke|verification"
```

### 課程 ID 環境變數控制

自 2026-05-02 起，所有測試場景統一使用 `getCourseId(scenario)` 產生課程 ID，
可透過環境變數覆寫讓不同測試共用同一課程，避免重複建課或卡住：

| 場景 | 預設前綴 | 對應 spec |
|------|----------|-----------|
| `smoke` | `smoke-<ts>` | `classroom_room_whiteboard_sync.spec.ts` |
| `quick` | `quick-<ts>` | `quick-sync-test.spec.ts` |
| `standard` | `sync-<ts>` | `classroom_room_whiteboard_sync.spec.ts` |
| `stress` | `stress-group-<i>-<ts>` | `classroom_stress_test_multi_duration.spec.ts` |
| `debug` | `debug-<ts>` | 手動測試用 |

```bash
# 讓 smoke 測試重用既有課程（不重新建課）
npx cross-env APP_ENV=local TEST_COURSE_ID=smoke-1777714801139 npx playwright test -g "smoke"

# 讓 enrollment flow 與 standard sync 共用同一課程
npx cross-env APP_ENV=local TEST_COURSE_ID=sync-1777714801139 SKIP_CLEANUP=true npx playwright test -g "standard"

# 只保留課程 ID（不清除）以便下次重跑
npx cross-env APP_ENV=local SKIP_CLEANUP=true npx playwright test -g "smoke"

# 顯示 enrollment 子程序詳細 log
npx cross-env APP_ENV=local DEBUG_ENROLLMENT_FLOW=1 npx playwright test -g "smoke"
```

### 正式環境完整測試
```bash
npm run test:prod
```

### 查看 HTML 報告
```bash
npx playwright show-report test-results
```

---

## 輔助工具 (Helpers)

### `helpers/whiteboard_helpers.ts` 核心函數

| 函數名稱 | 說明 |
|---|---|
| `runEnrollmentFlow(courseId)` | 執行子程序進行課程報名 |
| `injectDeviceCheckBypass(page)` | 繞過設備（攝影機/麥克風）檢查 |
| `autoLogin(page, email, pw, secret)` | API 直接登入並同步 localStorage |
| `checkAndFindEnrollment(page, config)` | 查詢學生已有的報名訂單 |
| `goToWaitRoom(page, courseId, role)` | 導覽至課程等待室（含重試機制） |
| `enterClassroom(page, role)` | 等待 Ready 按鈕可用 |
| `clickReadyButton(page, role)` | 點擊 Ready 並等待 API 回應 |
| `waitAndEnterClassroom(page, role)` | 等待並點擊進入教室按鈕 |
| `drawOnWhiteboard(page)` | 在白板 canvas 隨機繪製 3-5 條線 |
| `hasDrawingContent(page)` | 偵測 canvas 是否有非透明像素 |
| `adminApproveCourse(page, courseId, ...)` | 管理員審核課程 |
| `cleanupTestData(page, courseIds, ...)` | 清除課程、訂單與測試帳號 |

### `test_data/whiteboard_test_data.ts` 設定函數

| 函數/常數 | 說明 |
|---|---|
| `getTestConfig()` | 從環境變數讀取教師/學生帳號設定 |
| `getStressGroupConfigs(n)` | 產生 n 組並發測試設定 |
| `getCourseId(scenario, ts?)` | **統一課程 ID 產生器**（尊重 `TEST_COURSE_ID` / `E2E_COURSE_ID` 覆寫）|
| `getSmokeCourseId(ts?)` | `getCourseId('smoke')` 的便捷別名 |
| `getQuickCourseId(ts?)` | `getCourseId('quick')` 的便捷別名（取代舊 `E2E_COURSE_ID \|\| 'c1'`）|
| `COURSE_ID_PREFIXES` | 各場景課程 ID 前綴（smoke / quick / sync / stress / debug / net）|
| `CourseScenario` | TypeScript 型別，合法的 scenario 字串聯集 |
| `ADMIN_EMAIL / ADMIN_PASSWORD` | 管理員帳號常數 |

---

## 安全性與自動化 (Security & Automation)

### Captcha 繞過機制 (Bypass Mechanism)

為了讓自動化測試能流暢執行，系統提供了以下三層驗證碼繞過方案：

1.  **表單欄位繞過**：在驗證碼輸入框填入 `LOGIN_BYPASS_SECRET`。
2.  **HTTP Header 繞過**：發送 API 請求時攜帶 `X-E2E-Secret: {secret}` Header。這可以完全避開 UI 操作。
3.  **測試帳號白名單**：部分測試帳號（如 Admin）在密碼正確且提供 Secret 的情況下會自動跳過驗證。

> [!TIP]
> **金鑰加載優先級：**
> 1. 系統環境變數 (`process.env`)
> 2. `.env.local` 或 `.env.production` 檔案 (由 `lib/captcha.ts` 自動尋找)

---

## 常見問題排查

| 問題 | 解法 |
|---|---|
| `Missing required environment variable` | 確認 `.env.local` 包含所有必要變數 |
| 找不到「進入教室」按鈕 | 確認課程時間已開始（startTime < 現在）|
| Enrollment flow 子程序失敗 | 加 `DEBUG_ENROLLMENT_FLOW=1` 查看子程序輸出 |
| 白板 canvas 不可見 | Agora Whiteboard SDK 需要時間初始化，等待超過 60 秒 |
| 點數扣除失敗 | 確認課程 `enrollmentType=points` 且 `pointCost > 0` |
| DynamoDB 並發衝突 | stress 測試改用 Sequential Ready Click 避免 race condition |
| Stripe 測試失敗 | 確認使用 Test 模式金鑰，卡號使用 `4242 4242 4242 4242` |
| 郵件 503 | Gmail/Resend 憑證未配置，測試會自動 skip 斷言 |
