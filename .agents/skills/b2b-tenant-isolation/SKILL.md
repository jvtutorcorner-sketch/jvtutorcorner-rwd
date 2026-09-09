---
name: b2b-tenant-isolation
description: 'B2B 多租戶隔離端到端驗證技能。確保跨租戶課程/學員/證書不可見、dept_admin 限本部門、seat 上限與撤銷生效、GDPR DSAR 匿名化保留正確。使用真實 Google SSO fixture，不走 LOGIN_BYPASS_SECRET。'
argument-hint: '驗證 B2B 租戶隔離、seat 控管、dept_admin 範圍、DSAR、證書 URL-only 公開驗證'
metadata:
  verified-status: '🔄 SCAFFOLD'
  last-verified-date: ''
  architecture-aligned: true
  notes: '階段 0-1/0-2/0-3 完成後建立此 skill 雛形；完整 E2E 需階段 2-2 Google SSO 完整實作後補真實 fixture（org A/B × admin/dept_admin/student）。'
---

# B2B 租戶隔離驗證技能 (B2B Tenant Isolation Skill)

負責驗證企業級多租戶平台的**租戶資料邊界**與**角色範圍限制**。此 skill 不走 `auto-login` 的 `LOGIN_BYPASS_SECRET` bypass 機制，改採**真實 Google SSO fixture**，以最接近生產環境的方式驗證身份與隔離。

## 觸發時機

- 階段 0 完成（Session tenantId 貫通 + seat 控管 + RBAC）後首次執行
- 階段 2-2（Google SSO 完整實作含白名單）完成後補真實 fixture
- 每次涉及 `/api/*` 授權、seat、RBAC、證書、DSAR 變更後回歸
- k6 `b2b-tenant-isolation` profile 效能壓測

## 測試 fixture（待階段 2-2 完成）

真實 Google test OAuth client（`.env.local` 專用 redirect URI）下建立 2 個 organization：

| Org | Domain | dept_admin email | student email | admin email |
|---|---|---|---|---|
| A | orga.test | deptadmin@orga.test | alice@orga.test | admin@orga.test |
| B | orgb.test | deptadmin@orgb.test | bob@orgb.test | admin@orgb.test |

每個 organization 含 2 個 OrgUnit（例如 `/engineering`、`/sales`），dept_admin 各自隸屬一個單位。

## 測試矩陣

### M1 — 跨租戶課程不可見
- A 學員嘗試存取 B 的課程 → 403（`verifyCourseAccess` 經 `checkUserSeat` 拒絕）
- A 學員呼叫 `/api/courses/[B課程]` → 不在可見清單
- 證書驗證路由 `/api/certificates/verify/[id]` 公開可驗，但學員清單 `/api/certificates?userId=B學員` 對 A admin 不可回傳 B 證書（階段 1-3 完成）

### M2 — dept_admin 限本部門（✅ orgAccess 層已實作，見 `scripts/verify-b2b-dept-admin-scope.mjs`）
- A 的 `/engineering` dept_admin 嘗試管 `/sales` 學員 → 403（`lib/auth/orgAccess.ts` 的
  `requireOrgUnitAccess` / `requireMemberScopeAccess` 拒絕；不是 apiGuard 的通用
  `scope:'orgUnit'` 參數 —— apiGuard 本身沒有加這個概念，範圍限制是 orgAccess 專屬函式）
- A dept_admin 嘗試指派講師 → 403（roles 不含 `dept_admin`，待有真實 fixture 後補課程指派 API 的角色矩陣測試）
- A dept_admin 進入 `/admin/teachers` → redirect `/dashboard?forbidden=1`（page permission 矩陣，`DEFAULT_PAGE_PERMISSIONS` 已有 dept_admin 條目）
- A dept_admin 可見 `/admin/learners` 且僅列出 `/engineering` 下學員（API 層已用
  `filterOrgUnitsForActor`/`filterMembersForActor` 過濾；前端頁面尚未接上這兩個過濾後的清單，
  待真實 fixture 後補 UI 層 E2E）

### M3 — Seat 上限與撤銷
- Org maxSeats=N，指派第 N+1 個 seat → 409 `SEAT_LIMIT_REACHED`
- 撤銷某學員 seat 後，該學員存取課程 → 403
- revoke 後 `Organization.usedSeats` 同步遞減
- seat 過期（expiresAt 已過）後存取 → 403

### M4 — Session 隔離
- A 學員 session 的 `orgId` 不等於 B → 任何 `scope:'tenant'` API 呼叫帶 B 的 orgId → 403
- B2C 學員（isB2B=false）呼叫 `scope:'tenant'` API → 放行（scope 對 B2C 不適用，仍受 roles 限制）

### M5 — GDPR DSAR 匿名化保留（階段 2-1 完成）
- 刪除 A 學員後，enrollments/submissions/attempts 中該 userId → `anonymized_<hash>`，PII 抹除
- 已發證書保留但 holderName='anonymized'
- profile / session / consent / S3 附件 / Qdrant 向量硬刪
- `jvtutorcorner-gdpr-audit-log` 寫入一筆 `DSAR_DELETE`

### M6 — 證書 URL-only 公開驗證（階段 1-3 完成）
- 公開 `GET /api/certificates/verify/[certificateId]` 無需登入可驗
- 撤銷後回 `revoked:true`
- 不存在的 id → 404

## 驗收層次映射

| 測試 | 強制點 | 涉及模組 |
|---|---|---|
| M1 課程不可見 | apiGuard scope + accessControl.verifyCourseAccess | lib/accessControl.ts、licenseService.hasActiveSeat |
| M2 dept_admin 範圍 | orgAccess.ts 的 requireOrgUnitAccess/requireMemberScopeAccess + pagePermissions + admin layout | lib/auth/orgAccess.ts、pagePermissions.ts、app/admin/layout.tsx |
| M3 seat 控管 | TransactWrite seat counter | lib/licenseService.ts |
| M4 session 隔離 | SessionPayload orgId + enforceScope | lib/auth/apiGuard.ts |
| M5 DSAR | dsarService | lib/privacy/dsarService.ts（待建） |
| M6 證書驗證 | 公開路由 | app/api/certificates/verify/[id]/route.ts（待建） |

## 執行方式

```bash
# 階段 2-2 完成後：
npm run test:local -- --grep "b2b-tenant-isolation"

# k6 效能壓測（每租戶獨立 session token）
k6 run .agents/skills/b2b-tenant-isolation/scripts/tenant_isolation_load.js
```

## 相關技能
- `b2c-verification` — 跨足 B2C 邊界的反向驗證（M4 的「B2C 學員不受 scope 限制」對應此處）
- `api-performance-testing` — 通用 k6 框架與 HMAC 認證
- `auto-login` — 本 skill **不**使用其 bypass；既有 B2C skill 仍可使用