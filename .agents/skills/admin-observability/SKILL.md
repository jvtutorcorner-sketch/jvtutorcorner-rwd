---
name: admin-observability
description: '後台觀測與稽核：稽核紀錄（audit logs）、API key 使用紀錄（key logs）、Agora 連線／品質日誌、前端錯誤回報，以及後台檢視頁。Use when: adding an auditable action, changing lib/auditLogService.ts or lib/keyLogger.ts, or debugging the audit log / analytics pages.'
argument-hint: '描述要記錄或查詢的事件，例如：新增管理員操作的稽核紀錄'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [server-auth-guards, b2b-admin-ui-flow, classroom-room, api-registry-management]
---

# 後台觀測與稽核 (Admin Observability)

## 紀錄種類

| 紀錄 | 寫入 | 讀取 | 表 |
|---|---|---|---|
| 稽核紀錄（誰在何時改了什麼） | `writeAuditLog()`（[lib/auditLogService.ts](../../../lib/auditLogService.ts)） | `GET /api/admin/audit-logs`（admin） | `DYNAMODB_TABLE_AUDIT_LOGS` |
| API key 使用紀錄 | `writeKeyLog()`（[lib/keyLogger.ts](../../../lib/keyLogger.ts)） | `GET /api/admin/key-logs`（admin） | `DYNAMODB_TABLE_KEY_LOGS`，TTL 由 `KEY_LOG_TTL_DAYS` 決定 |
| Agora 連線／品質 | `POST /api/agora/{connection-event,quality-event,connection-log}`（匿名） | `GET/POST /api/admin/agora-logs`（admin） | Agora 日誌表 |
| 前端錯誤 | `POST /api/client-error`（匿名） | 伺服器日誌 | — |

後台頁：[app/admin/audit-logs/](../../../app/admin/audit-logs/)（[components/AuditLogViewer.tsx](../../../components/AuditLogViewer.tsx)）、[app/admin/analytics/](../../../app/admin/analytics/)、[components/ConsoleLogViewer.tsx](../../../components/ConsoleLogViewer.tsx)。B2B 組織管理員的稽核檢視見 [b2b-admin-ui-flow](../b2b-admin-ui-flow/SKILL.md)。

## 相關檔案

- [lib/auditLogService.ts](../../../lib/auditLogService.ts)、[lib/keyLogger.ts](../../../lib/keyLogger.ts)
- [app/api/admin/audit-logs/](../../../app/api/admin/audit-logs/)、[app/api/admin/key-logs/](../../../app/api/admin/key-logs/)、[app/api/admin/agora-logs/](../../../app/api/admin/agora-logs/)、[app/api/client-error/](../../../app/api/client-error/)
- 建表：[scripts/create-audit-log-table.mjs](../../../scripts/create-audit-log-table.mjs)、[scripts/setup-key-logs-table.ts](../../../scripts/setup-key-logs-table.ts)、[scripts/create-agora-connection-table.js](../../../scripts/create-agora-connection-table.js)、[cloudformation/dynamodb-audit-log-table.yml](../../../cloudformation/dynamodb-audit-log-table.yml)
- 測試：[e2e/admin_observability_verification.spec.ts](../../../e2e/admin_observability_verification.spec.ts)、[e2e/b2b_audit_log_viewer_ui_flow.spec.ts](../../../e2e/b2b_audit_log_viewer_ui_flow.spec.ts)、[scripts/verify-b2b-audit-log-viewer.mjs](../../../scripts/verify-b2b-audit-log-viewer.mjs)

## 測試指令

```bash
npx playwright test e2e/admin_observability_verification.spec.ts --project=chromium
npx playwright test e2e/b2b_audit_log_viewer_ui_flow.spec.ts --project=chromium
node scripts/verify-b2b-audit-log-viewer.mjs
```

⚠️ spec 刻意不打 `POST /api/agora/connection-log` 與 `POST /api/client-error`——兩者匿名且不驗證就寫入。

## 環境驗證 (Environment Validation)

- `DYNAMODB_TABLE_AUDIT_LOGS`、`DYNAMODB_TABLE_KEY_LOGS`、`KEY_LOG_TTL_DAYS`，以及 AWS 憑證。

## 故障排除

- **`/api/admin/agora-logs` 回 500 `Requested resource not found`**：Agora 日誌表不存在，執行建表腳本（本機常見，spec 暫時接受 500）。
- **key logs 查詢回空陣列**：伺服器日誌若有 `queryKeyLogs failed ... Filter Expression can only contain non-primary key attributes: sk`，是查詢把排序鍵放進 FilterExpression——錯誤被吞掉、回 200 空結果（已知缺口）。
- **已知缺口**：`/api/agora/{connection-event,connection-log,quality-event}` 與 `/api/client-error` 匿名寫入 DynamoDB，沒有速率限制；`connection-log` 完全不驗證內容。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)、[b2b-admin-ui-flow](../b2b-admin-ui-flow/SKILL.md)、[classroom-room](../classroom-room/SKILL.md)
