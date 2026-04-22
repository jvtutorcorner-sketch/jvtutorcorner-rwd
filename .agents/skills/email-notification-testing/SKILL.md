---
name: email-notification-testing
description: '本 Skill 負責驗證系統內的郵件發送功能與自動化提醒排程。確保通訊模組在不同環境（Local/Amplify）下都能正確運行。'
argument-hint: '驗證郵件發送與排程提醒的設定與流程'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-04-22'
  architecture-aligned: true
  latest-fixes:
    - date: '2026-04-22'
      issue: 'Email 認證信未發送 - verificationService 使用不穩定的內部 fetch'
      solution: '改為直接在服務端使用 nodemailer，支援 Resend (優先) 與 Gmail SMTP (備用)'
      files-modified:
        - lib/email/verificationService.ts
---

# Email Notification & Automation Testing

本 Skill 負責驗證系統內的郵件發送功能與自動化提醒排程。確保通訊模組在不同環境（Local/Amplify）下都能正確運行。

## 1. 核心驗證能力
1. **SMTP 連通性測試**: 驗證 Gmail、Resend 或第三方適配器的連線配置。
2. **自動化排程驗證**: 測試課程提醒的掃描、生成與發送全流程。
3. **Gmail Workflow 驗證**: 測試單獨的 Gmail 發送路由與動態配置。

---

## 2. 測試流程 (Test Procedures)

### A. 帳號註冊驗證 Email 測試 (Registration Verification Email)
驗證新帳號註冊時的驗證信寄送功能。

1. **自動化測試**: 執行 `npx playwright test e2e/register_and_email_test.spec.ts --headed --project=chromium`。
2. **測試流程**:
   - 進入 `/login/register` 頁面
   - 填寫完整的註冊表單（所有必填欄位）：
     - 身份選擇（Student/Teacher）
     - First Name、Last Name
     - Email（測試使用 EMAIL_WHITELIST 中的地址）
     - Password、Confirm Password
     - Birthdate、Gender、Country
     - 服務條款勾選
     - 驗證碼（使用 Bypass Secret）
   - 提交表單
   - **檢查點**: 
     - 帳號應成功建立
     - 驗證信應透過 SMTP (Gmail) 寄送至註冊 Email
     - Email 白名單應允許發送

3. **驗證碼 Bypass 說明**:
   - 驗證碼輸入框應輸入 `jv_secret_bypass_2024` （與 `LOGIN_BYPASS_SECRET` 相同）
   - 系統會在 `lib/captcha.ts` 的 `verifyCaptcha()` 函數中驗證此 bypass secret
   - 不需要識別實際驗證碼圖片文字

### B. Gmail 基建測試 (Gmail Workflow Check)
驗證 Gmail SMTP 是否能夠透過動態配置或環境變數正確發信。

1. **自動化腳本**: 執行 `npx ts-node scripts/test-gmail-send.ts`。
2. **手動驗證**:
   - 前往 `/apps` -> 新增 `Gmail SMTP` -> 填寫資料並點擊「測試寄送實際郵件」。

[!NOTE]
測試失敗通常是因為：
- `SMTP_PASS` 尚為佔位符（需使用 16 位應用程式密碼）。
- 被白名單攔截（收件者必須在 EMAIL_WHITELIST 中或已在系統中註冊）。

### C. 提醒排程端對端測試 (E2E Reminder Flow)
本測試模擬從資料庫讀取待提醒課程到發送郵件的完整邏輯。

1. **自動化腳本**: 執行 `npx ts-node scripts/test-reminder-flow.ts` 進行快速驗證。
2. **手動冒煙測試 (Smoke Test)**:
   - 已登入狀態下進入 `/calendar` 並建立測試提醒。
   - 設定 `eventStartTime` 為當前時間 +10 分鐘，`reminderMinutes` 為 15。
   - 調用 Cron API 觸發點：`POST /api/cron/process-reminders`。
   - **檢查點**: 進入 DynamoDB 或介面確認 `emailStatus` 為 `sent`。

---

## 3. 重要：生產環境排程提醒 (Critical: Production Trigger)

[!IMPORTANT]
**AWS Amplify 計畫架構提醒**:
在正式環境（Amplify Hosting）中，Next.js 的 Cron API **不會自動觸發**。必須確保與專案架構對齊：
1. **觸發源**: 必須配置 **AWS EventBridge** 規則。
2. **執行源**: 必須透過 [amplify/functions](file:///d:/jvtutorcorner-rwd/amplify/functions/dailyReportScheduler) 下的專屬 Lambda 函數定時向 API 發送 POST 請求。
3. **驗證**: 手動驗證排程時，請確保帶入正確的 `Authorization: Bearer ${CRON_SECRET}` 標頭。

---

## 4. 故障排除 (Troubleshooting)

### 帳號建立時驗證信未發送

**症狀**: 
- 帳號成功建立，但用戶沒有收到驗證信
- 沒有出現錯誤提示

**根本原因**:
原始設計使用內部 `fetch()` 調用 `/api/workflows/gmail-send` API，但此方法在以下場景不穩定：
- Serverless 環境（AWS Amplify Hosting）中 localhost 無法訪問
- 內部 API 路由可能未被正確初始化或超時
- 錯誤被 catch 且僅記錄到服務器日誌，用戶無法察覺

**解決方案** (✅ 2026-04-22 已實施):
- 移除內部 fetch 調用
- 在 `lib/email/verificationService.ts` 中直接集成 nodemailer
- 支援雙引擎架構：
  1. **優先 Resend**: 從 DynamoDB 或環境變數讀取 API Key
  2. **備用 Gmail SMTP**: 從 DynamoDB 或環境變數讀取 SMTP 認證
- 詳細的錯誤日誌便於除錯

**驗證修正**:
```bash
# 執行測試（應該能成功收到驗證信）
npx playwright test e2e/register_and_email_test.spec.ts --headed --project=chromium
```

**監控發送狀態**:
- 開發工具中檢查 `console.log` 中的日誌訊息：
  - ✅ 成功: `[VerificationService] Sent via Resend: [messageId]`
  - ✅ 成功: `[VerificationService] Sent via Gmail SMTP: [messageId]`
  - ❌ 失敗: `[VerificationService] All email methods failed:`

### 其他常見問題

- **狀態為 'pending'**: 請確認系統時間是否已超過 `(預計開始時間 - 提醒分位)`。
- **發送失敗 (Failed)**: 若發生認證錯誤，請檢查 Amplify Console 中的 `SMTP_PASS` 變數。
- **API 401/403**: 檢查調用時的 `CRON_SECRET` 是否與雲端配置一致。

## 5. 相關資源
- [Email 整合規格 (Skill)](file:///d:/jvtutorcorner-rwd/.agents/skills/email-service-integration/SKILL.md)
- [Amplify Lambda 範例](file:///d:/jvtutorcorner-rwd/.agents/skills/email-service-integration/examples/amplify-lambda-scheduler.js)
- [帳號註冊 Email 驗證測試](file:///d:/jvtutorcorner-rwd/e2e/register_and_email_test.spec.ts) ✅ 2026-04-22 驗證通過
