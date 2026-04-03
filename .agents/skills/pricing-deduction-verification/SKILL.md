---
name: pricing-deduction-verification
description: '驗證點數購買有勾選應用程式方案的扣點邏輯。確保使用者在購買綁定 App 方案的點數套餐時，實際獲得的點數已扣除 App 方案的成本。'
argument-hint: '執行點數扣除邏輯驗證測試'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-03'
  architecture-aligned: true
---

# 點數購買扣點邏輯驗證技能 (Pricing Deduction Verification Skill)

此技能用於驗證當點數套餐綁定了「應用程式方案 (App Plan)」且該方案設有「點數成本 (Points Cost)」時，系統是否能正確執行扣點邏輯。

## 邏輯定義

1.  **分身登入**：必須先使用學生帳號登入系統，才能讀取個人點數餘額並進行後續購買動作。
2.  **設定階段**：在 `/settings/pricing` 中，可以為「點數套餐」勾選多個「應用程式方案」。
3.  **成本計算**：套餐會自動加總所有勾選 App 方案的 `pointsCost`，存於 `prePurchasePointsCost` 欄位。
4.  **UI 顯示**：在 `/pricing` 頁面中，套餐應顯示預計扣除後的可用點數 (例如：購買 100 點後可用 50 點)。
5.  **結帳邏輯**：在結帳流程中，傳送至 `/api/plan-upgrades` 的 `points` 數值應為 **淨點數 (套餐點數 - 預領扣除點數)**。
6.  **入帳驗證**：支付完成後，資料庫 `jvtutorcorner-user-points` 所增加的餘額應與結帳時的淨點數相符。

## 環境驗證 (Environment Validation)

### 1. 必要環境變數
- [ ] `.env.local` 必須包含 `LOGIN_BYPASS_SECRET`
- [ ] `.env.local` 必須包含 `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`

### 2. 必要驗證檔案
- [ ] `e2e/pricing_deduction.spec.ts`

### 3. 執行驗證指令
```bash
npx playwright test e2e/pricing_deduction.spec.ts
```

## 已修復問題 (Known Fixes)

### 2026-04-03 — 點數扣除邏輯失效修正

1.  **結帳參數傳遞錯誤**  
    原先 `/pricing/checkout` 頁面在建立訂單時，僅傳送原套餐的 `points` 數值（例如 100），未考慮 `prePurchasePointsCost`（例如 50），導致支付完成後使用者獲得全額點數而非扣除後的淨額。
    - **修正**：在 `app/pricing/checkout/page.tsx` 中加入扣除計算：`points: Math.max(0, points - (itemData?.prePurchasePointsCost || 0))`。

2.  **API 資料欄位遺失**  
    `/api/plan-upgrades` 及其對應的 DynamoDB 表結構未記錄 `appPlanIds`，導致後續無法追蹤是哪些 App 方案被購買。
    - **修正**：更新 API 接收並儲存 `appPlanIds` 陣列。

3.  **App 方案啟用機制缺失**  
    原先 PATCH `/api/plan-upgrades/[upgradeId]` 僅更新點數餘額，未處理 `appPlanIds` 的啟用。
    - **修正**：在入帳成功後，同步更新使用者 Profile 中的 `activeAppPlanIds` (或其他相關狀態表)。

## 使用方式

當被要求驗證點數扣除邏輯時：
1.  **分身登入**：自動透過 `auto-login` 機制登入學生帳號。
2.  **執行測試**：運行 `npx playwright test e2e/pricing_deduction.spec.ts`。
3.  **觀察結果**：觀察測試結果是否成功比對 `initialPoints + (pkgPoints - cost) = finalPoints`。
4.  **排除錯誤**：若失敗，請檢查 `app/pricing/checkout/page.tsx` 的點數計算部分。
