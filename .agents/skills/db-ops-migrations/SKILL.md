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
| 建表（主要） | `npm run db:setup`（[scripts/setup-db.mjs](../../../scripts/setup-db.mjs)） | 冪等：建立缺少的表與 GSI |
| schema 比對 | `npm run db:verify`（[scripts/verify-schema.mjs](../../../scripts/verify-schema.mjs)） | 比對 CloudFormation 範本與實際帳號；`--template` 只檢查範本、不呼叫 AWS；`--live` 只檢查實際 |
| 個別建表 | `scripts/create-*-table*`、`scripts/setup-*-table*` | 例如 [create-rate-limit-table.mjs](../../../scripts/create-rate-limit-table.mjs)、[create-audit-log-table.mjs](../../../scripts/create-audit-log-table.mjs)、[setup-key-logs-table.ts](../../../scripts/setup-key-logs-table.ts) |
| 遷移 | `scripts/migrate-*`、`npm run db:migrate:teacher-ids`、[verify-migration.ts](../../../scripts/verify-migration.ts) | 說明在 [scripts/MIGRATION_SCRIPTS_README.md](../../../scripts/MIGRATION_SCRIPTS_README.md) |
| 種子／初始化 | `scripts/init-*`、`scripts/seed-*` | |
| 清理 | `scripts/cleanup-*` | 多數預設 dry-run，要加 `--execute` 才會刪 |
| 環境變數 | `npm run sync:amplify:env`（[sync-amplify-env-to-dotenv.mjs](../../../scripts/sync-amplify-env-to-dotenv.mjs)） | 從 Amplify 拉環境變數到本機 dotenv |

範本：`cloudformation/dynamodb-*.yml`（總表在 [cloudformation/dynamodb-tables.yml](../../../cloudformation/dynamodb-tables.yml)，說明見 [cloudformation/README.md](../../../cloudformation/README.md)）。

## 規則

1. 新增表或 GSI 時，同時更新 CloudFormation 範本與 `setup-db.mjs`，再跑 `db:verify:template` 確認兩者一致。
2. 遷移腳本要能重跑（冪等），並先支援 dry-run。
3. GSI 的鍵值欄位不能寫入 `null`——必須省略欄位，否則寫入會失敗。部署順序：先部署修正寫入的程式，再建 GSI。
4. 清理腳本只在確認目標後才加 `--execute`；刪除無法復原。

## 測試指令

```bash
npm run db:verify:template   # 不需 AWS 憑證
npm run db:verify            # 有憑證時也比對實際帳號
```

## 環境驗證 (Environment Validation)

- `AWS_REGION`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`，以及各表的 `DYNAMODB_TABLE_*` 名稱變數（見 [.env.local.example](../../../.env.local.example)）。

## 故障排除

- **`db:verify` 報告 GSI 缺少**：先確認寫入端已不會寫 `null` 到鍵值欄位，再跑 `db:setup` 建 GSI。
- **腳本讀不到 `.env.local`**：多數腳本以 dotenv 載入；`.ts` 腳本需用專案的 ts 執行方式（見 README）。
- **部分驗證**：只有範本比對可在本機驗證；實際帳號比對需要憑證，因此狀態為 PARTIAL。

## 相關技能

- [env-check](../env-check/SKILL.md)、[b2b-core-modules](../b2b-core-modules/SKILL.md)、[abuse-prevention](../abuse-prevention/SKILL.md)
