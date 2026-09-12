---
name: server-auth-guards
description: '伺服器端守門鏈：apiGuard 家族（withAuth／withAdmin／withAnyAuth／withAdminOrHmac）、手寫守衛、HMAC 內部簽章、頁面守衛（server layout）、middleware 與課程／教室存取檢查。Use when: adding or changing an API route or page layout, touching lib/auth/*, debugging 401/403/redirects, or reviewing authorization.'
argument-hint: '描述要新增或檢查的路由／頁面，例如：新增 admin API、某頁面學生不該進得去'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [auth-sso, roles-page-permissions, abuse-prevention, enterprise-general-test-coverage, b2b-tenant-isolation]
---

# 伺服器端守門 (Server Auth Guards)

所有權限判斷都在伺服器端完成；前端的選單隱藏只是體驗，不是防線。本技能說明每一層守衛的行為、何時該用哪一個，以及怎麼驗證。

## 守衛一覽

| 守衛 | 位置 | 放行條件 | 失敗回應 |
|---|---|---|---|
| `withAuth(handler, { roles? })` | [lib/auth/apiGuard.ts](../../../lib/auth/apiGuard.ts) | 有效 session cookie（且角色符合） | 401 無 session／403 角色不符 |
| `withAdmin` | 同上 | session 角色為 `admin` | 401／403 |
| `withAnyAuth` | 同上 | session **或** 有效 HMAC 簽章（簽章換成 `system` 身分） | 401 |
| `withAdminOrHmac` | 同上 | admin／system session **或** HMAC 簽章 | 401／403 |
| 手寫守衛 | `/api/auth/me`、`app/api/integration/make-*`、`app/api/cron/*`、`app/api/line/webhook` | 各自實作 | 各自實作（make-* 對錯誤角色也回 401） |
| `requirePageSession`／`requireTeacherPage`／`requireAdminPage` | [lib/auth/pageGuard.ts](../../../lib/auth/pageGuard.ts) | server layout 內呼叫 | `redirect('/login?reason=<page>_no_session')`／`redirect('/dashboard?forbidden=1')` |
| `canAccessPage` | [app/admin/layout.tsx](../../../app/admin/layout.tsx) + [lib/auth/pagePermissions.ts](../../../lib/auth/pagePermissions.ts) | 頁面權限矩陣 | `/login?reason=admin_no_session`／`/dashboard?forbidden=1` |
| middleware | [middleware.ts](../../../middleware.ts) | — | 為 API 回應加上 `Cache-Control: no-store` 等標頭 |

**e2e bypass**：`x-e2e-secret` 等於 `LOGIN_BYPASS_SECRET` 時，apiGuard 家族在角色檢查**之前**回傳 `system` session（等同 admin），且**只在非 production** 生效。手寫守衛不認這個 header——這是刻意的，測試手寫守衛時要用真登入。

**HMAC 簽章**（[lib/auth/hmac.ts](../../../lib/auth/hmac.ts)）：訊息為 `METHOD\n<pathname+query>\n<timestamp ms>\n<body>`，HMAC-SHA256 hex，放在 `X-Api-Timestamp`／`X-Api-Signature`。時間戳最多 5 分鐘前、最多超前 30 秒；路徑由 `req.url` 推導，所以 query 也在簽章範圍內。伺服器之間的內部呼叫請用 [lib/auth/internalFetch.ts](../../../lib/auth/internalFetch.ts)，不要自己拼。

**資源層檢查**：角色過了之後，還要檢查「是不是你的東西」：
- [lib/auth/courseOwnership.ts](../../../lib/auth/courseOwnership.ts)：老師只能改自己的課。
- [lib/auth/classroomAccess.ts](../../../lib/auth/classroomAccess.ts)：只有該堂課的老師／已報名學生能拿教室 token。
- [lib/auth/orgAccess.ts](../../../lib/auth/orgAccess.ts)：B2B 組織範圍（見 [b2b-tenant-isolation](../b2b-tenant-isolation/SKILL.md)）。
- [lib/payments/payableOrder.ts](../../../lib/payments/payableOrder.ts)：只能付自己的單。

## 新增路由的檢查清單

1. 預設包 `withAuth`；只有真的要公開時才不包，並在 [docs/page-permissions-matrix.md](../../../docs/page-permissions-matrix.md) 註明理由。
2. 角色限制寫在守衛參數，不要在 handler 裡 `if (role !== ...)`。
3. 從 session 取 userId，不要信任 body／query 的 `userId`（除非 admin）。
4. 先驗證欄位（400）再碰資料庫或外部服務。
5. 新頁面：在 server `layout.tsx` 呼叫 `pageGuard` 的對應函式（目前 23 個 layout 使用）。
6. 跑 `node scripts/inspect_apis.mjs` 更新 [docs/api_registry.md](../../../docs/api_registry.md)。

