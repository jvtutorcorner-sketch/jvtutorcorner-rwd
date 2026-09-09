---
name: b2b-http-license-routes
description: '驗證 organizations/org-units/licenses 的 HTTP route 層本身（withAuth/requireOrgAccess 串接、request 驗證、狀態碼）與授權管理 UI（OrgLicensesPanel）。過去這些路由只被其他 verify-b2b-*.mjs 腳本以直接 import lib 函式的方式間接測過，route handler 本身、audit log 實際落地、以及授權面板 UI 完全零覆蓋。'
argument-hint: '驗證 B2B HTTP route 層與授權管理 UI：auth 分層、狀態碼、audit log、核發/指派/取消指派/撤銷'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
  notes: '過程中發現並修復 3 個問題：正式環境 audit-logs 資料表從未部署（稽核寫入全部靜默失敗）、createLicense 對 byUserId GSI key 寫入 NULL 導致核發直接 500、核發上限誤把 revoked/expired 歷史記錄算進配額造成「席次外洩」。'
---

# B2B HTTP Route 層 + 授權管理 UI 驗證技能

補上一輪 B2B 驗證掃描後發現的最大缺口：`b2b-core-modules`、`b2b-admin-ui-flow` 系列腳本全部直接 `import` `lib/licenseService.ts`、`lib/orgMembershipService.ts`、`lib/orgUnitService.ts`、`lib/auth/orgAccess.ts` 來測，完全繞過了實際掛在 `app/api/organizations/**`、`app/api/org-units/**`、`app/api/licenses/**` 底下的 route handler——`withAuth` 串接、`requireOrgAccess`/`requireSystemAdmin` 在 route 層是否真的被呼叫、request body 驗證、HTTP 狀態碼是否符合文件描述，這些完全沒人測過。另外授權管理 UI（`components/org/OrgLicensesPanel.tsx`）也是零覆蓋——`e2e/b2b_admin_ui_flow.spec.ts` 從未提到「授權」分頁。

跟其他 B2B 驗證技能一樣採**兩層**驗證：

1. `scripts/verify-b2b-http-routes.mjs` — 用三種真實身分（system admin 走 `X-E2E-Secret` bypass、org admin、plain member，全部透過 `lib/auth/sessionManager.ts` 的 `createSession` 現場發真的 session token）對一台真的在跑的 dev server 打 HTTP，涵蓋 10 個 route 檔案的 auth 分層、驗證錯誤、狀態碼，並直接 Query `jvtutorcorner-audit-logs` 的 `byTargetId` GSI 斷言稽核紀錄真的落地
2. `e2e/b2b_license_panel_ui_flow.spec.ts` — 真實 headed 瀏覽器把「批次核發 → 指派 → 取消指派 → 撤銷」整條授權管理流程走一遍

## 測試模組

### API 層 — `scripts/verify-b2b-http-routes.mjs`（86 個斷言）

逐一涵蓋：
- `POST/GET /api/organizations`：未登入 401、system admin 看全部、org admin 只看自己、plain member 也能看自己（見已知問題）、建立時的四項欄位驗證、`billingEmail` 重複衝突
- `GET/PATCH/DELETE /api/organizations/[id]`：`requireOrgAccess` 在 read/write 兩種層級的行為、`SYSTEM_ADMIN_ONLY_FIELDS`（planTier/maxSeats/status/billingEmail 等）非系統管理員一律 403、`usedSeats` 永遠不可直接 PATCH、軟刪除轉 `cancelled` 與硬刪除
- `GET/POST /api/org-units`、`GET/PATCH/DELETE /api/org-units/[id]`、`POST /api/org-units/[id]/move`：跨組織 `parentId`/`newParentId` 一律拒絕（含用 `parentId` 反查組織避免枚舉別組織子樹的守門）、自己/子孫/跨組織三種非法移動、有子單位不能硬刪除
- `GET/POST /api/organizations/[id]/members`、`PATCH/DELETE /api/organizations/[id]/members/[profileId]`：`isOrgAdmin` 只有系統管理員能授予/收回、無法移除組織主要管理員（`adminUserId`）除非系統管理員操作
- `GET/POST /api/licenses`、`GET/PATCH/DELETE /api/licenses/[id]`、`POST/DELETE /api/licenses/[id]/assign`：核發上限、`status`/`userId` 不可經 PATCH 直接改（必須走 `/assign`）、已指派授權不能直接 DELETE、`GET ?userId=` 的「本人或系統管理員」規則
- Audit log：`organization.create`、`organization.delete.soft`、`organization.delete.hard`、`license.assign`、`license.unassign` 五種 action 各自斷言 `jvtutorcorner-audit-logs` 表（`byTargetId` GSI）真的寫入了對應紀錄

