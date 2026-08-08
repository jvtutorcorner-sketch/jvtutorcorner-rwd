---
name: b2b-core-modules
description: 'B2B 企業戶核心模組驗證技能。用 Node 腳本直接打正式環境 DynamoDB（不透過 UI/Playwright），涵蓋席次/授權 CRUD、成員增刪的跨表交易、組織單位階層與 moveOrgUnit 原子性、orgAccess 授權範圍守門，以及一般權限（B2C 購課）與企業戶（B2B 席次）共用的課程存取閘門 accessControl.ts。'
argument-hint: '驗證 B2B 席次/授權、成員管理、組織單位階層、orgAccess 授權範圍、B2C/B2B 共用課程存取閘門'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-08-08'
  architecture-aligned: true
  notes: '涵蓋 32c5977 commit 點名的四個核心模組；過程中發現並修復 4 個問題（見下）。不含 dept_admin 子部門範圍限制（未實作）與跨租戶 SSO 隔離（見 b2b-tenant-isolation，待階段 2-2）。'
---

# B2B 企業戶核心模組驗證技能 (B2B Core Modules Skill)

負責驗證企業（B2B）功能裡**已經是真實可執行程式碼**的四個核心模組。這些是 `32c5977 feat(b2b)` commit message 明確點名的 Core Fix，且不依賴尚未實作的東西（例如 `b2b-tenant-isolation` skill 描述的 dept_admin 子部門範圍限制，那個目前不存在於程式碼中）。

驗證方式刻意不用 Playwright/UI：這四個模組的核心邏輯是 DynamoDB 交易（TransactWriteCommand 的樂觀鎖、GSI 條件、跨表原子性），最直接的驗證方式是用 Node 腳本直接呼叫 `lib/*.ts` 的 service 函式打正式環境 DynamoDB，斷言資料庫最終狀態，而不是繞一圈 UI 再回頭查資料庫。每支腳本都在 `finally` 區塊 hard-delete 自己建立的資料，正常結束不留殘留。

## 核心職責

- 驗證席次（seat）指派/撤銷在併發下不超賣、不留下部分寫入
- 驗證成員加入/移出組織時，seat 計數、授權狀態、profile 的 B2B/B2C 欄位三方同步且原子
- 驗證組織單位（部門）階層的建立、移動（含子樹路徑重寫）、封存/刪除、路徑修復
- 驗證 `orgAccess.ts` 的系統管理員／組織管理員兩層授權判斷，包含容易被誤改的邊界（一般成員連自己組織的讀取都應該被拒）
- 驗證 `accessControl.ts` 的 `verifyCourseAccess`——**B2C 一般權限（enrollment）與 B2B 企業戶（seat）走同一個函式**，兩邊都要驗，還要驗證「兩者都有效時哪個優先」

## 測試模組

### M1. 席次/授權 CRUD + 成員增刪
`lib/licenseService.ts`、`lib/orgMembershipService.ts`（`assignMemberWithLicense`/`removeMemberFromOrg`，跨 organizations/licenses/profiles 三表的單一 ACID 交易）。

- 依序指派到 `maxSeats` 上限、第 N+1 個指派被拒絕且不留下部分寫入
- 5 個 profile 同時搶 2 個席次（併發）：`usedSeats` 精準停在上限，不超賣
- 移除成員：seat 釋放、授權變 `revoked`、`orgId`/`licenseId` 清空、**`plan` 還原為 `'free'`**
- 移除「已無有效授權」的邊界案例不會把 `usedSeats` 打到負值

腳本：[scripts/verify-b2b-seat-membership.mjs](../../../scripts/verify-b2b-seat-membership.mjs)
手動測試：[docs/b2b-seat-membership-manual-test-guide.md](../../../docs/b2b-seat-membership-manual-test-guide.md)

### M2. 授權範圍 (orgAccess) + 組織單位階層 (orgUnitService)
`lib/auth/orgAccess.ts`（`requireOrgAccess`/`requireSystemAdmin`）、`lib/orgUnitService.ts`（`moveOrgUnit` 的 TransactWriteCommand 樂觀鎖）。