## 相關檔案

- [lib/auth/apiGuard.ts](../../../lib/auth/apiGuard.ts)、[lib/auth/pageGuard.ts](../../../lib/auth/pageGuard.ts)、[lib/auth/hmac.ts](../../../lib/auth/hmac.ts)、[lib/auth/internalFetch.ts](../../../lib/auth/internalFetch.ts)、[lib/auth/sessionManager.ts](../../../lib/auth/sessionManager.ts)
- [lib/auth/classroomAccess.ts](../../../lib/auth/classroomAccess.ts)、[lib/auth/courseOwnership.ts](../../../lib/auth/courseOwnership.ts)、[lib/auth/orgAccess.ts](../../../lib/auth/orgAccess.ts)、[lib/auth/pagePermissions.ts](../../../lib/auth/pagePermissions.ts)
- [middleware.ts](../../../middleware.ts)、[app/admin/layout.tsx](../../../app/admin/layout.tsx)
- 架構圖：[docs/auth-architecture-diagram.md](../../../docs/auth-architecture-diagram.md)；頁面矩陣：[docs/page-permissions-matrix.md](../../../docs/page-permissions-matrix.md)
- 測試：[e2e/server_auth_guards_verification.spec.ts](../../../e2e/server_auth_guards_verification.spec.ts)、[e2e/enterprise_general_security_contract.spec.ts](../../../e2e/enterprise_general_security_contract.spec.ts)、[e2e/helpers/auth-helpers.ts](../../../e2e/helpers/auth-helpers.ts)、[scripts/verify-course-ownership-scope.mjs](../../../scripts/verify-course-ownership-scope.mjs)

## 測試指令

```bash
npx playwright test e2e/server_auth_guards_verification.spec.ts --project=chromium
npx playwright test e2e/enterprise_general_security_contract.spec.ts --project=chromium
node scripts/verify-course-ownership-scope.mjs
```

大量登入的批次測試請在指令前加 `DISABLE_RATE_LIMIT=true`（登入每 IP 每 15 分鐘 30 次；只在非 production 生效）。

## 環境驗證 (Environment Validation)

- `SESSION_SECRET`：簽 session cookie。
- `API_HMAC_SECRET`：HMAC 簽章；未設定時 HMAC 測試會 skip。
- `LOGIN_BYPASS_SECRET`：e2e bypass 與登入 captcha 繞過（非 production）。
- `TEST_STUDENT_EMAIL`／`TEST_STUDENT_PASSWORD`、`TEST_TEACHER_EMAIL`／`TEST_TEACHER_PASSWORD`。

`next.config.ts` 在啟動時會警告 `SESSION_SECRET`／`API_HMAC_SECRET` 仍是已作廢的預設值——看到就要輪換。

## 故障排除

- **頁面守衛測試看到 200 而不是 3xx**：`next dev` 對 streaming 頁面的 `redirect()` 回 200，並把目標寫進 HTML。斷言請用 `expectPageRedirect`（兩種都接受，但都比對目標網址）。
- **SYS 身分打 `/api/auth/me` 得 401**：預期行為，手寫守衛不認 e2e bypass。
- **HMAC 簽章正確卻 401**：確認簽的是 `pathname+query`（不含 origin）、時間戳是毫秒、body 與送出的字串完全相同。
- **已修正（2026-09-11）**：`POST /api/points` 先前對「本人」放行 add／deduct／set，任何登入學生都能自設點數；現改為只允許 admin／system（含 HMAC）。回歸案例在 `e2e/server_auth_guards_verification.spec.ts` 的「/api/points」區塊。
- **已修正（2026-09-11）**：`components/auth/PermissionGuard.tsx` 在判定完成前回傳 null，伺服器端永遠停在 checking，所有頁面的 SSR HTML 只剩 header/footer；現改為判定前照常渲染、確定拒絕後才換成 403 面板。它仍只是介面層控制，真正的擋下由 server layout 的 pageGuard 負責。
- **已知缺口**（盤點時發現，尚未修）：
  1. `app/api/line/webhook/[integrationId]` 的 `x-simulation: true` header 可跳過 LINE 簽章驗證。
  2. `app/api/whiteboard/stream` SSE 未驗證，以 uuid 曝露白板狀態。
  3. `app/api/integration/make-{config,sync}` 的手寫 `requireAdmin` 對錯誤角色回 401（應為 403）。

## 相關技能

- [auth-sso](../auth-sso/SKILL.md)：session 如何產生（登入、Google、LINE）。
- [roles-page-permissions](../roles-page-permissions/SKILL.md)：頁面權限矩陣與角色設定。
- [abuse-prevention](../abuse-prevention/SKILL.md)：帳號停權與速率限制。
- [enterprise-general-test-coverage](../enterprise-general-test-coverage/SKILL.md)：模組覆蓋矩陣。
