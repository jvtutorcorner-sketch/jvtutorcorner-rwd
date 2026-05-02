---
name: student-enrollment-flow
description: '自動化學生購買與報名課程的完整流程，確保報名權限與點數扣除正確對齊。'
argument-hint: '執行學生報名流程測試 (含自動餘額檢查與補點)'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-30'
  architecture-aligned: true
  notes: '支付後的報名啟動由 paymentSuccessHandler 獨佔負責 (冪等性保證)；環境配置由 APP_ENV 統一控制'
---

# 學生報名流程技能 (Student Enrollment Flow Skill)

此技能自動化學生在平台上的核心操作流程，特別是針對「點數不足時自動儲值並重新報名」的邏輯驗證。

## 功能特點

1.  **課程搜尋與自動測資準備**：自學生端搜尋可報名的點數課程。若環境中無適用課程，自動透過 API 換為教師帳號建立測試課程，確保測試順利進行。
2.  **自動登入驗證**：串接 `auto-login` 邏輯，使用指定測試帳號並繞過驗證碼完成登入。
3.  **智能餘額檢查與按需購點**：取得學生當前點數與課程成本。僅在點數不足時，才自動導航至 `/pricing` 進行儲值，點數足夠則直接跳至課程報名。
    -   *註：詳細的點數購買管道驗證請參閱 `point-purchase-flow` 技能，本技能專注於報名與扣點邏輯。*
4.  **支付模式雙向驗證 (模擬)**：
    -   **模擬支付 (Simulated)**：用於快速測試與 CI 流程，在 `/pricing/checkout` 使用「模擬支付」完成自動儲值。
    -   *註：關於真實金流 (Stripe/PayPal) 的跳轉測試，請參閱 `point-purchase-flow` 技能，本技能專注於整合報名邏輯。*
5.  **UI 刷新與餘額更新驗證**：確認購買完成後，頁面顯示的點數餘額已即時更新，排除快取問題。
6.  **課程報名與邏輯攔截**：在課程頁點擊報名，攔截 `/api/orders` 請求並驗證 `paymentMethod` 為 `points` 的準確性。
7.  **精準點數扣除驗證**：比對報名前後餘額，驗證實際扣除量與課程 `pointCost` 是否相符。
8.  **教室進入驗證**：報名成功後自動進入課程清單，點擊「進入教室」按鈕並驗證導向至 `/classroom`。
9.  **環境架構對齊**：依據 `architecture_overview.md` 所定義的標準核心操作流程執行驗證。

## 核心檔案相關性 (Core File Dependencies)

### 1. E2E 測試與驗證 (E2E Tests)
- [student_enrollment_flow.spec.ts](../../../e2e/student_enrollment_flow.spec.ts) (核心完整流程測試)
- [student_courses_verification.spec.ts](../../../e2e/student_courses_verification.spec.ts) (學生課程清單驗證)

### 2. 報名與購買前端組件 (Frontend Components & Routes)
- `app/courses/[id]/page.tsx` (課程詳情入口)
- `app/student_courses/page.tsx` (學生課程清單頁)
- `app/pricing/page.tsx` & `app/pricing/checkout/page.tsx` (點數檢查與模擬支付)
- `components/EnrollButton.tsx` (報名按鈕核心組件，攔截扣點邏輯)
- `components/EnrollmentManager.tsx` (報名彈窗與狀態切換)
- `components/OrdersManager.tsx` (訂單清單顯示管理)

### 3. 報名與扣點後端邏輯 (Backend & Logic)
- `app/api/orders/route.ts` (報名訂單處理 API)
- `app/api/points/route.ts` (點數餘額同步 API)
- `lib/pricingService.ts` (點數扣除與折扣計算邏輯)
- `lib/pointsStorage.ts` (DynamoDB 點數存取底層邏輯)

## 故障排除與架構同步 (Troubleshooting & Architecture Sync)

