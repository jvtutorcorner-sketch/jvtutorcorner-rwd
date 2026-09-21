---
name: db-ops-migrations
description: 'DynamoDB 維運：建表（setup-db、create-*/setup-* 腳本、CloudFormation 範本）、schema 比對、資料遷移、種子資料與清理腳本，以及從 Amplify 同步環境變數。Use when: adding a table or GSI, running a migration, seeding/cleaning data, or checking that live tables match the template.'
argument-hint: '描述要處理的資料庫工作，例如：新增 GSI、跑 teacher-ids 遷移'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [env-check, cloud-hybrid-architecture, b2b-core-modules, abuse-prevention]
---

# 資料庫維運與遷移 (DB Ops & Migrations)

## 腳本分類

| 類別 | 腳本 | 說明 |
|---|---|---|
| 建表（主要） | `npm run db:setup`（[scripts/setup-db.mjs](../../../scripts/setup-db.mjs)） | 冪等：建立缺少的表與 GSI。`-- --only=<key>[,<key>]` 只跑指定步驟；`-- --dry-run` 只列出會做什麼、不改任何東西。步驟 key：`organizations`、`orgUnits`、`licenses`、`enrollments`、`courseSessions`、`planUpgrades`、`pointsEscrow`、`profiles`、`courses` |
| 資料審核（唯讀） | [scripts/audit-course-sessions.mjs](../../../scripts/audit-course-sessions.mjs) | 建 `byStatus` 前檢查 `status`／`startTime` 型別；`--probe-index` 以索引 COUNT 對照 Scan，證明索引 ACTIVE 且回填完整 |
| schema 比對 | `npm run db:verify`（[scripts/verify-schema.mjs](../../../scripts/verify-schema.mjs)） | 比對 CloudFormation 範本與實際帳號；`--template` 只檢查範本、不呼叫 AWS；`--live` 只檢查實際 |
| 個別建表 | `scripts/create-*-table*`、`scripts/setup-*-table*` | 例如 [create-rate-limit-table.mjs](../../../scripts/create-rate-limit-table.mjs)、[create-audit-log-table.mjs](../../../scripts/create-audit-log-table.mjs)、[setup-key-logs-table.ts](../../../scripts/setup-key-logs-table.ts) |
| 遷移 | `scripts/migrate-*`、`npm run db:migrate:teacher-ids`、[verify-migration.ts](../../../scripts/verify-migration.ts) | 說明在 [scripts/MIGRATION_SCRIPTS_README.md](../../../scripts/MIGRATION_SCRIPTS_README.md) |
| 種子／初始化 | `scripts/init-*`、`scripts/seed-*` | |
| 清理 | `scripts/cleanup-*` | 多數預設 dry-run，要加 `--execute` 才會刪 |
| 環境變數 | `npm run sync:amplify:env`（[sync-amplify-env-to-dotenv.mjs](../../../scripts/sync-amplify-env-to-dotenv.mjs)） | 從 Amplify 拉環境變數到本機 dotenv |

範本：`cloudformation/dynamodb-*.yml`（總表在 [cloudformation/dynamodb-tables.yml](../../../cloudformation/dynamodb-tables.yml)，說明見 [cloudformation/README.md](../../../cloudformation/README.md)）。

## 規則

1. 新增表或 GSI 時，宣告寫在 [scripts/lib/schema.mjs](../../../scripts/lib/schema.mjs)：索引的 hash／range 欄位**必須**同時加進該表的 `attributes`（`setup-db.mjs` 從那裡查型別）。CloudFormation 範本目前只鏡射 organizations／orgUnits／licenses（`verify-schema.mjs` 的 `TEMPLATE_TABLES`），改到這三張表時要同步範本並跑 `db:verify:template`；其他表只能用 `db:verify --live` 驗證。
5. 正式環境**不要跑沒有 `--only` 的 `db:setup`**，除非已確認每個宣告中的索引都能安全建立。它會一次補齊所有表的缺漏索引；只要其中一個索引的鍵欄位仍被已部署程式寫成 `null`，該表所有寫入都會失敗。
2. 遷移腳本要能重跑（冪等），並先支援 dry-run。
3. GSI 的鍵值欄位不能寫入 `null`——必須省略欄位，否則寫入會失敗。部署順序：先部署修正寫入的程式，再建 GSI。
4. 清理腳本只在確認目標後才加 `--execute`；刪除無法復原。

## 測試指令

```bash
npm run db:verify:template   # 不需 AWS 憑證
npm run db:verify            # 有憑證時也比對實際帳號（索引非 ACTIVE 也算 drift）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-course-sessions-index.mjs  # 離線：schema 守門、byStatus 查詢、--only 步驟選擇
node scripts/setup-db.mjs --only=courseSessions --dry-run   # 看會做什麼，不改任何東西
```

## 環境驗證 (Environment Validation)

- `AWS_REGION`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`，以及各表的 `DYNAMODB_TABLE_*` 名稱變數（見 [.env.local.example](../../../.env.local.example)）。

## 故障排除

- **`db:verify` 報告 GSI 缺少**：先確認寫入端已不會寫 `null` 到鍵值欄位，再以 `db:setup -- --only=<該表 key>` 只補那張表；先加 `--dry-run` 看一次。
- **`Timeout waiting for GSI … to become ACTIVE`**：GSI 建立常超過 300 秒（空表也可能），回填仍在 AWS 端進行。重跑同一個 `--only` 指令即可，腳本會偵測到索引仍在 CREATING 並繼續等待。期間不要對同一張表跑其他 UpdateTable。
- **`Cannot read from backfilling global secondary index`**：索引尚未 ACTIVE，等待後再查。
- **腳本讀不到 `.env.local`**：多數腳本以 dotenv 載入；`.ts` 腳本需用專案的 ts 執行方式（見 README）。
- **部分驗證**：只有範本比對可在本機驗證；實際帳號比對需要憑證，因此狀態為 PARTIAL。

## 相關技能

- [env-check](../env-check/SKILL.md)、[b2b-core-modules](../b2b-core-modules/SKILL.md)、[abuse-prevention](../abuse-prevention/SKILL.md)
