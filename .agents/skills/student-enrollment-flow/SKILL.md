---
name: student-enrollment-flow
description: '自動化學生購買點數與報名課程的完整流程。包含：登入、點數餘額檢查、方案頁購買點數、隨機選擇課程報名、以及模擬支付。'
argument-hint: '執行完整報名流程測試'
---

# 學生報名流程技能 (Student Enrollment Flow Skill)

此技能自動化學生在平台上的核心操作流程，特別是針對「點數不足時自動儲值並重新報名」的邏輯驗證。

## 功能特點

1.  **自動登入**：串接 `auto-login` 邏輯，使用測試帳號並繞過驗證碼。
2.  **餘額感知**：檢查當前點數，若不足以支付目標課程，自動前往 `/pricing`。
3.  **點數購買**：在 `/pricing` 選擇點數套餐，並在 `/pricing/checkout` 使用「模擬支付」完成交易。
4.  **UI 刷新驗證**：購買完成後回到定價頁面，驗證畫面上顯示的點數餘額是否已即時更新，確保頁面無快取問題。
5.  **課程報名**：在 `/courses` 隨機挑選課程，填寫資訊並報名。
6.  **錯誤自愈**：若報名過程中遇到點數不足的 UI 報錯，自動切換至購買流程後返回。

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
1.  **執行 Playwright 測試**：運行 `/Users/xucaiming/jvtutorcorner-rwd/e2e/student_enrollment.spec.ts`。
2.  **觀察結果**：若測試失敗（例如找不到元素或請求報錯），分析原因。
3.  **自動修正**：
    - 若為程式碼 bug，直接修正原始碼及其對應的測試。
    - 若為測試腳本過時，更新測試腳本。
4.  **回報進度**：回報最終成功狀態或無法自動修復的嚴重問題。

## 已知修正紀錄 (Known Fixes)

### 2026-03-15 — TypeScript 編譯錯誤修正

1. **`courseRes.ok` / `cleanupRes.ok` 誤用屬性**  
   Playwright `APIResponse.ok` 是**方法**，非屬性，必須呼叫 `ok()`。  
   - 錯誤：`if (courseRes.ok)` / `if (cleanupRes.ok)`  
   - 修正：`if (courseRes.ok())` / `if (cleanupRes.ok())`

2. **`pageText` 可能為 `null`**  
   `page.locator('body').textContent()` 回傳 `Promise<string | null>`，`.catch(() => '')` 只處理例外，不處理 null 回傳值。  
   - 錯誤：`const pageText = await page.locator('body').textContent().catch(() => '');`  
   - 修正：`const pageText = (await page.locator('body').textContent().catch(() => '')) ?? '';`

## 測試指令

```bash
npx playwright test e2e/student_enrollment.spec.ts
```