- 系統管理員全權；組織管理員僅限自己組織的 `read`/`write`，`system` 級（計費）一律要系統管理員；一般成員連自己組織的 `read` 都是 403
- `moveOrgUnit` 擋自我移動、擋移到自己子孫、擋跨組織；帶子孫的移動正確用 slice 重寫整個子樹路徑
- 併發對同一單位發兩個不同目標的移動，恰好一個成功（`#path = :expectedOldPath` 樂觀鎖）
- `deleteOrgUnit` 硬刪除在有子單位時被擋；`repairOrgUnitPaths` 能修回手動弄髒的路徑

腳本：[scripts/verify-b2b-access-orgunits.mjs](../../../scripts/verify-b2b-access-orgunits.mjs)
手動測試：[docs/b2b-access-orgunit-manual-test-guide.md](../../../docs/b2b-access-orgunit-manual-test-guide.md)

### M3. B2C/B2B 共用課程存取閘門
`lib/accessControl.ts` 的 `verifyCourseAccess`——目前唯一同時處理「一般權限」與「企業戶」的函式，被 `app/api/courses/[id]/materials/**`、`app/api/whiteboard/room/route.ts` 呼叫。

- B2C：`PAID`/`ACTIVE` enrollment 放行，其他狀態拒絕
- B2B：org-wide 席次（無 `courseId`）放行任何課程；課程限定席次只放行該課程；`revoked`/過期/組織被停用一律拒絕
- **優先順序**：同一使用者同時有有效 enrollment 與有效席次時，`source` 回 `'B2C'`（enrollment 先查）
- `stripTabId` 的純函式行為（帶 tabId 後綴的 email/id 正確剝除）

腳本：[scripts/verify-b2c-b2b-course-access.mjs](../../../scripts/verify-b2c-b2b-course-access.mjs)

## 已發現並修復的問題

寫這些腳本的過程中連續挖到 4 個先前沒有任何測試覆蓋到的真實問題（不是測試寫錯），都已修復並在腳本裡留了對應的回歸斷言：

1. **`orgMembershipService.ts`：`plan` 保留字未加別名** — `assignMemberWithLicense`/`removeMemberFromOrg` 的 UpdateExpression 直接寫 `plan = :xxx`，`plan` 是 DynamoDB 保留字，兩個函式呼叫必定丟 `ValidationException`。指派/移除成員在修復前於正式環境完全壞掉。
2. **`orgMembershipService.ts`：`orgId` 是 GSI key 卻用 `SET ... = :null`** — DynamoDB 不允許把 GSI key 屬性 SET 成 NULL 型別，`removeMemberFromOrg` 改用 `REMOVE orgId`（與 `licenseService.revokeLicense` 對 `userId` 的既有處理一致）。
3. **`accessControl.ts`：B2C 分支欄位名對不上真實 schema** — Scan filter 寫 `studentID`/`courseID`，但 `app/api/enroll/route.ts` 寫入的真實欄位是 `userId`/`courseId`（camelCase，已對正式環境資料驗證）。這個 filter 修復前**永遠不會 match 任何真實 enrollment 記錄**，B2C 學員的課程存取會一路 fallthrough 到 B2B 檢查再被拒絕。
4. **正式環境 DynamoDB：Licenses 表缺少 `byUserId` GSI** — `accessControl.ts` 的 B2B 分支唯一依賴的 `listLicensesByUser` 查詢直接回 `The table does not have the specified index: byUserId`，代表**企業戶席次式課程存取在修復前完全是壞的**（`verifyCourseAccess` fail-closed 吞掉這個錯誤直接拒絕，不會噴 500，所以肉眼看不出來）。修復工具 `scripts/setup-db.ts` 的 `updateLicensesTable()` 早就寫好了（commit 32c5977 就提到 idempotent GSI provisioning），只是沒有真的對正式環境跑過；已執行補上。

## 已知限制

- **dept_admin 子部門範圍限制未實作**——`.agents/skills/b2b-tenant-isolation/SKILL.md` 的 M2 描述的 `apiGuard scope:'orgUnit'` 在程式碼中不存在（`apiGuard.ts` 沒有 `scope` 參數），本技能只驗證系統管理員／組織管理員兩層真實存在的授權。
- **跨租戶 SSO 隔離不在本技能範圍**——需要真實 Google SSO fixture，等主計畫階段 2-2 完成後見 `b2b-tenant-isolation`。

