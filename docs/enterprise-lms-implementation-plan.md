# 企業教學平台 補實作計畫（落地版）

> 對象：JV Tutor Corner 平台轉型為企業 LMS
> 範圍裁切：保留 Agora 直播、無 SCORM/xAPI、無子網域品牌、無 Zoom/Teams、主管併入 admin（`dept_admin`）、SSO 僅 Google、證書 PDF + URL-only 驗證、GDPR 採匿名化保留稽核記錄
> 產出日期：2026-08-01

---

## 一、技術現況總覽

| 面向 | 現況 |
|---|---|
| 框架 | Next.js 16 (App Router) + React 18 + TypeScript 5 + Tailwind 4 |
| 影音/白板 | Agora RTC/RTM + Netless + tldraw + PDF 同步 |
| 資料庫 | AWS DynamoDB（多表）+ Qdrant 向量庫 |
| 認證 | Cognito + 自製 Session（`lib/auth/sessionManager.ts` HMAC 簽名）+ LINE Login + Google OAuth callback（**stub**） |
| 部署 | AWS Amplify + CloudFormation + Lambda |
| 金流 | Stripe / LINE Pay / ECPay / PayPal |
| i18n | 自製（`locales/{en,zh-TW,zh-CN}/common.json`） |
| B2B 鷹架 | `lib/types/b2b.ts`、`organizationService.ts`、`orgUnitService.ts`、`dynamodb-b2b-tables.yml`（Organizations/Licenses/Roles/PagePermissions）已就位但**未貫通** |

### 既有 Swagger/Skill 治理
- `.agents/skills/` 38 個既有 skill（`SKILLS_VERIFICATION_STATUS.md` ✅/⚠️/❌/🔄）
- `api-registry-management` skill 維護 `docs/api_registry.md`
- `api-performance-testing` skill 跑 k6（Session + HMAC）
- `auto-login` skill 走 `LOGIN_BYPASS_SECRET`（B2C E2E 用）

---

## 二、需求裁決總表

| 清單項 | 裁決 |
|---|---|
| 1.1 RBAC | **M** — 新增 `dept_admin`（部門管理者，僅管學員） |
| 1.2 SSO | **M** — 僅 Google，完整 PKCE + token exchange + auto-join |
| 1.3 多租戶隔離 | **M** — Session tenantId 貫通 + seat 正式 |
| 1.4 註冊/批次匯入 | 已實作 |
| 2.1 課程建置 | 已實作 |
| 2.2 SCORM/xAPI | **暫不需要** |
| 2.3 學習路徑自動指派 | **M** — orgUnit + title + onboardingStage 規則 |
| 2.4 多媒體教材 | 已實作 |
| 3.1 題庫/測驗 | **M** |
| 3.2 作業繳交批改 | **M** |
| 3.3 直播 Zoom/Teams | **暫不需要**（保留 Agora） |
| 3.4 討論區 | **S** |
| 3.5 完課證書 | **M** — PDF + URL-only 驗證 |
| 3.6 遊戲化 | **S** — 排行榜 + 徽章 |
| 4.1 學習成效報表 | **M** — 取代 MOCK |
| 4.2 HR 系統整合 | **S** — Workday/BambooHR 連接器 |
| 4.3 多租戶效能 | 已實作 |
| 4.4 資料安全/GDPR | **M** — DSAR 匿名化保留 |
| 4.5 行動/PWA | **S** |
| 4.6 多語系 | 已實作 |
| 5.1 維運文件 | 已實作 |
| 5.2 客製化品牌 | **暫不需要** |
| 5.3 AI 出題/推薦 | **S** — 推薦已實作，AI 出題補 |

---

## 三、關鍵設計決策

### 3.1 `dept_admin` 權限（僅管學員）
- 允許：所屬 orgUnit 下學員的 profile 讀寫、指派學習路徑、本部門學員報表。
- 拒絕：講師指派/停用、課程設定、證書核發/撤銷。
- 觸發：**僅經 Google SSO 白名單授予**；`Organization.deptAdminWhitelist: {email, orgUnitId}[]` 由 `admin` 維護。
- `admin` 可事後手動覆寫/停用，但 SSO 登入時才首次建立身份。