### 1. 架構驅動的故障排除
若報名或支付流程失敗，請執行以下檢查：
- **關係驗證**：對比 [ER 圖](../../../architecture_overview.md#3-system-relationships-er-diagram)，確認 Student, Course, Enrollment, Order 之間的鏈結是否完整建立。
- **狀態機一致性**：確認 Enrollment 與 Order 的狀態轉換是否符合 [Enrollment Flow (Standard)](../../../architecture_overview.md#enrollment-flow-standard) 的定義。

### 2. 架構同步要求
- **變動偵測**：當修正 Bug 或增加功能涉及 `schema.graphql` 變動或流程邏輯修改時，必須同步更新 [architecture_overview.md](../../../architecture_overview.md)。
- **更新範圍**：包含重新生成 Mermaid 圖表或更新「API Endpoints」清單。

## 測試資料命名慣例 (Test Data Naming Conventions)

自動化測試腳本在執行過程中會動態生成暫時性課程，以下是相關規律：

1.  **課程 ID 與標題**：
    -   **格式**：`test-course-${Date.now()}` 或 `AI 自動測試課程-${Date.now()}`。
    -   **時間戳記**：字尾的數字為 Unix Timestamp，可用於判斷測試發生的時間。
2.  **資料生命週期**：
    -   測試結束時會嘗試透過 API 刪除課程主資料。
    -   **殘留現象**：若測試中斷或清理失敗，報名紀錄（Orders）可能會殘留在資料庫中。
    -   **UI 顯示**：由於課程主資料已被刪除，`/student_courses` 頁面在讀取紀錄時會因失效而顯示 **課程 ID**（例如 `test-course-1773471081484`）作為標題回退顯示。

## 使用方式
1.  **模擬支付測試**：運行 `e2e/student_enrollment_flow.spec.ts`。用於驗證扣點與報名邏輯，不需真實信用卡。

### 對於 AI 助手 (Antigravity)
當被要求執行此流程或測試相關功能時，請：

1.  **執行 Playwright 測試**：運行 `e2e/student_enrollment_flow.spec.ts`。

3.  **自動修正**：
    - 若為程式碼 bug，直接修正原始碼及其對應的測試。
    - 若為測試腳本過時，更新測試腳本。
4.  **回報進度**：回報最終成功狀態或無法自動修復的嚴重問題。

## 環境切換 (Environment Switching)

### 模擬支付 (Simulated) — CLI
```bash
npx playwright test e2e/student_enrollment_flow.spec.ts
```


## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
- [ ] (可選) `BASE_URL` — 預設 `http://localhost:3000`，設為 `https://www.jvtutorcorner.com` 可切換正式環境

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/student_enrollment_flow.spec.ts` (模擬支付報名流程)

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/student_enrollment_flow.spec.ts`


## 已知修正紀錄 (Known Fixes)

### 2026-03-28 — BASE_URL 環境變數讀取錯誤 & 完整流程強化

1. **環境變數統一為 `NEXT_PUBLIC_BASE_URL`**  
   原測試腳本 (E2E spec) 與 Playwright 配置對 `BASE_URL` 與 `NEXT_PUBLIC_BASE_URL` 的解析邏輯不一致。現已統一移除 `BASE_URL` 的依賴，所有測試流程（含 Playwright config）皆讀取 `NEXT_PUBLIC_BASE_URL`。  
   - 修正：`process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'`

2. **`resetRes.ok` 誤用屬性**  
   與 `courseRes.ok` 相同問題，`ok` 必須呼叫為方法。  
   - 錯誤：`if (!resetRes.ok)`  
   - 修正：`if (!resetRes.ok())`

3. **缺少點數扣除精準驗證**  
   原測試硬編碼驗算 `finalBalance !== 10`，不適用不同方案或課程設定。  
   - 修正：改為 `balanceBeforeEnroll - pointCost = finalBalance` 的動態驗算。

4. **缺少「進入教室」步驟**  
   原 E2E test 僅驗證到「報名成功」跳轉 `/student_courses`，沒有繼續進入教室的驗證。  
   - 修正：加入「進入教室」按鈕的尋找（含重整重試機制）、點擊，以及驗證成功導向 `/classroom`。

5. **缺少 `/api/orders` 網路請求攔截**  
   無法確認手動報名時 `paymentMethod` 是否正確設為 `'points'`。  
   - 修正：使用 `page.waitForRequest` 攔截 POST `/api/orders`，記錄並驗證 payload。

### 2026-03-15 — TypeScript 編譯錯誤修正

1. **`courseRes.ok` / `cleanupRes.ok` 誤用屬性**  
   Playwright `APIResponse.ok` 是**方法**，非屬性，必須呼叫 `ok()`。  
   - 錯誤：`if (courseRes.ok)` / `if (cleanupRes.ok)`  
   - 修正：`if (courseRes.ok())` / `if (cleanupRes.ok())`

2. **`pageText` 可能為 `null`**  
   `page.locator('body').textContent()` 回傳 `Promise<string | null>`，`.catch(() => '')` 只處理例外，不處理 null 回傳值。  
   - 錯誤：`const pageText = await page.locator('body').textContent().catch(() => '');`  
   - 修正：`const pageText = (await page.locator('body').textContent().catch(() => '')) ?? '';`

3. **Playwright `waitForNavigation` 導致超時掛起**
   在 Next.js 此類 SPA（單頁應用程式）中，表單提交可能只觸發客戶端路由跳轉（Client-side routing），而不會觸發完整的網路導航。這會導致 `page.waitForNavigation({ waitUntil: 'networkidle' })` 永遠等不到導航事件而觸發自動化腳本超時（例如 3 分鐘）。
   - 錯誤示範：`await page.waitForNavigation({ waitUntil: 'networkidle' })`
   - 修正方式：改用 `await page.waitForURL(url => !url.href.includes('/login'))` 或是等待特定的 DOM 元素。

### 2026-04-03 — 課程準備自動化與智能餘額檢查
1. **課程搜尋與教師自動切換**  
   整合自動搜尋流程。搜尋條件擴展支援 `enrollmentType` 為 `points`, `plan`, 與 `both` 且擁有大於 0 的 `pointCost` 的課程。若系統無可用課程，自動透過 API 以教師身份建立 `points` 課程測資。
2. **智能點數餘額判斷**  
   串接 API 取得學生當前餘額與目標課程成本。
3. **按需購點邏輯 (Conditional Point Purchase)**  
   實作條件判斷：僅當餘額小於課程成本時執行儲值與模擬支付流程；餘額充足則直接進行課程報名。
4. **課程報名相容性處理 (Production 環境)**  
   - 舊版正式環境 (Production) 的 `EnrollButton` 只有當資料庫中的課程 `enrollmentType === 'points'` 時才允許送出 `paymentMethod: 'points'`。若設定為 `plan` 或 `both` 且環境尚未更新，會導致送出 `paymentMethod: null`，測試會報錯（點數未扣除）。
   - 當測試直接對 `https://www.jvtutorcorner.com` 執行時，若遇到既有點數未扣除之問題，須確認 DynamoDB 內該課程的 `enrollmentType` 設定。
   - 解決方案：E2E 已經實裝動態檢查邏輯，若畫面有「點數報名」頁籤 (Tab) 按鈕則主動切換；若無按鈕（如純 `points` 課程），則採取 `catch` 策略忽略，避免強制 `force` 點擊而癱瘓測試。

### 2026-04-03 — 整合與最佳化
1. **點數購點整合**  
   若點數不足，報名流程會自動引導至結帳頁面。關於支付管道（Stripe/PayPal）的各項細節驗證，現已轉移至 `point-purchase-flow` 技能管理。


## 測試指令

```bash
# 模擬支付完整測試
npx playwright test e2e/student_enrollment_flow.spec.ts
```