### UI 層 — `e2e/b2b_license_panel_ui_flow.spec.ts`

- 批次核發 2 個未指派授權，表格正確顯示「未指派（庫存）」
- 指派給既有成員（Email），狀態變「已指派」並顯示成員資訊
- 取消指派，驗證真實行為是變成「已撤銷」而不是回到可再指派的庫存（見下方問題 3 的說明）
- 核發新授權不受剛才那筆 `revoked` 記錄影響（核發上限 bug 的回歸測試，`maxSeats` 刻意設成 2 讓 bug 會被觸發）
- 撤銷一筆未指派授權，驗證 UI 的「撤銷」其實是軟刪除（列還在，只是狀態變 `已撤銷`），不是真的刪除

## 已發現並修復的問題

1. **正式環境 `jvtutorcorner-audit-logs` 資料表從未部署，稽核紀錄全部靜默失敗** — `cloudformation/dynamodb-audit-log-table.yml` 樣板存在，但從未實際部署到正式 AWS 帳號（`DescribeTable` 回 `ResourceNotFoundException`）。`lib/auditLogService.ts` 的 `writeAuditLog()` 刻意把所有錯誤 catch 掉、只印 console.error（設計目的是「稽核寫入絕不能擋住主要操作」），所以這個 bug 完全無聲——組織建立/刪除、授權指派/取消指派等所有稽核紀錄，從這個功能上線以來全部沒有真的寫進資料庫。修復：寫了 `scripts/create-audit-log-table.mjs`（等效於部署該 CF 樣板，含 `byTargetId` GSI + PITR），已在正式環境建表（使用者確認後才動手，屬於基礎設施異動）。

2. **`lib/licenseService.ts` 的 `createLicense` 對 `byUserId` GSI key 寫入 `NULL`，核發未指派授權直接 500** — 未指派的授權原本寫 `userId: input.userId || null`，但 `byUserId` 是本次會話稍早才補上的 GSI 的 key 屬性，DynamoDB 不允許 GSI key 是 `NULL` 型別（要求 String）。`revokeLicense` 早就用 `REMOVE userId` 正確處理過同一個問題（程式碼裡還留著解釋這個坑的註解），但 `createLicense` 沒有同步更新，導致新增 GSI 之後，`POST /api/licenses`（核發庫存授權）從此必定 500。修復：改成 `userId: input.userId || undefined`，靠 `DynamoDBDocumentClient` 的 `removeUndefinedValues: true` 直接省略該欄位。

3. **核發授權的上限檢查把 `revoked`/`expired` 的歷史記錄永久算進配額，造成「席次外洩」** — `POST /api/licenses` 原本用 `listLicensesByOrg(orgId)`（不帶 status，撈這個組織「所有歷史授權記錄」）跟 `maxSeats` 比較。但 `DELETE /api/licenses/[id]/assign`（取消指派）與 UI 的「撤銷」按鈕都只會把授權標成 `revoked`（軟刪除），記錄不會真的消失。組織每經歷一次「加入又移除成員」，就會永久多一筆 `revoked` 記錄佔用核發上限——即使 `usedSeats` 遠低於 `maxSeats`，核發新授權還是會被 409 擋下來，且沒有任何 UI 路徑能清掉這些歷史記錄。修復：改成只計算「目前活著」的容量（`org.usedSeats + listLicensesByOrg(orgId, 'pending').length`），`e2e/b2b_license_panel_ui_flow.spec.ts` 用 `maxSeats: 2` 的小組織重現並鎖住這個回歸。

## 已知限制（非本技能範圍，但驗證過程中確認的行為）