### 3.2 證書驗證（URL-only）
- `verifyCode` 欄位取消；PK `certificateId`(UUID) 即驗證碼。
- 公開驗證路由：`GET /api/certificates/verify/[certificateId]` 回 `{valid, revoked, courseTitle, issuedAt, holderName?}`。
- PDF 模板含 QR 指向 `/certificates/verify/[uuid]`。

### 3.3 GDPR DSAR（匿名化保留）
- `deleteUserData(userId)`：
  1. 匿名化保留：enrollments / submissions / quiz attempts / certificates / daily-reports 中該 userId → `anonymized_<hash>`、PII 抹除、courseId/分數/時間戳保留。
  2. 硬刪：profile、session、consent、S3 附件、Qdrant 向量。
  3. 已發證書保留但 `holderName='anonymized'`。
  4. 寫 `jvtutorcorner-gdpr-audit-log` 一筆 `DSAR_DELETE`。
- 需 email OTP 二次確認。

### 3.4 學習路徑規則（暫不耦合 HR）
- `AssignmentRule.field` 開放字串；先行支援 `orgUnit`(path 前綴) / `title`(in/eq) / `onboardingStage`(enum)。
- 階段 3-4 HR 連接器完成後擴充 `jobFamily` 等欄位，向後相容。

### 3.5 DynamoDB 命名慣例
- 沿用 `jvtutorcorner-<entity>` 前綴。
- 單檔單表 `cloudformation/dynamodb-<entity>-table.yml`（同 sessions/calendar）。
- 高耦合表例外合併（如 `dynamodb-quizzes-tables.yml` 放 quizzes + quiz-attempts，仿 `dynamodb-b2b-tables.yml`）。

### 3.6 驗收環境（新建獨立驗證，不走 Bypass）
- 新 skill `.agents/skills/b2b-tenant-isolation/SKILL.md`。
- 真實 Google SSO fixture：2 organization（A/B） × 3 角色（admin/dept_admin/student）。
- 不用 `LOGIN_BYPASS_SECRET`；`apiGuard.ts` E2E bypass 分支保留供既有 B2C skill。
- k6 新增 `b2b-tenant-isolation` profile。

---

## 四、工作分解（WBS）

### 階段 0 — 地基貫通（8-11 工作日）

#### 0-1 Session 加入租戶欄位（3-4d）
**現況**：`lib/auth/sessionManager.ts:16-21` `SessionPayload` 僅 `userId/email/role/plan`。

**變更**：
- `SessionPayload` 新增 `orgId?:string|null`、`orgUnitId?:string|null`、`orgUnitPath?:string`、`isB2B:boolean`。
- `lib/auth/apiGuard.ts:35-88` `withAuth` 新增 `options.scope?: 'global'|'tenant'|'orgUnit'`，通過角色檢查後比對 `session.orgId` 與請求目標 orgId。
- `app/api/register/route.ts`、Google callback、企業 CSV 匯入：`createSession` 注入 orgId/orgUnitId。
- 全量稽核既有 `/api/*`：org 敏感路由加 `withAuth({scope:'tenant'})`，依 `api-registry-management` skill 盤點。
- `e2e/b2c_verification.spec.ts` M4 TODO 轉正式。

**驗收**：跨租戶請求 403。

#### 0-2 B2B seat 正式（2-3d）
**現況**：`lib/accessControl.ts:73-75` 將 B2B seat 註解為 Future；`dynamodb-b2b-tables.yml` 已建 Licenses 表（含 `UserIdIndex`）。

**變更**：
- `lib/accessControl.ts` 新增 `checkUserSeat(orgId,userId,courseId?)`，Query `LicensesTable.UserIdIndex` 確認 `status='active'` 未過期；接進 `verifyCourseAccess` 第 2 步。
- 新增 `lib/licenseService.ts`：`assignSeat`/`revokeSeat`/`countUsedSeats`，`Organization.usedSeats` counter 同步（transact write）。
- `app/api/admin/organizations/[id]/seats` CRUD。
- `app/admin/organizations/[id]` seat 管理面板。

