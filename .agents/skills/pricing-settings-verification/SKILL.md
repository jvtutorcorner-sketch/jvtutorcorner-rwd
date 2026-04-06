---
name: pricing-settings-verification
description: '確認 "/settings/pricing" 的訂閱方案、點數購買、折扣方案與應用程式方案都有正確儲存，且相關計算邏輯 100% 正確（包含折扣與點數扣除）。'
argument-hint: '執行 "/settings/pricing" 全面性功能的 E2E 驗證測試'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
  dependencies:
    - 'auto-login skill (用於 Admin 登入)'
  improvements:
    - '✅ 整合 auto-login skill 登入方式（使用 Bypass Secret）'
    - '✅ 自動清理測試資料'
    - '✅ Playwright webServer 自動啟動開發服務器'
---

# 方案設定全面驗證技能 (Pricing Settings Verification Skill)

全面驗證 `/settings/pricing` 頁面的訂閱方案、點數購買、折扣方案、應用程式方案的儲存與計算邏輯。

## 快速執行

```bash
# 使用無頭模式（快速執行）
npx playwright test e2e/pricing_comprehensive.spec.ts --project=chromium

# 可視化執行（看到瀏覽器運行過程）
npx playwright test e2e/pricing_comprehensive.spec.ts --project=chromium-headed
```

## 登入方式 (Auto-Login Skill Pattern)

測試採用 **auto-login skill** 的標準登入模式：
- 讀取 `.env.local` 中的 `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- 使用 `LOGIN_BYPASS_SECRET` 繞過驗證碼
- 使用 ID 選擇器 (`#email`, `#password`, `#captcha`)
- `page.waitForURL()` 檢測登入成功

## 驗證範圍

1. **應用程式方案** - 新增/編輯/刪除、點數成本持久化
2. **折扣方案** - 百分比與固定金額折扣
3. **點數套餐** - 自動價格計算、折扣套用、應用程式成本扣除
4. **訂閱方案** - 新增/編輯、狀態切換、應用程式綁定

## 執行前檢查

- [ ] `.env.local` 包含 `NEXT_PUBLIC_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LOGIN_BYPASS_SECRET`
- [ ] 檢查 `app/settings/pricing/page.tsx` - `saveSettings()` 函數是否正確處理所有分頁數據
- [ ] 檢查 `app/api/admin/pricing/route.ts` - GET/POST 邏輯是否正確

## 修正要點 (2026-04-06)

| 項目 | 問題 | 解決方案 |
|------|------|---------|
| 登入超時 | 複雜響應監聽導致競態 | 改用簡單 `waitForURL()` 方式 |
| 選擇器 | `input[name="..."]` 不穩定 | 改用 ID 選擇器 (`#email` 等) |
| 後端啟動 | 測試前後端未運行 | 配置 `webServer` 自動啟動 |
| 清理 | 測試資料未清理 | 添加自動清理邏輯 |

## 相關檔案

- **測試**: `e2e/pricing_comprehensive.spec.ts`
- **配置**: `playwright.config.ts`
- **環境**: `.env.local`
