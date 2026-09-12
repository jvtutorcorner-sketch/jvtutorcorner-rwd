---
name: scheduled-jobs
description: '排程工作：每日營運報表（daily-report，EventBridge 排程 + Lambda）、課程提醒（process-reminders）與報表狀態頁，以及 CRON_SECRET 驗證。Use when: changing app/api/cron/*, lib/dailyReportService.ts, the scheduler CloudFormation/Lambda, or debugging missing reports/reminders.'
argument-hint: '描述要調整的排程，例如：報表沒寄出、改提醒時間'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [course-scheduling-reminders, email-service-integration, workflow-engine, server-auth-guards]
---

# 排程工作 (Scheduled Jobs)

## 工作一覽

| 端點 | 觸發 | 驗證 | 做什麼 |
|---|---|---|---|
| `POST /api/cron/daily-report?tier=<tier>` | EventBridge → [amplify/functions/dailyReportScheduler](../../../amplify/functions/dailyReportScheduler/) | `Authorization: Bearer <CRON_SECRET>` 或 `x-cron-token` | 產生並寄出報表（[lib/dailyReportService.ts](../../../lib/dailyReportService.ts)） |
| `GET /api/cron/daily-report/status` | 報表 App 讀取 | **無**（已知缺口） | 回傳最近報表 |
| `POST /api/cron/daily-report/status` | 管理員手動觸發 | `withAdmin` | 產生報表 |
| `POST /api/cron/process-reminders` | 排程器 | 只在 production 檢查 | 掃描即將開始的課程並寄提醒（見 [course-scheduling-reminders](../course-scheduling-reminders/SKILL.md)） |

排程基礎設施：[cloudformation/daily-report-scheduler.yml](../../../cloudformation/daily-report-scheduler.yml)、[scripts/setup-daily-report-scheduler.js](../../../scripts/setup-daily-report-scheduler.js)。報表 UI：[app/apps/daily-report/](../../../app/apps/daily-report/)、[components/DailyReportApp.tsx](../../../components/DailyReportApp.tsx)。

## ⚠️ 本機測試注意

- **不要**以 admin／e2e bypass 身分 POST `/api/cron/daily-report/status`——會真的產生並寄出報表。
- **不要**在本機打 `/api/cron/process-reminders`——非 production 不拒絕任何請求，會掃描資料並寄信。
- spec 只驗「錯的 secret 被拒」與「訪客／學生被拒」。

## 相關檔案

- [app/api/cron/daily-report/route.ts](../../../app/api/cron/daily-report/route.ts)、[app/api/cron/daily-report/status/route.ts](../../../app/api/cron/daily-report/status/route.ts)、[app/api/cron/process-reminders/route.ts](../../../app/api/cron/process-reminders/route.ts)
- [lib/dailyReportService.ts](../../../lib/dailyReportService.ts)
- 測試：[e2e/scheduled_jobs_verification.spec.ts](../../../e2e/scheduled_jobs_verification.spec.ts)

## 測試指令

```bash
npx playwright test e2e/scheduled_jobs_verification.spec.ts --project=chromium
```

## 環境驗證 (Environment Validation)

- `CRON_SECRET`：未設定時 daily-report 在非 production 會放行，spec 的 secret 測試會 skip。
- 寄信相關變數見 [email-service-integration](../email-service-integration/SKILL.md)。

## 故障排除

- **報表沒寄出**：先看 EventBridge 規則是否啟用、Lambda 日誌中的 HTTP 狀態；401 代表 Lambda 與 Amplify 的 `CRON_SECRET` 不一致。
- **已知缺口**：
  1. `process-reminders` 在非 production 永不拒絕請求。
  2. `daily-report` 未設 `CRON_SECRET` 時開放。
  3. `daily-report/status` 的 GET 匿名回傳整份報表內容。

## 相關技能

- [course-scheduling-reminders](../course-scheduling-reminders/SKILL.md)、[email-service-integration](../email-service-integration/SKILL.md)、[server-auth-guards](../server-auth-guards/SKILL.md)
