---
name: enterprise-general-test-coverage
description: Audit and extend test coverage for JV Tutor Corner enterprise (B2B) and general-user (B2C) functionality. Use when reviewing feature completeness, finding untested or skipped enterprise/general flows, reconciling stale architecture documents with current routes, or adding focused verification scripts.
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
---

# 企業與一般功能測試覆蓋稽核

這個 skill 用來把產品功能、實際程式碼、可執行測試和「尚未實作」的缺口放在同一張覆蓋矩陣中。它不把 `test.skip`、文件宣稱或單純存在的 route 當成通過證據。

## 執行流程

1. 先讀取 `docs/b2b-b2c-module-matrix.md`、`docs/b2b-b2c-architecture-boundary.md`，再以目前 `app/`、`lib/`、`components/` 為準核對文件；文件與程式衝突時，記錄為 stale documentation，不要直接把舊文件當成 bug。
2. 執行靜態覆蓋稽核：

   ```bash
   node scripts/audit-enterprise-general-test-coverage.mjs
   node scripts/audit-enterprise-general-test-coverage.mjs --json
   node scripts/audit-enterprise-general-module-matrix.mjs
   ```

3. 依結果分類：

   - `COVERED`: 有對應 route/service 與可執行腳本或 E2E 證據。
   - `PARTIAL`: 有主流程，但缺錯誤、權限、跨角色、外部 provider 或 API contract 覆蓋。
   - `UNTESTED`: 程式碼存在，但找不到專用測試證據。
   - `BLOCKED`: 測試設計需要尚未存在的架構能力或真實 fixture，例如 tenant isolation。
   - `NOT_IMPLEMENTED`: 程式碼或 route 本身仍是 stub/TODO；不能靠補測試把它標成完成。

4. 對 `critical` 的非 `COVERED` 項目補測試或補功能。若問題是功能未實作，先建立明確的 failing/blocked evidence，避免寫一個只驗證 stub 會回應的假綠測試。
5. 若新增或修改 `app/api/**/route.ts`，完成後執行 `node scripts/inspect_apis.mjs` 更新 `docs/api_registry.md`；若只增加測試或文件，不需要改 registry。
6. 執行與缺口直接相關的測試。涉及正式 DynamoDB、真實金流、Google SSO 或 headed browser 時，先確認目標環境與清理策略；不要在未確認的情況下把破壞性 E2E 指向 production。

模組矩陣的 `Layers` 欄位必須分開檢查 `ui`、`api`、`service`、`data`；只有測試檔存在，不代表四層架構都已接通。`Unmapped API domains` 必須逐項判斷是附加模組、內部 endpoint、或真正漏掉的功能模組。

## 覆蓋重點

- B2B：註冊與 CSV、組織／部門／成員、seat/license、orgAccess、B2C/B2B access gate、HTTP route wiring、audit log、跨租戶隔離、dept_admin 範圍、Google SSO、企業帳單。
- B2C：公開頁與 SEO、auth/session/profile、課程與報名、付款／退款／Escrow、等待室／教室／白板／教材、問卷推薦、老師／課程審核、AI/chat/workflow。
- 每個項目都要分開看四層：核心邏輯、HTTP route、UI/E2E、跨角色或跨租戶邊界。

## 既有測試的安全注意事項

- `scripts/verify-b2b-*.mjs` 與部分 Playwright 流程會直接寫入 DynamoDB；它們的通過不代表可安全在 production 任意重跑。
- B2C 的 `e2e/b2c_verification.spec.ts` 有資料不存在與缺少 bypass secret 時的 skip；回報時必須列出 skip，不能只報 passed。
- `b2b-tenant-isolation` 目前是 scaffold，`SessionPayload` 尚無 `tenantId`；在這個能力完成前，跨租戶測試應標為 blocked。
- `app/api/auth/callback/google/route.ts` 仍是 prototype callback；沒有 token exchange/id_token 驗證的測試只能證明 redirect，不是 SSO 驗證。

## 產出格式

回報至少包含：覆蓋統計、每個 critical 缺口的 evidence/test/gap、被 skip 的測試位置、文件與程式碼不一致處，以及下一個可直接執行的測試命令。若修改了 skill 或測試腳本，也要列出檔案路徑和驗證結果。
