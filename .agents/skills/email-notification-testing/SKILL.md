# Email Notification & Automation Testing

本 Skill 負責驗證系統內的郵件發送功能與自動化提醒排程。確保通訊模組在不同環境（Local/Amplify）下都能正確運行。

## 1. 核心驗證能力
1. **SMTP 連通性測試**: 驗證 Gmail 或第三方適配器的連線配置。
2. **自動化排程驗證**: 測試課程提醒的掃描、生成與發送全流程。

---

## 2. 測試流程 (Test Procedures)

### A. 整合配置測試 (Direct SMTP Check)
透過 `app-integrations/test` API 驗證當前環境或手動輸入的配置。

**調用說明**:
```bash
POST /api/app-integrations/test
{
  "type": "SMTP",
  "config": {
    "smtpHost": "smtp.gmail.com",
    "smtpPort": "587",
    "smtpUser": "your-email@gmail.com",
    "smtpPass": "your-app-password"
  },
  "emailTest": {
    "to": "test@example.com",
    "subject": "System Verification",
    "html": "<p>Verification successful.</p>"
  }
}
```

### B. 提醒排程端對端測試 (E2E Reminder Flow)
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
