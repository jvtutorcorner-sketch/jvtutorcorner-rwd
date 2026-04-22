---
name: email-notification-testing
description: '本 Skill 負責驗證系統內的郵件發送功能與自動化提醒排程。確保通訊模組在不同環境（Local/Amplify）下都能正確運行。'
argument-hint: '驗證郵件發送與排程提醒的設定與流程'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '-'
  architecture-aligned: false
---

# Email Notification & Automation Testing

本 Skill 負責驗證系統內的郵件發送功能與自動化提醒排程。確保通訊模組在不同環境（Local/Amplify）下都能正確運行。

## 1. 核心驗證能力
1. **SMTP 連通性測試**: 驗證 Gmail、Resend 或第三方適配器的連線配置。
2. **自動化排程驗證**: 測試課程提醒的掃描、生成與發送全流程。
3. **Gmail Workflow 驗證**: 測試單獨的 Gmail 發送路由與動態配置。

---

## 2. 測試流程 (Test Procedures)

### B. Gmail 基建測試 (Gmail Workflow Check)
驗證 Gmail SMTP 是否能夠透過動態配置或環境變數正確發信。

1. **自動化腳本**: 執行 `npx ts-node scripts/test-gmail-send.ts`。
2. **手動驗證**:
   - 前往 `/apps` -> 新增 `Gmail SMTP` -> 填寫資料並點擊「測試寄送實際郵件」。

[!NOTE]
測試失敗通常是因為：
- `SMTP_PASS` 尚為佔位符（需使用 16 位應用程式密碼）。
- 被白名單攔截（收件者必須是註冊用戶）。

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

- **狀態為 'pending'**: 請確認系統時間是否已超過 `(預計開始時間 - 提醒分位)`。
- **發送失敗 (Failed)**: 若發生認證錯誤，請檢查 Amplify Console 中的 `SMTP_PASS` 變數。
- **API 401/403**: 檢查調用時的 `CRON_SECRET` 是否與雲端配置一致。

## 5. 相關資源
- [Email 整合規格 (Skill)](file:///d:/jvtutorcorner-rwd/.agents/skills/email-service-integration/SKILL.md)
- [Amplify Lambda 範例](file:///d:/jvtutorcorner-rwd/.agents/skills/email-service-integration/examples/amplify-lambda-scheduler.js)