## 執行方式

```bash
# 前置：.env.local 需要 DYNAMODB_TABLE_PROFILES、DYNAMODB_TABLE_LICENSES
# （原本缺漏，已補上）。.env.local 目前指向正式環境 AWS 帳號，三支腳本都會
# 對正式環境寫入/清理測試資料，正常結束不留殘留。

node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-seat-membership.mjs
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-access-orgunits.mjs
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2c-b2b-course-access.mjs
```

`--import ./scripts/lib/register-ts-resolve.mjs` 是必要的：repo 沒裝 ts-node/tsx，這個自訂 loader（見下方「相關檔案」）讓純 Node 能直接執行 `lib/*.ts` 裡 Next.js/webpack 風格的無副檔名相對匯入、`@/*` 路徑別名，以及 `next/server` 這種沒有 `exports` map 的裸模組匯入。

## 相關檔案

### 驗證腳本
- [scripts/verify-b2b-seat-membership.mjs](../../../scripts/verify-b2b-seat-membership.mjs)
- [scripts/verify-b2b-access-orgunits.mjs](../../../scripts/verify-b2b-access-orgunits.mjs)
- [scripts/verify-b2c-b2b-course-access.mjs](../../../scripts/verify-b2c-b2b-course-access.mjs)

### 執行基礎設施
- [scripts/lib/ts-resolve-loader.mjs](../../../scripts/lib/ts-resolve-loader.mjs)、[scripts/lib/register-ts-resolve.mjs](../../../scripts/lib/register-ts-resolve.mjs) — 讓 `lib/*.ts` 能被純 Node 直接執行的 ESM resolve hook

### 手動測試文件
- [docs/b2b-seat-membership-manual-test-guide.md](../../../docs/b2b-seat-membership-manual-test-guide.md)
- [docs/b2b-access-orgunit-manual-test-guide.md](../../../docs/b2b-access-orgunit-manual-test-guide.md)

### 受測程式碼
- `lib/licenseService.ts`、`lib/orgMembershipService.ts`
- `lib/auth/orgAccess.ts`、`lib/orgUnitService.ts`
- `lib/accessControl.ts`
- `scripts/setup-db.ts`（GSI 供應工具，本次用來補 Licenses.byUserId）

## 相關技能
- `b2b-tenant-isolation` — 跨租戶隔離的 E2E 驗證（真實 Google SSO fixture），M2 的 dept_admin 範圍待該處階段 2-2 完成後才可執行
- `b2c-verification` — B2C 獲客漏斗與公開頁驗證，M4 提到的 B2C/B2B 租戶邊界與本技能的 M3 互補
- `api-performance-testing` — 通用 k6 框架，可用來對本技能涵蓋的 API route 做壓力測試

## 故障排除

**`MODULE_TYPELESS_PACKAGE_JSON` 警告** — 無害，只是 Node 提示 `.ts` 檔案被當成 ESM 重新解析有效能開銷；不影響腳本正確性。

**`Cannot find module '.../lib/xxx'`（缺副檔名）或 `'@/lib/xxx'`（路徑別名）或 `next/server`** — 忘了帶 `--import ./scripts/lib/register-ts-resolve.mjs`。

**`DYNAMODB_TABLE_PROFILES 環境變數未設定`** — `.env.local` 缺這個變數（`lib/licenseService.ts` 有預設值會 fallback，但 `lib/profilesService.ts` 沒有，會直接丟錯）；補上 `DYNAMODB_TABLE_PROFILES=jvtutorcorner-profiles`。

**`The table does not have the specified index: byUserId`** — 代表本技能修復的 GSI 又不見了（例如換了一個沒跑過 `setup-db.ts` 的新 DynamoDB 帳號/環境）；對該環境重新執行 `node --import ./scripts/lib/register-ts-resolve.mjs scripts/setup-db.ts`（記得先把 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` 匯出到 shell，這支腳本沒有自己載入 `.env.local`）。GSI 建立有 AWS 端 backfill，即使是空表也可能要等 1–5 分鐘才會變成 `ACTIVE`。

---

**最後更新**: 2026-08-08
