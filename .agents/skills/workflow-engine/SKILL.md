---
name: workflow-engine
description: '產品內的工作流程引擎（/workflows 視覺化編輯器、workflowEngine 執行器與 13 支 action node API：寄信、HTTP、檔案、Figma、NotebookLM、Qdrant 等）。與開發流程的 workflow skill 不同。Use when: adding a workflow node, changing lib/workflowEngine.ts, or debugging workflow execution/permissions.'
argument-hint: '描述要新增的 node 或要除錯的工作流程'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [server-auth-guards, knowledge-base-rag, email-service-integration, app-integrations-line-make, scheduled-jobs]
---

# 工作流程引擎 (Workflow Engine)

> 注意：[workflow](../workflow/SKILL.md) 技能是「開發流程」（CI、分支、驗證順序）；本技能是**產品功能**——管理員在 `/workflows` 拖拉出的自動化流程。

## 架構

- **定義**：存在 DynamoDB，CRUD 走 `GET/POST /api/workflows`、`GET/PUT/DELETE /api/workflows/[id]`（[lib/workflowService.ts](../../../lib/workflowService.ts)）。
- **執行**：[lib/workflowEngine.ts](../../../lib/workflowEngine.ts) 依序執行節點；每個 action node 對應一支 `app/api/workflows/<node>` 路由，引擎以 HMAC 簽章的內部請求呼叫它們。
- **自訂腳本**：[lib/scriptExecutor.ts](../../../lib/scriptExecutor.ts)。
- **UI**：[app/workflows/](../../../app/workflows/)、[components/workflows/](../../../components/workflows/)；頁面由 [app/workflows/layout.tsx](../../../app/workflows/layout.tsx) 限 admin。

## 權限

所有 action node 都是 `withAdminOrHmac`：訪客 401、非 admin 的 session 403、admin 或 HMAC 簽章可執行。每支 node 都要在觸碰外部服務前先驗證必填欄位（400）。`http-request` 只允許 `http(s)`。`check-compatibility` 只在 development 開放。

| node | 外部服務 |
|---|---|
| `execute` | 引擎入口 |
| `gmail-send`、`resend-send` | 寄信（見 [email-service-integration](../email-service-integration/SKILL.md)） |
| `http-request` | 任意 HTTP(S) |
| `figma-export`、`export-file`、`import-file` | Figma／檔案 |
| `context7-retrieve`、`notebooklm-create` | 文件檢索 |
| `qdrant-knowledge-base` | Qdrant（見 [knowledge-base-rag](../knowledge-base-rag/SKILL.md)） |

## 新增 node

1. 在 `app/api/workflows/<node>/route.ts` 以 `withAdminOrHmac` 包裝，先做欄位驗證。
2. 在引擎與編輯器登錄節點類型。
3. 把 node 加進 spec 的 `ACTION_NODES` 陣列（G 401／S 403／SYS 400）。
4. 更新 [docs/api_registry.md](../../../docs/api_registry.md)（`node scripts/inspect_apis.mjs`）。

## 相關檔案

- [lib/workflowEngine.ts](../../../lib/workflowEngine.ts)、[lib/workflowService.ts](../../../lib/workflowService.ts)、[lib/scriptExecutor.ts](../../../lib/scriptExecutor.ts)
- [app/api/workflows/](../../../app/api/workflows/)
- [scripts/setup-workflows-db.js](../../../scripts/setup-workflows-db.js)
- 測試：[e2e/workflow_engine_verification.spec.ts](../../../e2e/workflow_engine_verification.spec.ts)

## 測試指令

```bash
npx playwright test e2e/workflow_engine_verification.spec.ts --project=chromium
```

spec 的 SYS 請求都故意缺必填欄位，在寄信、外呼或連 Qdrant 之前就回 400。

## 環境驗證 (Environment Validation)

- `API_HMAC_SECRET`：引擎呼叫 node 的簽章。
- 各 node 的外部憑證（Resend、Gmail、Figma、Qdrant 等）可在 `/add-app` 的整合設定或環境變數提供，見 [app-integrations-line-make](../app-integrations-line-make/SKILL.md)。

## 故障排除

- **node 在引擎內呼叫失敗 401**：HMAC 簽章錯誤或時間差超過 5 分鐘，見 [server-auth-guards](../server-auth-guards/SKILL.md)。
- **`/workflows` 頁面把 admin 導回 dashboard**：session 角色不是 admin，或頁面權限矩陣關掉了。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)、[knowledge-base-rag](../knowledge-base-rag/SKILL.md)、[scheduled-jobs](../scheduled-jobs/SKILL.md)
