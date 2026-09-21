---
name: app-integrations-line-make
description: '第三方整合：App integrations 憑證庫（/add-app）、LINE Messaging（webhook、push、webhook logs）、Make.com（設定、同步、回呼 webhook）。Use when: adding an integration type, changing LINE bot or Make.com flows, or debugging integration credentials/webhooks.'
argument-hint: '描述要處理的整合，例如：LINE webhook 沒反應、Make 回呼失敗'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [workflow-engine, auth-sso, server-auth-guards, ai-chat]
---

# 第三方整合 (App Integrations, LINE, Make.com)

## 1. App integrations 憑證庫

管理員在 [app/add-app/](../../../app/add-app/) 設定第三方服務（Resend、LINE、Gmail…）的憑證，存在 DynamoDB，工作流程與 AI 工具會讀取。

- `GET/POST/PUT/DELETE /api/app-integrations`（admin）、`POST /api/app-integrations/test`（admin，測試連線；不支援的類型直接 400、不外呼）。

## 2. LINE Messaging

| 端點 | 驗證 | 用途 |
|---|---|---|
| `POST /api/line/webhook/[integrationId]` | LINE 簽章（`x-line-signature`） | 接收事件、AI 回覆 |
| `GET /api/line/webhook/[integrationId]` | **無** | debug：代呼叫端向 LINE content API 取檔 |
| `POST /api/line/push` | admin | 主動推播 |
| `GET /api/line/webhook-logs?integrationId=` | admin | 事件紀錄 |

LINE **Login**（OAuth）屬於 [auth-sso](../auth-sso/SKILL.md)。

## 3. Make.com

- 設定：`GET/PUT /api/integration/make-config`（手寫 `requireAdmin`，不認 e2e bypass）；後台頁 [app/admin/make-settings/](../../../app/admin/make-settings/)。
- 同步：`/api/integration/make-sync`（`?health=true` 匿名可呼叫，會對 Make 外呼；其他方法需 admin）。
- 回呼：`POST /api/integration/make-webhook`，`x-make-signature` 為 body 的 HMAC-SHA256；事件 `TEACHER_RECOMMENDED` 會寫回問卷的推薦老師。
- 設定來源：[lib/integration/makeComConfig.ts](../../../lib/integration/makeComConfig.ts)、[lib/integration/makeRuntimeConfig.ts](../../../lib/integration/makeRuntimeConfig.ts)。

## 相關檔案

- [app/api/app-integrations/route.ts](../../../app/api/app-integrations/route.ts)、[app/api/app-integrations/test/](../../../app/api/app-integrations/test/)
- [app/api/line/webhook/[integrationId]/route.ts](../../../app/api/line/webhook/[integrationId]/route.ts)、[app/api/line/push/](../../../app/api/line/push/)、[app/api/line/webhook-logs/](../../../app/api/line/webhook-logs/)
- [app/api/integration/make-config/](../../../app/api/integration/make-config/)、[app/api/integration/make-sync/](../../../app/api/integration/make-sync/)、[app/api/integration/make-webhook/route.ts](../../../app/api/integration/make-webhook/route.ts)
- 測試：[e2e/app_integrations_line_make_verification.spec.ts](../../../e2e/app_integrations_line_make_verification.spec.ts)

## 測試指令

```bash
npx playwright test e2e/app_integrations_line_make_verification.spec.ts --project=chromium
```

⚠️ 不要帶 `x-simulation` header 打 LINE webhook，也不要帶 `?health=true` 打 make-sync——兩者都會觸發真實流程。

## 環境驗證 (Environment Validation)

- LINE Messaging 憑證存在 App integrations（每個 integration 各自一組 channel secret／access token），不在環境變數。
- Make.com：webhook secret 與 URL 由 make-config 設定。

## 故障排除

- **LINE webhook 401**：channel secret 與 LINE Developers 後台不一致。
- **Make 回呼沒有寫回推薦老師**：確認 `eventType` 為 `TEACHER_RECOMMENDED` 且 `data.submissionId` 存在。
- **已知缺口**：
  1. LINE webhook 的 `x-simulation: true` header 可跳過簽章驗證 → 任何人可觸發 bot 流程（含 AI 呼叫與回覆）。
  2. LINE webhook 的 debug GET 未驗證，會拿呼叫端提供的 token 去打 LINE API。
  3. make-webhook 在**沒有設定 webhook secret 時完全不驗簽章**，任何人都能送 `TEACHER_RECOMMENDED` 覆寫問卷推薦。
  4. `make-sync?health=true` 匿名觸發對 Make 的外呼。
  5. `make-config`／`make-sync` 的手寫 `requireAdmin` 對錯誤角色回 401（應為 403），也不認 e2e bypass。

## 相關技能

- [workflow-engine](../workflow-engine/SKILL.md)、[auth-sso](../auth-sso/SKILL.md)、[ai-chat](../ai-chat/SKILL.md)
