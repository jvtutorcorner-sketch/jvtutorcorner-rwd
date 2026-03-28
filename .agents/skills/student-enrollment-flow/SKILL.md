---
name: student-enrollment-flow
description: '自動化學生購買點數與報名課程的完整流程。包含：登入、點數餘額檢查、方案頁購買點數、隨機選擇課程報名、以及模擬支付。'
argument-hint: '執行完整報名流程測試'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 學生報名流程技能 (Student Enrollment Flow Skill)

此技能自動化學生在平台上的核心操作流程，特別是針對「點數不足時自動儲值並重新報名」的邏輯驗證。

## 功能特點

1.  **自動登入**：串接 `auto-login` 邏輯，使用測試帳號並繞過驗證碼。
2.  **餘額感知**：檢查當前點數，若不足以支付目標課程，自動前往 `/pricing`。
3.  **點數購買**：在 `/pricing` 選擇點數套餐，並在 `/pricing/checkout` 使用「模擬支付」完成交易。
4.  **UI 刷新驗證**：購買完成後回到定價頁面，驗證畫面上顯示的點數餘額是否已即時更新，確保頁面無快取問題。
5.  **課程報名**：在指定課程頁面點擊「立即報名課程」→ 選擇付款方式 → 確認報名，並攔截 `/api/orders` 網路請求驗證 `paymentMethod=points`。
6.  **點數扣除驗證**：報名後即時查詢 API，確認扣除正確點數（扣除量 = `pointCost`）。
7.  **進入教室**：在我的課程頁找到「進入教室」按鈕並點擊，驗證成功進入 `/classroom`。
8.  **錯誤自愈**：若報名過程中遇到點數不足的 UI 報錯，自動切換至購買流程後返回。
9.  **架構驗證**：在執行流程前，先確認 [Core Operational Flows](../../../architecture_overview.md#2-core-operational-flows) 是否符合現有程式實作。

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

### 對於 AI 助手 (Antigravity)
當被要求執行此流程或測試相關功能時，請：
1.  **執行 Playwright 測試**：運行專案根目錄下 `e2e/student_enrollment.spec.ts`。
2.  **觀察結果**：若測試失敗（例如找不到元素或請求報錯），分析原因。
3.  **自動修正**：
    - 若為程式碼 bug，直接修正原始碼及其對應的測試。
    - 若為測試腳本過時，更新測試腳本。
4.  **回報進度**：回報最終成功狀態或無法自動修復的嚴重問題。

## 環境切換 (Environment Switching)

此 skill 同時支援 **開發環境 (localhost:3000)** 與 **正式環境 (jvtutorcorner.com)**。

### 開發環境（預設）
```bash
# .env.local
BASE_URL=http://localhost:3000
```
```bash
npx playwright test e2e/student_enrollment.spec.ts
```

### 正式環境
```bash
# 方法一：設定環境變數後執行
BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/student_enrollment.spec.ts

# 方法二：在 .env.local 暫時修改
# BASE_URL=https://www.jvtutorcorner.com
```

> ⚠️ **注意**：對正式環境執行測試會產生真實訂單與付款記錄，請謹慎使用。

## 環境驗證 (Environment Validation)

### 1. 必要環境變數 (Required Environment Variables)
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
- [ ] (可選) `BASE_URL` — 預設 `http://localhost:3000`，設為 `https://www.jvtutorcorner.com` 可切換正式環境

### 2. 必要驗證檔案 (Required Validation Files)
- [ ] `e2e/student_enrollment.spec.ts` (學生報名完整流程測試)

### 3. 執行驗證指令 (Validation Command)
- `npx playwright test e2e/student_enrollment.spec.ts`

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

## 測試指令

```bash
# 開發環境
npx playwright test e2e/student_enrollment.spec.ts

# 正式環境
BASE_URL=https://www.jvtutorcorner.com npx playwright test e2e/student_enrollment.spec.ts
```
