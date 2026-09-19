---
name: roles-page-permissions
description: '角色定義、頁面權限矩陣與 App 權限的設定與強制：/api/admin/roles、/api/admin/settings、/api/apps/permissions 與後台設定頁。Use when: adding a role, changing which roles can see a page/menu/app, or debugging "forbidden=1" redirects.'
argument-hint: '描述要調整的角色或頁面權限，例如：讓老師看得到某個 App'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-17'
  architecture-aligned: true
  related-skills: [server-auth-guards, navbar-verification, b2b-core-modules]
---

# 角色與頁面權限 (Roles & Page Permissions)

## 資料與服務

| 服務 | 內容 | API |
|---|---|---|
| [lib/rolesService.ts](../../../lib/rolesService.ts) | 角色清單 | `GET /api/admin/roles`（公開，只含角色名稱）、`POST`（admin） |
| [lib/pagePermissionsService.ts](../../../lib/pagePermissionsService.ts) | 頁面 × 角色矩陣、選單 | 經由 `/api/admin/settings`（GET 公開，給前端做選單；POST admin） |
| [lib/appPermissionsService.ts](../../../lib/appPermissionsService.ts) | `/apps` 下各 App 的可見角色 | `GET/POST /api/apps/permissions`（admin） |

**強制點**在伺服器：[lib/auth/pagePermissions.ts](../../../lib/auth/pagePermissions.ts) 的 `canAccessPage` 被 [app/admin/layout.tsx](../../../app/admin/layout.tsx) 使用；其他頁面用 [lib/auth/pageGuard.ts](../../../lib/auth/pageGuard.ts)。GET 設定公開是為了讓前端決定要不要**顯示**選單，不代表頁面可進入。

完整矩陣見 [docs/page-permissions-matrix.md](../../../docs/page-permissions-matrix.md)。

### `canAccessPage` 判定順序（/admin/**）

1. `admin` / `system` 永遠允許（在查 DB 前短路，不會被設定鎖在後台外）。
2. **DB 覆寫**：把路徑拆成前綴（最長→最短，如 `/admin/learners/123` → `/admin/learners/123`、`/admin/learners`、`/admin`），以 `id`（= path）BatchGet `DYNAMODB_TABLE_PAGE_PERMISSIONS`。第一筆 `permissions[]` 內有該角色的 item 決定結果：`allowed = pageVisible !== false`（與 PageAccessSettings / PermissionGuard 同語意；未勾「頁面可見」= 擋）。30 秒記憶體快取。
3. 沒有符合的 item、item 內沒有該角色、或 DB 失敗 → 內建 `DEFAULT_PAGE_PERMISSIONS`（含 `/admin/organizations/*/members` 萬用）。
4. 未設定 `DYNAMODB_TABLE_PAGE_PERMISSIONS` 時不查 DB（與 pagePermissionsService 一致；next.config.ts 會補預設表名）。

> 2026-09-17 前的實作查 GSI `RolePathIndex` 的頂層 `roleId`，但寫入端從未寫這個欄位，DB 覆寫在伺服器端**從未生效**。改版後後台勾選會真的影響 dept_admin 等角色能否進入 /admin 子頁——注意 `/api/admin/settings` 的 refresh 動作會把所有頁面的 `pageVisible` 預設為 `true`。
>
> 動態路由段（例如設定裡的 `/admin/organizations/[id]`）不會以字面比對命中實際 URL，這類頁面只會吃到較短的靜態前綴或預設矩陣。

離線驗證：`node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-page-permissions.mjs`（假 DynamoDB，不連網路）。

## 後台頁面

- [app/admin/settings/page-permissions/](../../../app/admin/settings/page-permissions/)：編輯頁面矩陣
- [app/admin/settings/roles-usage/](../../../app/admin/settings/roles-usage/)：角色使用狀況
- [app/admin/roles/](../../../app/admin/roles/)：角色管理
- [app/apps/page-permissions/](../../../app/apps/page-permissions/)：App 權限

## 相關檔案

- 上列服務與頁面、[app/api/admin/roles/route.ts](../../../app/api/admin/roles/route.ts)、[app/api/admin/settings/route.ts](../../../app/api/admin/settings/route.ts)、[app/api/apps/permissions/route.ts](../../../app/api/apps/permissions/route.ts)
- 測試：[e2e/roles_page_permissions_verification.spec.ts](../../../e2e/roles_page_permissions_verification.spec.ts)、[scripts/verify-page-permissions.mjs](../../../scripts/verify-page-permissions.mjs)（離線）

## 測試指令

```bash
npx playwright test e2e/roles_page_permissions_verification.spec.ts --project=chromium
```

SYS 請求都故意送格式錯誤的資料（`roles` 不是陣列、缺 `name`、缺 `appConfigs`），在寫入前回 400。

## 環境驗證 (Environment Validation)

- DynamoDB 設定表（角色、頁面權限、App 權限）與 AWS 憑證；測試帳號見 [server-auth-guards](../server-auth-guards/SKILL.md)。

## 故障排除

- **選單有顯示但點進去被導回 `/dashboard?forbidden=1`**：前端選單讀的是設定，伺服器守衛讀的是角色；兩者不一致時以伺服器為準，檢查 layout 用的是哪個守衛；/admin 下另查 page-permissions 表中該路徑（及其前綴）對該角色的 `pageVisible`。
- **新增角色後頁面全部被擋**：矩陣裡新角色預設沒有任何頁面，要在 page-permissions 頁勾選。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)、[navbar-verification](../navbar-verification/SKILL.md)