- **`GET /api/organizations` 跟 `GET /api/organizations/[id]` 的授權寬鬆度不一致** — 前者只檢查「有沒有 `orgId`」，任何登入的組織成員（哪怕 `isOrgAdmin: false`）都能透過清單端點看到自己組織的完整資料（含 `billingEmail` 等欄位）；後者透過 `requireOrgAccess` 要求 `isOrgAdmin: true` 才放行，同一個 plain member 打 `/[id]` 會被 403。這是產品意圖不明確的設計不一致（該收緊清單端點，還是該放寬詳情端點，需要產品判斷），不在本技能自行決定修復，只記錄下來。
- 不重複 `b2b-core-modules`/`b2b-admin-ui-flow`/`b2b-access-orgunits` 已覆蓋的併發/邊界案例，只驗證 HTTP route 層本身的 wiring 與授權面板 UI。

## 執行方式

```bash
# 前置：dev server 要自己起
npm run dev

# 一次性：確保 audit-logs 表存在（已在正式環境建過，重跑是 no-op）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/create-audit-log-table.mjs

# API 層（不需要瀏覽器）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-http-routes.mjs

# UI 層（headed，會跳出瀏覽器視窗）
npx playwright test e2e/b2b_license_panel_ui_flow.spec.ts --project=chromium-headed
```

`.env.local` 目前指向正式環境 AWS 帳號，兩支都會對正式環境寫入/清理測試資料，正常結束不留殘留。

## 相關檔案

### 驗證
- [scripts/verify-b2b-http-routes.mjs](../../../scripts/verify-b2b-http-routes.mjs)
- [e2e/b2b_license_panel_ui_flow.spec.ts](../../../e2e/b2b_license_panel_ui_flow.spec.ts)
- [scripts/create-audit-log-table.mjs](../../../scripts/create-audit-log-table.mjs)

### 受測程式碼
- `app/api/organizations/route.ts`、`app/api/organizations/[id]/route.ts`
- `app/api/organizations/[id]/members/route.ts`、`app/api/organizations/[id]/members/[profileId]/route.ts`
- `app/api/org-units/route.ts`、`app/api/org-units/[id]/route.ts`、`app/api/org-units/[id]/move/route.ts`
- `app/api/licenses/route.ts`（本次修復核發上限邏輯）、`app/api/licenses/[id]/route.ts`、`app/api/licenses/[id]/assign/route.ts`
- `components/org/OrgLicensesPanel.tsx`
- `lib/licenseService.ts`（本次修復 `createLicense` 的 GSI-null bug）
- `lib/auditLogService.ts`、`cloudformation/dynamodb-audit-log-table.yml`

## 相關技能
- `b2b-core-modules` — licenseService/orgMembershipService/orgUnitService/orgAccess 的無頭深度驗證（本技能不重複這些）
- `b2b-admin-ui-flow` — 建組織/建部門/加成員/移除成員的 headed 瀏覽器流程（不含授權分頁）
- `b2b-enterprise-registration` — 企業自助註冊入口，同樣使用 `lib/auth/sessionManager.ts` 的 session bypass 手法

## 故障排除

**`POST /api/licenses` 核發庫存授權回 500，錯誤訊息提到 `byUserId`** — 檢查 `lib/licenseService.ts` 的 `createLicense` 是不是又把 `userId` 寫成 `null`（見上方問題 2）。任何要對 `Licenses` 表寫入且該筆記錄「刻意不設 userId」的地方，都必須 `REMOVE`/省略欄位，不能 `SET ... = null`——這張表的 `userId` 是 GSI key。

**核發授權明明還有空席次卻一直 409** — 檢查 `app/api/licenses/route.ts` 的上限檢查是不是又改回用 `listLicensesByOrg(orgId)`（不帶 status）撈全部歷史記錄。正確作法只能算 `org.usedSeats + pending 數量`（見上方問題 3）。

**`jvtutorcorner-audit-logs` 查詢不到預期的紀錄** — 先確認資料表本身存在（`node --import ./scripts/lib/register-ts-resolve.mjs scripts/create-audit-log-table.mjs`，已存在會直接印「Table already exists」跳過），再確認呼叫 `writeAuditLog()` 的那段程式碼有沒有被改動。

---

**最後更新**: 2026-08-08
