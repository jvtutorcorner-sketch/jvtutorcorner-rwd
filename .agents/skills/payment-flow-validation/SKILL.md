---
name: payment-flow-validation
description: '自動化驗證點數與方案（訂閱/組合包）購買流程，包含模擬支付、真實支付跳轉、點數扣除邏輯與餘額同步。'
argument-hint: '執行點數或方案購買流程測試 (模擬 vs 真實)'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 支付與資產獲取驗證技能 (Payment Flow Validation Skill)

此技能專注於驗證學生在平台上的資產獲取邏輯，確保無論是購買「點數套餐」還是「訂閱方案/組合包」，金流管道（Stripe/PayPal/模擬）能正確運作、資產準確入帳且權限即時同步。

## 功能特點

1.  **自動登入驗證**：串接 `auto-login` 邏輯，完成登入並同步權限。
2.  **定價頁導覽**：導航至 `/pricing` 並選取點數套餐或訂閱方案。
3.  **支付模式雙向驗證**：
    -   **模擬支付 (Simulated)**：執行 `e2e/point_purchase_simulated.spec.ts`。在 `/pricing/checkout` 使用「模擬支付」按鈕。
    -   **真實金流 (Real Payment)**：執行 `e2e/point_purchase_real.spec.ts`。驗證是否成功跳轉至 Stripe 或 PayPal。
4.  **扣點邏輯驗證**：執行 `e2e/pricing_deduction.spec.ts`。驗證購買含有「應用程式方案」的套餐時，點數是否正確扣除成本後入帳。
5.  **資產同步檢查**：測試會捕捉支付前後的資產狀態，確保：
    - 點數餘額正確增加。
    - 訂閱方案（Plan）狀態在個人資料中正確更新（如 basic -> premium）。
    - **紀錄查驗**: 導航至 `/plans` 確保購買紀錄已產生且狀態為 `PAID`。

## 使用方式

### 對於 AI 助手 (Antigravity)
當被要求驗證購買功能時：
1.  **選擇驗證範圍**：
    - 若檢查點數增加，執行 `npx playwright test e2e/point_purchase_simulated.spec.ts`。
    - 若檢查複雜扣點邏輯，執行 `npx playwright test e2e/pricing_deduction.spec.ts`。
2.  **檢查結果**：
    - 驗證支付後的 `finalPoints === initialPoints + increase - deduction`。

## 環境驗證 (Environment Validation)

### 1. 必要環境變數
- [ ] `NEXT_PUBLIC_BASE_URL`
- [ ] `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
- [ ] `LOGIN_BYPASS_SECRET`

### 2. 必要驗證檔案
- [ ] `e2e/point_purchase_simulated.spec.ts`
- [ ] `e2e/pricing_deduction.spec.ts`
- [ ] `e2e/point_purchase_real.spec.ts`

## 測試指令

```bash
# 驗證基礎點數購買
npx playwright test e2e/point_purchase_simulated.spec.ts

# 驗證方案扣點邏輯 (購買特定套餐)
npx playwright test e2e/pricing_deduction.spec.ts

# 驗證真實支付跳轉
npx playwright test e2e/point_purchase_real.spec.ts
```