**驗收**：seat 已滿拒絕新學員報名；revoke 後喪失存取。

#### 0-3 RBAC + `dept_admin`（3-4d）
**現況**：`rolesService.ts:123-127` 預設 admin/teacher/student；PagePermissions 表已建（`RolePathIndex`）未使用。

**變更**：
- `rolesService.ts` 預設加入 `dept_admin`（order 0.5）。
- `lib/types/b2b.ts` `ProfileB2B.role` 聯合加 `'dept_admin'`；`Organization` 新增 `deptAdminWhitelist:{email,orgUnitId}[]`、`orgAdminWhitelist?:string[]`。
- `lib/auth/apiGuard.ts` 支援 `dept_admin` 走 `scope:'orgUnit'`，僅 `orgUnitPath` 前綴相符下的 learner 類資源。
- 新增 `lib/auth/pagePermissions.ts`：`canAccessPage(role,path)` 查 `PagePermissionsTable.RolePathIndex`；middleware/layout 套用。
- 初始權限矩陣：
  - `dept_admin` allow: `/admin/learners*`、`/admin/analytics*`、`/admin/learning-paths/assign*`、`/admin/organizations/[id]/members*`（限本部門）
  - 其餘 admin/* deny
- `app/admin/roles` 頁擴充可設定 role → 可見 admin 子路徑。

**驗收**：`dept_admin` 僅見所屬部門學員/報表，不可跨部門、不可管講師。

---

### 階段 1 — LMS 核心評量鏈（23-29d，子項可平行）

#### 1-1 題庫 / 測驗系統（6-8d）
**新增**：
- `cloudformation/dynamodb-quizzes-tables.yml`（quizzes + quiz-attempts）
- `lib/types/quiz.ts`、`lib/quizService.ts`
- `app/api/quizzes`、`app/api/quizzes/[id]`、`app/api/quizzes/[id]/publish`、`app/api/quizzes/[id]/attempts`
- `app/api/question-bank`（跨課程共用題庫）
- `app/admin/quizzes`、`app/teacher_courses/[id]/quiz`、`app/student_courses/quiz/[quizId]`

**DynamoDB**：
- `jvtutorcorner-quizzes`：PK `quizId`；GSI `courseId-index`(HASH courseId, RANGE status)；attrs: title, courseId, teacherId, orgId, status(draft/published/archived), passingScore, timeLimitMin, shuffleQuestions, dueDate, createdAt, updatedAt.
- `jvtutorcorner-quiz-attempts`：PK `attemptId`；GSI `studentId-quizId-index`、`quizId-status-index`；attrs: score, totalQuestions, correctCount, startedAt, submittedAt, answers(map), graded, certificateEligible.

**核心 API 契約**：
- `POST /api/quizzes` → 201 `{quizId}`
- `POST /api/quizzes/[id]/attempts` body `{answers:{qId:choiceId}[]}` → 200 `{attemptId, score, passed, certificateEligible}`

**依附**：階段 0 完成（orgId 隔離）；1-3 證書依此 `certificateEligible`。

#### 1-2 作業繳交 / 批改（4-5d）
**新增**：
- `cloudformation/dynamodb-assignments-table.yml`、`dynamodb-submissions-table.yml`
- `lib/types/assignment.ts`、`lib/assignmentService.ts`
- `app/api/assignments`、`app/api/assignments/[id]/submissions`、`app/api/assignments/[id]/submissions/[studentId]`
- `app/api/uploads/assignment`（重用 `lib/s3.ts`）
- `app/teacher_courses/[id]/assignments`、`app/student_courses/assignments/[id]`

**DynamoDB**：
- `jvtutorcorner-assignments`：PK `assignmentId`；GSI `courseId-index`(HASH courseId, RANGE dueDate)；attrs: title, description, courseId, maxScore, dueDate, attachmentsAllowed, orgId.
- `jvtutorcorner-submissions`：PK `submissionId`；GSI `assignmentId-studentId-index`；attrs: submittedAt, fileKeys(list<S3>), textContent, status(submitted/graded/returned), score, feedback, gradedBy, gradedAt.

**依附**：1-3 證書依 `graded` + 達標觸發。

#### 1-3 完課證書（PDF + URL-only）（4-5d）
**新增**：
- `cloudformation/dynamodb-certificates-table.yml`
- `lib/types/certificate.ts`、`lib/certificateService.ts`、`lib/email/certificateEmail.ts`
- `app/api/certificates`、`app/api/certificates/[id]/pdf`、`app/api/certificates/verify/[certificateId]`
- `app/dashboard/certificates`（學員）、`app/admin/certificates`（管理員檢視/撤銷）

**DynamoDB**：
- `jvtutorcorner-certificates`：PK `certificateId`；GSI `userId-index`、`courseId-index`；attrs: userId, courseId, orgId, certificateNumber(seq), issuedAt, issuedReason(course_complete|quiz_passed|assignment_passed), templateId, status(valid/revoked), revokedAt. **無 verifyCode GSI**（PK 即驗證碼）。

**觸發規則**（`issueCertificate`）：
1. 課程所有 session 完課 → 完課證書
2. `QuizAttempt.certificateEligible=true` → 測驗合格證書
3. `Submission` 全部 graded 且總分達標 → 作業證書

**PDF**：`react-pdf` server-side；QR 指向 `/certificates/verify/[uuid]`；holderName 可選遮罩。

**依附**：1-1、1-2 的 `certificateEligible`/`graded` 欄位就位後觸發。

#### 1-4 學習路徑自動指派（5-6d）
**新增**：
- `cloudformation/dynamodb-learning-paths-table.yml`（paths + assignments）
- `lib/types/learningPath.ts`、`lib/learningPathService.ts`、`lib/learningPathTriggers.ts`
- `app/api/learning-paths`、`app/api/learning-paths/[id]/assign`、`app/api/learning-paths/[id]/progress`
- `app/admin/learning-paths`、`app/dashboard/learning-paths`

**DynamoDB**：
- `jvtutorcorner-learning-paths`：PK `pathId`；GSI `orgId-index`；attrs: name, courseIds(list), rules(list<{field,op,value}>), autoAssign(bool), createdAt.
- `jvtutorcorner-path-assignments`：PK `assignmentId`；GSI `userId-index`(HASH userId, RANGE status)；GSI `pathId-index`；attrs: userId, pathId, status, progress(map courseId→status), assignedAt, completedAt.

**規則引擎**：rule = `{field:'orgUnit'|'title'|'onboardingStage', op:'eq'|'in', value}`；user 建立/profile 變更時比對 → 指派。`field` 開放字串，階段 3-4 HR 完成後擴充 `jobFamily`。

**依附**：0-1 orgUnit 就位。

#### 1-5 學習成效儀表板（取代 MOCK）（4-5d）
**現況**：`app/admin/analytics/page.tsx` L7-30 多為 `MOCK_*`；`dailyReportService.ts` 偏技術健康，非學習成效。

**變更**：
- `lib/analyticsService.ts`：聚合 enrollments / quiz attempts / submissions / certificates / learning-path progress，按 orgId/orgUnitId/dateRange 切片。
- `app/api/admin/analytics/overview`、`/courses`、`/learners`。
- `app/admin/analytics/page.tsx` SWR 取真實資料 + dateRange/orgUnit 篩選 UI；MOCK 保留為 fallback。
- `amplify/functions/dailyReportScheduler` 擴充學習成效 KPI 寫入 `daily-reports` 表。

**依附**：1-1/1-2/1-3/1-4 資料存在。

**階段 1 建議順序**：1-1 ‖ 1-2 → 1-3 → 1-4 ‖ 1-5

---

### 階段 2 — 合規與 SSO 收尾（8-11d）

#### 2-1 GDPR DSAR（匿名化保留）（4-5d）
**新增**：
- `cloudformation/dynamodb-consent-table.yml`、`dynamodb-gdpr-audit-table.yml`
- `lib/privacy/dsarService.ts`、`lib/consentService.ts`
- `app/api/privacy/export`、`app/api/privacy/delete`（後者需 email OTP 二次確認）
- `app/api/consent`、`app/settings/privacy`

**流程**：匿名化保留 enrollments/submissions/attempts/certificates/daily-reports（`anonymized_<hash>`），硬刪 profile/session/consent/S3 附件/Qdrant 向量，已發證書保留但 holderName 改 anonymized，寫 `jvtutorcorner-gdpr-audit-log`。

**依附**：真實 user 資料齊（階段 1 完）。

#### 2-2 Google SSO 完整（含 dept_admin 白名單）（3-4d）
**現況**：`app/api/auth/callback/google/route.ts` 全 stub，未做 token exchange、未建 user、未建 session。

**變更**：
- 新增 `app/api/auth/google/route.ts`（取代前端按鈕直接導向）→ 產生 PKCE `state`+`code_verifier` cookie，redirect Google authorize URL。
- 重寫 `app/api/auth/callback/google/route.ts`：
  1. `POST https://oauth2.googleapis.com/token` 換 `id_token`/`access_token`，PKCE 補 `code_verifier`。
  2. 驗證 `id_token` JWT 簽名（`jose` 或 `google-auth-library`）。
  3. email 查 `Profiles`；不存在則依 `Organization.domain` auto-join 建 B2B profile（`isB2B=true`），B2C 例外建 personal。
  4. 命中 `Organization.deptAdminWhitelist` → `role='dept_admin'` + 白名單帶的 `orgUnitId`；命中 `orgAdminWhitelist` → `isOrgAdmin=true`；其餘 `student`。
  5. `createSession` 注入 orgId/orgUnitId/orgUnitPath。
  6. set `session` cookie + redirect `/dashboard`。
- `lib/auth/oauth.ts`：Google client config、`GOOGLE_CLIENT_ID/SECRET` env、redirect URI。
- `app/login` Google 按鈕串新 endpoint。
- `scripts/check-bundle-secrets.mjs` 確認 client secret 不入 client bundle。
- `app/admin/organizations/[id]` 提供 whitelist UI。

**驗收**：完整 Google 登入回跳；B2C/B2B（依網域）皆可辨識；`dept_admin` 自動授予。

#### 2-3 租戶隔離驗收 skill（1-2d）
**新增**：
- `.agents/skills/b2b-tenant-isolation/SKILL.md`
- 真實 Google SSO fixture：organization A/B × admin/dept_admin/student（建於 `.env.local` 專用 Google test OAuth client）。
- 測試矩陣：跨租戶課程/學員/證書不可見、`dept_admin` 限本單位、seat 已滿拒絕、DSAR 匿名化驗證、證書 URL-only 公開驗證。
- k6 新增 `b2b-tenant-isolation` profile。
- 不走 `LOGIN_BYPASS_SECRET`（既有 B2C skill 仍用 apiGuard bypass 分支）。

---

### 階段 3 — 差異化強化（15-21d，依預算逐項取捨）

| 子項 | 新增模組 | 估時 |
|---|---|---|
| 3-1 討論區/課程留言板 | `lib/forumService.ts`、`app/api/forum/threads`、`app/courses/[id]/forum`、`dynamodb-forum-tables.yml` | 3-4d |
| 3-2 遊戲化（排行榜+徽章） | `lib/gamificationService.ts`、`lib/badgeService.ts`、`app/dashboard/leaderboard`、`dynamodb-badges-table.yml`、重用 `points-escrow` | 4-5d |
| 3-3 PWA | `public/manifest.json`、`public/sw.js`、離線快取策略；`lib/deviceDetection.ts` 已就位 | 2-3d |
| 3-4 HR 連接器 | `lib/integrations/{workday,bamboohr}.ts`、組織同步 webhook；回頭擴充 1-4 規則 field（`jobFamily` 等）向後相容 | 3-5d/連接器 |
| 3-5 AI 出題 | `app/api/quizzes/generate`、`lib/prompts/quizGenerator.ts`、接 `lib/smartRouterService.ts`；依賴 1-1 題庫就位 | 3-4d |

---

## 五、實作執行序列

1. **階段 0**（8-11d）：0-1 → 0-2 → 0-3 → 2-3 skill 雛形（先記 E2E 腳本，SSO 真實帳號隨 2-2 完成補齊）
2. **階段 1**（23-29d）：1-1 ‖ 1-2 → 1-3 → 1-4 ‖ 1-5（子項彼此獨立可平行）
3. **階段 2**（8-11d）：2-2 Google SSO（含白名單） → 2-1 DSAR（依賴真實 user 資料）→ 2-3 補真實 SSO fixture 跑 E2E
4. **階段 3**（15-21d，依預算）：3-3 PWA 與 3-2 遊戲化獨立先行；3-4 HR 可回頭擴充 1-4；3-5 AI 出題依賴 1-1

**合計（不含階段 3）**：39-51d。階段 3 全做再加 15-21d。

---

## 六、里程碑與交付節奏

| 里程碑 | 驗收內容 | 預期階段 |
|---|---|---|
| M0 地基 | 跨租戶不可存取、seat 控管、`dept_admin` 上線、PagePermission 矩陣生效 | 階段 0 完 |
| M1 企業 LMS | 題庫/作業/證書/學習路徑/真實報表通過 E2E | 階段 1 完 |
| M2 合規/SSO | Google SSO 正式（含 dept_admin 白名單自動授予）、DSAR 可執行、租戶隔離 skill 驗收 | 階段 2 完 |
| M3 差異化 | 依預算逐項交付 | 階段 3 |

**客戶溝通節奏**：M0 先示警地基（避免後續翻工）；M1 宣稱企業級 LMS 能力；M2 合規硬門檻（與法務/IT 同步）。

---

## 七、治理與驗證策略（沿用既有規範）

- 每項新功能建立對應 `.agents/skills/<feature>/SKILL.md`，沿用 `SKILLS_VERIFICATION_STATUS.md` 的 ✅/⚠️/❌ 機制。
- 每個新增 `/api/*` 路由依 `api-registry-management` skill 即時更新 `docs/api_registry.md`。
- 每階段完成以 `api-performance-testing`（k6）跑租戶隔離壓測；B2B 隔離以 `b2b-tenant-isolation` skill 跑 E2E。
- 證書/點數/退款流程沿用 `points-escrow`、`payment-refund-orchestration` 既有鏈路。
- 提交規範遵循 `workflow` skill。

---

## 八、風險與對策

| 風險 | 對策 |
|---|---|
| 既有 `/api/*` 全量加 scope 工時爆炸 | 0-1 採 `api-registry-management` 自動 introspection 產清單，優先 org 敫感路由，非敏感路由階段 2 補 |
| Google SSO client secret 洩漏 | `scripts/check-bundle-secrets.mjs` 加入檢查；secret 僅在 server route 使用，不入 `next.config` publicRuntimeConfig |
| DSAR 匿名化破壞外鍵參照 | 改採 `anonymized_<hash>` 保留 FK；證書 holderName 改 anonymized 而非刪 row |
| 學習路徑規則欄位未來 HR 接入翻工 | `AssignmentRule.field` 開放字串，HR 完成後新增 field，舊規則不需 migration |
| `dept_admin` 白名單與 SSO 時序競爭 | 白名單比對在 callback 而非 client；admin 可事後覆寫；fail-open 採 `student` fallback |
| DynamoDB 新表過多增加營運成本 | 全採 `PAY_PER_REQUEST`；quizzes+quiz-attempts 合併 CFN 減少 stack 數 |

---

## 九、待補項目（實作前最後確認）

1. 證書 react-pdf 模板設計稿（客戶提供 or 內設）
2. `Organization.deptAdminWhitelist` UI 互動細節（批次匯入 CSV or 單筆 add）
3. k6 `b2b-tenant-isolation` 的 SLO 門檻值（p95/p99）
4. GDPR DSAR 完成後是否自動 email 通知當事人（法規因地而異）