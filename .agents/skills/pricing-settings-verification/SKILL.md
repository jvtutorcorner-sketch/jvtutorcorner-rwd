---
name: pricing-settings-verification
description: '確認 "/settings/pricing" 的訂閱方案、點數購買、折扣方案與應用程式方案都有正確儲存，且相關計算邏輯 100% 正確（包含折扣與點數扣除）。'
argument-hint: '執行 "/settings/pricing" 全面性功能的 E2E 驗證測試'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 方案設定全面驗證技能 (Pricing Settings Verification Skill)

此技能用於全面驗證 `/settings/pricing` 頁面中所有功能分頁的正確性，確保所有配置都能夠正確持久化，且相關的商業邏輯與計算皆 100% 正確。

## 核心程式碼檢查路徑 (Core Code Paths)

在執行自動化測試前，應先檢查以下檔案確保邏輯正確：

1.  **前端頁面**: `[app/settings/pricing/page.tsx](file:///d:/jvtutorcorner-rwd/app/settings/pricing/page.tsx)`
    *   檢查 `saveSettings` 函數是否正確處理了所有分頁數據（`appPlans`, `pointPackages`, `plans`, `discountPlans`）。
    *   檢查點數套餐的總價計算公式是否正確（`Points * UnitPrice - Discount`）。
2.  **後端 API**: `[app/api/admin/pricing/route.ts](file:///d:/jvtutorcorner-rwd/app/api/admin/pricing/route.ts)`
    *   檢查 `GET` 請求是否正確返回所有配置表格的數據。
    *   檢查 `POST` 請求是否正確解析並更新資料庫欄位，特別是處理 `isActive` 的邏輯。

## 驗證範圍 (Verification Scope)

1.  **訂閱方案 (Subscription Plans)**: 新增/編輯、狀態切換、App 方案綁定。
2.  **點數購買 (Point Packages)**: 自動價格計算、折扣方案套用、App 點數扣除邏輯。
3.  **折扣方案 (Discount Plans)**: 百分比與固定金額折扣的存取。
4.  **應用程式方案 (App Plans)**: 點數成本與天數的持久化。

## 執行流程 (Execution Flow)

### 1. 環境準備
- [ ] 確認 `.env.local` 包含 `ADMIN_EMAIL`, `ADMIN_PASSWORD` 與 `LOGIN_BYPASS_SECRET`。
- [ ] 執行 `npm run dev` 確保服務已啟動。

### 2. 程式碼預檢
- [ ] 查看 `app/settings/pricing/page.tsx` 確保計算邏輯符合預期。
- [ ] 查看 `app/api/admin/pricing/route.ts` 確保 API 具備相應的 CRUD 權限。

### 3. 執行自動化驗證
執行以下指令。此指令會先執行 **Admin 登入**，再依序巡檢各分頁：
```bash
$env:NEXT_PUBLIC_BASE_URL="http://localhost:3000"; npx playwright test e2e/pricing_comprehensive.spec.ts
```

## 已知問題與修復紀錄
- **Admin 登入**: 確保測試指令帶入正確的 `NEXT_PUBLIC_BASE_URL`，否則會因導向錯誤而無法登入。
- **計算不準確**: 若數值不對，優先檢查 `updatePointPackage` 函數。
