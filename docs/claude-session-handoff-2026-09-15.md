# JV Tutor Corner — Claude Session 交接知識庫

> **給新的 Claude**：這份文件整理了一個很長的工作 session（2026-09-09 ～ 09-12，以下稱「前一個 session」）的所有結論、架構知識、程式修改與待辦事項。請完整讀完再動手。
> 文件產生日期：2026-09-15。第 1 節的 git 狀態是在寫文件當下重新查過的；其他內容記錄的是前一個 session 結束時的狀態。
> **語言**：使用者用繁體中文溝通，回覆與文件一律使用 zh-TW。

---

## 0. 新 session 開工前必讀（TL;DR）

1. **`.env.local` 指向正式環境 AWS**，而且設定是 `APP_ENV=production`。本機跑任何 e2e 或腳本，指令前面一定要加：
   `APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true`
   獨立腳本另外要用 `node --env-file=.env.local ...` 載入環境變數（詳見第 3 節）。
2. **不要 push、不要 commit**，除非使用者在當下明確要求。push 到公開 repo 前一定要再次確認。
3. **不要批次清理正式資料**。正式 DB 裡原本就有約 1,400 筆舊測試資料，只能刪除「本次執行產生、而且能用 id 列出來」的資料，並且先 dry-run（第 9 節）。
4. **另一個 session 可能同時在同一個工作目錄開發**。碰到自己沒改過的檔案異動，不要還原。
5. 前一個 session 的程式修改**已經全部 commit，並合併進 `integration/b2b-security-merge`**（第 1 節）。
6. 前一個 session 最後交給使用者、還沒處理的待辦見第 11 節。

---

## 1. 專案與 Repo 現況

| 項目 | 內容 |
|---|---|
| Repo 路徑 | `D:\jvtutorcorner-rwd`（Windows 10；工具可用 Git Bash 與 PowerShell） |
| 技術棧 | Next.js 16 App Router（`next dev --turbo`）、TypeScript、DynamoDB（on-demand）、AWS Amplify Gen1 SSR、S3、Agora RTC／Netless 白板、Playwright e2e、Stripe／PayPal／LINE Pay／ECPay |
| 目前分支 | `integration/b2b-security-merge`，**領先 `origin/main` 11 個 commit，尚未 push** |
| 主分支 | `main` |
| Git 使用者 | `GitHub Copilot`（使用者本人 email：tsaiming@urmine.ai） |

### 1.1 最近的 commit（新→舊）

```
4dffce8 ci: make typecheck and a lint zone blocking; unignore nothing CI ever saw
5e6120e merge: integrate fix/b2b-data-structure into main (security + B2B + RTC)
3bbcb61 test+docs: batch verification pass — new specs, skill docs, locales
25f411b feat(admin): add admin user management (suspend/ban) UI and API
7881bcb feat(classroom): add Cloudflare Realtime SFU as a 4th RTC provider
ab042cc refactor(storage): unify S3/R2 object storage behind lib/s3.ts
8b1c00d feat(security): add rate limiting and account status enforcement
3948934 security: continue API auth hardening; fix org-unit GSI null-key bug
05430d8 security: untrack sensitive backup/credential files
12c668d fix(b2b): repair B2B/B2C data structures, seat accounting and registration
bd85fe7 security: comprehensive API auth hardening + classroom/whiteboard guards
```

- 前一個 session 修的 `/api/points` 漏洞、PermissionGuard SSR、orgUnit null parentId，都在 **3948934** 裡。
- 4dffce8 新增了 CI 檢查：`npm run typecheck`，會同時檢查 `tsconfig.json` 與新的 `tsconfig.e2e.json`；以及 `npm run lint:ci`，對 `lib`、`types` 執行 `--max-warnings 109`，**不通過就擋下**。修改 e2e 或 lib 後要跑這兩個。
- 目前還有兩個**未追蹤**的檔案，是其他 session 在 09-13 之後產生的，不是前一個 session 的產物：
  - `docs/MVP.md`：MVP 規格與驗收文件，第 7 節列有 P0～P2 風險。
  - `scripts/create-dev-tables.mjs`：把正式表 schema 複製成 `jvtutorcorner-dev-*`，另有 `--dry-run` 模式。這是解決「本機寫進正式 DB」的方向。

---

## 2. 前一個 session 的工作時間軸

| 階段 | 使用者要求 | 產出 |
|---|---|---|
| A | 頁面權限稽核與修補、API 守衛補完 | commit bd85fe7。push 當時被擋下，需要使用者確認 |
| B | 整理架構圖 | `docs/system-architecture-diagram.md`、`docs/auth-architecture-diagram.md`（Markdown + Mermaid） |
| C | AWS／GCP／Cloudflare 成本與適配性比較 | `docs/cloud-platform-comparison-aws-gcp-cloudflare.md`（以 10／50／100 堂課·天，依定價表推估） |
| D | 混合架構規劃 + Phase 0／A 程式碼 | `docs/hybrid-architecture-plan.md`；移除寫死的 Agora 憑證；S3／R2 儲存抽象 |
| E | Phase B：Cloudflare Realtime SFU | `lib/realtime/*`、`app/api/realtime/*`、`useCloudflareSfuProvider`，預設關閉 |
| F | 檢查 skill 覆蓋並補齊 | 新增 16 個 skill、10 支 verification spec、`e2e/helpers/auth-helpers.ts`，修正 skill 工具 |
| G | 依優先順序分批執行 skill 驗證 | 第 0～5 批全部跑完，逐一更新 skill 狀態 |
| H | 修過時的 spec | 修了約 20 支 spec 或腳本、1 個 helper |
| I | 修 `/api/points` 漏洞 | 只有 admin／system 可以 POST |
| J | 修 PermissionGuard SSR | 所有頁面的 SSR HTML 恢復正常 |
| K | 修 orgUnitService 的 null parentId | B2B 建部門與搬移部門恢復正常 |

---

## 3. 本機驗證的環境規則（非常重要）

### 3.1 必要前綴

```bash
# Playwright（root playwright.config.ts 在 APP_ENV=local 時會自動 npm run dev，reuseExistingServer）
APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true \
QA_TEST_BASE_URL=http://localhost:3000 PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 \
npx playwright test e2e/<spec>.spec.ts --project=chromium --reporter=line,json
```

```bash
# 獨立腳本（腳本本身不會讀 .env.local）
APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/<x>.mjs
```

- `APP_ENV=local`：讓金流走 sandbox，spec 也會判斷為 Local mode。Next 與 dotenv 都不會覆寫已存在的環境變數，所以前綴會生效。
- `NEXT_PUBLIC_PAYMENT_MOCK_MODE=true`：`.env.local` 裡是 `false`。只要涉及付款的 spec 都要設。
- `DISABLE_RATE_LIMIT=true`：登入限流是每 IP 每 15 分鐘 30 次、註冊每小時 5 次。只在非 production 生效。
- `--import ./scripts/lib/register-ts-resolve.mjs`：`scripts/verify-b2b-*.mjs` 會 import `lib/*.ts`，而 repo 沒有安裝 tsx／ts-node。
- 需要常駐 dev server 時（例如 `verify-b2b-http-routes`、`verify-b2b-audit-log-viewer`、`verify-b2b-enterprise-registration`），使用 `.claude/launch.json` 的 **`next-dev-e2e`** 設定：port 3000，已帶好上面三個環境變數。透過 Browser pane 的 `preview_start` 啟動，**不要用 Bash 起 dev server**。
- `npm run build` 會被 `next.config` 擋下，因為 `SESSION_SECRET`／`API_HMAC_SECRET` 仍是已作廢的預設值。暫時的做法是在 process env 帶入隨機值再 build，不要改 `.env.local`。
- `npm run check:bundle-secrets` 要用 `node --env-file=.env.local scripts/check-bundle-secrets.mjs` 執行，否則會顯示「未設定因而未檢查」。

### 3.2 絕對不要跑

| 項目 | 原因 |
|---|---|
| `e2e/navbar_verification_production.spec.ts`、`points-escrow-production.spec.ts`、`classroom-delay-sync.spec.ts`、`quick-sync-test.spec.ts` | 寫死或預設打 `www.jvtutorcorner.com` |
| `stripe_payment_verification.spec.ts` 沒帶 `QA_TEST_BASE_URL=http://localhost:3000` | 預設打正式站 |
| `npm run test:production:*` | 對正式站壓測 |
| `e2e/cleanup-database-direct.mjs` | **預設直接刪除**，要加 `--dry-run` 才只預覽 |
| `scripts/cleanup-aggressive.mjs`、`cleanup-courses.mjs`、`cleanup_test_courses.js` | 無條件直接刪除 |
| 以 admin 或 bypass 身分 POST `/api/cron/daily-report/status`，或打 `/api/cron/process-reminders` | 會真的產生報表或掃描資料寄信 |
| 帶 `x-simulation` header 打 LINE webhook、帶 `?health=true` 打 make-sync | 會觸發真實外部流程 |
| 用真實 email 打 `/api/forgot-password` | 會重設密碼並寄信 |
| `npm run test:verify-skills` | `--grep verification` 不是安全過濾器，會選到寄信和 Stripe 的 spec |

### 3.3 已有／缺少的環境變數（只記名稱）

- **有**：`TEST_STUDENT_*`、`TEST_TEACHER_*`、`ADMIN_EMAIL/PASSWORD`、`QA_ADMIN_*`、`QA_TEACHER_*`、`QA_STUDENT_PASSWORD`（但**沒有** `QA_STUDENT_EMAIL`）、`LOGIN_BYPASS_SECRET`、`API_HMAC_SECRET`、`CRON_SECRET`、`STRIPE_*`（`sk_test_` 開頭）、`PAYPAL_CLIENT_ID`、`LINEPAY_CHANNEL_ID`、`ECPAY_MERCHANT_ID`、`AGORA_*`、`NETLESS_SDK_TOKEN`、`QDRANT_URL`、`GEMINI_API_KEY`、`AWS_*`、`SMTP_PASS`、`EMAIL_WHITELIST`、`SESSION_SECRET`。
- **缺**：`RESEND_API_KEY`、`SIGNALING_TOKEN_SECRET`、`LIVEKIT_*`、`CF_REALTIME_*`、`GOOGLE_CLIENT_ID`、`LINE_LOGIN_*`、`OPENAI_API_KEY`、`DYNAMODB_TABLE_AUDIT_LOGS`、`DISABLE_RATE_LIMIT`、`NEXT_PUBLIC_ENABLE_ONBOARDING_QUESTIONNAIRE`。
- 測試帳號：學生 `pro@test.com`，canonical id 為 `pro-demo`；老師 `lin@test.com`，canonical id 為 `teacher-demo2`；admin `admin@jvtutorcorner.com`。

---

## 4. 架構知識

### 4.1 伺服器端守門（`lib/auth/*`）

| 守衛 | 放行條件 | 失敗回應 |
|---|---|---|
| `withAuth(handler, { roles? })` | session cookie，且角色符合時 | 401／403 |
| `withAdmin` | 角色為 admin | 401／403 |
| `withAnyAuth(path, handler)` | session **或** HMAC 簽章（HMAC 會視為 `system` 身分） | 401 |
| `withAdminOrHmac` | admin／system session **或** HMAC | 401／403 |
| 手寫守衛：`/api/auth/me`、`integration/make-*`、`cron/*`、`line/webhook` | 各自實作，**不認 e2e bypass** | 各自不同 |

- **e2e bypass**：非 production 環境下，`x-e2e-secret: <LOGIN_BYPASS_SECRET>` 會在 apiGuard 家族**檢查角色之前**直接回傳 `system` session，等同 admin。
- **HMAC**：簽章訊息是 `METHOD\n<pathname+query>\n<timestamp ms>\n<body>`，用 sha256 產生 hex，放在 header `X-Api-Timestamp`／`X-Api-Signature`。timestamp 最多允許 5 分鐘前、30 秒後。伺服器之間的內部呼叫用 `lib/auth/internalFetch.ts`。
- **頁面守衛**：`lib/auth/pageGuard.ts` 提供 `requirePageSession`／`requireTeacherPage`／`requireAdminPage`，約 23 個 server `layout.tsx` 有使用。沒有 session 會導向 `/login?reason=<x>_no_session`，權限不足導向 `/dashboard?forbidden=1`。`app/admin/layout.tsx` 另外使用 `canAccessPage`。
  - **`next dev` 下的 redirect 會回 200**，重導向目標寫在 HTML／RSC payload 裡，production 則是 3xx。斷言時兩種都要接受，可用 `expectPageRedirect`。
- **資源層檢查**：`courseOwnership.ts`（老師只能改自己的課）、`classroomAccess.ts`、`orgAccess.ts`（B2B 部門範圍）、`lib/payments/payableOrder.ts`。
- **`components/auth/PermissionGuard.tsx`** 只做**畫面層**的可見度控制（角色來自 localStorage），不是安全邊界。修正後的行為見第 8.2 節。

### 4.2 身分識別（最常踩的坑）

- **canonical user id = `profile.roid_id || profile.id`**。`/api/login` 的 `session.userId` 就是這個值，`lib/teacherIdentity.ts` 與 `lib/identity.ts` 也遵循同一規則。
- 點數表（`lib/pointsStorage.ts`）、訂單、escrow、課程的 `teacherId` 都以 canonical id 作為 key。**用 email 當 userId 會讀寫到另一個點數桶**，而且會被「是否本人」的檢查擋成 403。
- 登入回應 `profile` 裡有 `roid_id`／`id`。前端 `tutor_mock_user`（localStorage）必須包含 `roid_id`／`id`，否則 checkout 會退回用 email，被 `/api/plan-upgrades` 回 403。
- `/api/register` 的 id 在伺服器端產生：`id = randomUUID()`，`roid_id = id`。成功回 **201**。

### 4.3 API 行為變更（bd85fe7 之後，舊 spec 常因此失敗）

| API | 現行規則 |
|---|---|
| `POST /api/points` | **只允許 admin／system**（包含 HMAC）。這是前一個 session 修的漏洞，見第 8.1 節 |
| `GET /api/points?userId=` | 本人或 admin／system |
| `POST /api/points-escrow`（release／refund） | `withAdmin` |
| `/api/ai-chat/dispatch` | `withAuth`，匿名請求回 401 |
| `/api/workflows/*`（gmail-send、resend-send、http-request 等） | `withAdminOrHmac` |
| `POST /api/admin/pricing` | admin |
| `/api/enroll` POST | 伺服器產生 id，**忽略 client 傳入的 id**，回應中的 `enrollment.id` 才是真正的 id |
| `/learning-content/*` | layout 需登入 |
| `setMemberDeptAdmin` | **只有學生**能升為 dept_admin，老師會回 400 |
| 註冊頁／企業註冊頁 | 已 i18n：姓名欄位標籤是「名」「姓」；身份下拉用 value `student`／`teacher`；驗證碼欄位沒有 `name` 屬性，用 placeholder「請輸入上方驗證碼」定位 |
| 註冊成功後 | 停在 Email 驗證卡片，**不會自動登入**；註冊後的問卷觸發已被移除（0a6826a、f504a31） |
| 首頁問卷抽屜 | 受 `NEXT_PUBLIC_ENABLE_ONBOARDING_QUESTIONNAIRE` 控制，預設關閉 |
| `/teacher-escrow` 狀態標籤 | HOLDING 顯示為「課程進行中」（原本是「等待釋放」） |
| `/courses_manage/new` | 送出後直接建立 `status:'待審核'`，畫面顯示「課程已提交審核」；已沒有「申請上架」這個步驟 |

### 4.4 物件儲存（`lib/s3.ts`，Phase A）

- 函式：`getStorageClient()`、`getStorageBucket()`、`isObjectStorageConfigured()`、`publicUrlForKey()`。
- 設定 `STORAGE_S3_ENDPOINT` 等 `STORAGE_*` 變數時改用 R2：path-style、region `auto`、`requestChecksumCalculation: 'WHEN_REQUIRED'`。沒設定時沿用 `AWS_S3_BUCKET_NAME`。
- 代理讀取 `/api/uploads/{avatar,carousel,whiteboard}/[...path]` 有路徑穿越防護：avatar 與 carousel 回 400，whiteboard 回 403。
- `next.config.ts` 的 `env` 區塊：Amplify Gen1 SSR 必須在這裡列出變數，執行期才讀得到。`scripts/check-bundle-secrets.mjs` 會檢查 `STORAGE_SECRET_ACCESS_KEY`、`CF_REALTIME_APP_SECRET`、`CF_TURN_KEY_API_TOKEN` 有沒有被打包進前端。

### 4.5 教室 RTC 供應商（Phase B）

- 以 `NEXT_PUBLIC_RTC_PROVIDER` 切換：`agora`（預設、正式使用）／`livekit`／`cloudflare-sfu`／`chime`，入口是 `lib/providers/rtc/useRTC.ts`。信令與白板也各自有 provider hook。
- Cloudflare Realtime SFU：
  - 相關程式：`lib/realtime/{config,sfuApi,validate,participants,registry,guard}.ts`、`app/api/realtime/{session,tracks,renegotiate,room}`、`lib/providers/rtc/useCloudflareSfuProvider.ts`。
  - `sfuSessions` map 存在課程 session（`lib/types/courseSession.ts`），client 每 15 秒送一次心跳，45 秒沒心跳視為逾時。
  - 靜音要用 `track.enabled=false`，不能 stop，否則 30 秒後會被 SFU 回收。每個 session 每秒最多 50 次呼叫。
  - 沒有設定時回 **503**。純函式測試：`node scripts/verify-realtime-sfu-guards.mjs`，19/19。
- Agora 的 token route 已移除寫死的憑證，沒設定時會丟出錯誤。

### 4.6 B2B

- 服務：`lib/organizationService.ts`、`orgUnitService.ts`、`licenseService.ts`、`orgMembershipService.ts`、`seatAccounting.ts`、`auth/orgAccess.ts`。
- 部門階層：`path = '/<rootId>/<childId>'`、`level`。**根部門不寫 `parentId`**（GSI `byParentId`），見第 8.3 節。
- `lib/accessControl.ts` 的 `verifyCourseAccess`：先檢查 B2C enrollment（PAID／ACTIVE），再檢查 B2B 席次。席次必須符合 **`license.orgId === profile.orgId`**，而且組織狀態是 active 或 trial。
- 部署順序請見記憶檔 `project_b2b_data_fixes_deploy_order.md`：先部署程式，再跑 `scripts/repair-b2b-data.mjs`（先 dry-run），然後才跑 `setup-db`。**不可以在部署前建 GSI**。

### 4.7 寄信

- 發送順序：先 Gmail SMTP，失敗再改用 Resend。`EMAIL_WHITELIST` 在非正式環境限制收件人。
- 連結的 base URL 由 `resolveEmailLinkBaseUrl` 決定：`NEXT_PUBLIC_BASE_URL` 是 loopback 時會改用 `https://www.jvtutorcorner.com`，可用 `EMAIL_LINK_BASE_URL` 覆寫。

---

## 5. Skill 系統

### 5.1 慣例

- 位置：`.agents/skills/<kebab>/SKILL.md`；目前 64 個目錄，其中一個是其他 session 新增的。
- Frontmatter：
  ```yaml
  ---
  name: <與資料夾同名>
  description: '<中文>。Use when: <英文觸發情境>.'
  argument-hint: '<使用時要提供什麼>'
  metadata:
    verified-status: '✅ VERIFIED'   # ⚠️ PARTIAL / 🔄 IN-PROGRESS / ❌ UNVERIFIED
    last-verified-date: 'YYYY-MM-DD'
    architecture-aligned: true      # 裸布林
    related-skills: [a, b]
  ---
  ```
  metadata 一律縮排 2 空格。內文用 zh-TW，H1 寫成 `# 中文 (English)`。常用段落：相關檔案（連結寫 `../../../path`）、測試指令、環境驗證 (Environment Validation)（只列變數名）、故障排除（含已知缺口）、相關技能。
- 不可出現任何祕密；CI 會 grep `ghp_|sk_live_|AKIA|jv_(secret|secure)_bypass_\d{4}`。
- Spec 命名：`e2e/<skill_底線>_verification.spec.ts`，describe 寫成 `'<中文> Verification (<skill-name>)'`。
- 工具：
  - `npm run skills:validate` 必須 0 warnings。
  - `node scripts/update-skill-status.js` 重新產生 `SKILL_VERIFICATION_SUMMARY.md`。它**只寫 summary，不回寫 SKILL.md**；前一個 session 已修正它的正則，改為 `[\w-]+`。
  - `SKILLS_VERIFICATION_STATUS.md` 是手動維護的總表，每個條目包含：狀態／驗證日期／最後更新／驗證項目／已知缺口／架構對齊。
- **換行慣例**：修改既有檔案要保留原本的 CRLF／LF，用 `git diff --numstat` 和 `--ignore-cr-at-eol` 的結果比對，兩者要一致。有幾個 CRLF 檔的 HEAD 裡本來就只有一行是 LF（例如 `points-escrow-quick-release.spec.ts` 第 41 行、`course_management_flow.spec.ts` 第 6 行、`points-escrow-edge-cases-simple.spec.ts` 第 17 行），整份檔案轉換後要把那一行還原。新建的檔案用 LF。

### 5.2 前一個 session 新增的 16 個 skill

server-auth-guards、object-storage-uploads、classroom-rtc-providers、cloud-hybrid-architecture、abuse-prevention、workflow-engine、scheduled-jobs、roles-page-permissions、app-integrations-line-make、subscriptions-plan-upgrades、admin-observability、knowledge-base-rag、auth-sso、db-ops-migrations、i18n-localization、skill-tooling。

### 5.3 狀態快照（2026-09-12）：36 ✅ / 17 ⚠️ / 1 🔄 / 9 ❌

- **⚠️ PARTIAL（17）與主因**：
  - classroom-rtc-providers：Cloudflare 或 LiveKit 已設定時的分支需要真實憑證才能驗。
  - classroom-room、classroom-room-whiteboard-sync：3 組並行時同步失敗；單一 session 則通過。
  - email-service-integration、email-notification-testing：Gmail 憑證無效，Resend 仍是測試網域。
  - navbar-verification：註冊後不再自動登入。
  - payment-flow-validation：模擬購點後 `/plans` 找不到「已付款」列，原因未確認。
  - course-management-service：UI 建課時 server log 看不到 POST，原因未確認。
  - attendance-checkin-qr：缺 `jvtutorcorner-attendance` 表。
  - materials-pdf-preview：教材資訊外洩，而且 `MaterialsPreviewSection` 從未被接上。
  - b2c-verification：M1 的 SEO 缺陷。
  - env-check：build 被作廢的 secrets 擋下。
  - db-ops-migrations：正式環境缺 GSI。
  - i18n-localization、cloud-hybrid-architecture、payment-refund-orchestration：金流原路退款不存在。
  - payment-simulation-linepay：本機未啟用 LINE Pay。
- **❌ UNVERIFIED（9）**：沒有可安全執行的測試，或需要外部服務，例如 abuse-prevention、knowledge-base-rag（Qdrant 未部署）、classroom-ready（唯一的 spec 寫死正式站）、api-performance-testing（k6 未安裝）、ai-chat、image-analysis 等。
- **🔄（1）**：b2b-tenant-isolation（SCAFFOLD，等 tenantId 階段 2）。

---

## 6. E2E 測試資產

### 6.1 共用 helper：`e2e/helpers/auth-helpers.ts`

提供以下工具：
- 常數：`BASE_URL`、`BYPASS_SECRET`、`TEST_STUDENT`／`TEST_TEACHER`、`IS_HMAC_CONFIGURED`。
- context 與 header：`systemHeaders()`、`guestContext()`、`studentContext()`／`teacherContext()`（真實登入，回傳 `{ request, profile }`，其中 `profile.userId` 是 canonical id）、`hmacHeaders()`／`hmacHeadersAt()`（在本地自行計算簽章）。
- 契約表：`ContractCase`（who 可為 `G`／`S`／`T`／`SYS`）搭配 `runContractCase`、`contractTitle`。
- 斷言：`expectPageRedirect`（3xx 或 dev 模式的 200 都接受）、`expectRedirectTo`、`expectPageAllowed`、`expectNoSessionCookie`、`skipUnlessEnv`。

**Playwright 地雷**：
- 模組層級不要用 `Date.now()` 組測試標題，主程序和 worker 算出來的值會不同。
- `data: '<非 JSON 字串>'` 搭配 JSON content-type 時，Playwright 會自動 JSON 化；要送原始內容請用 `Buffer`。

### 6.2 前一個 session 新增的 10 支 verification spec（全綠）

`server_auth_guards`（26，含 `/api/points` 回歸 3 個）、`object_storage_uploads`（28）、`classroom_rtc_providers`（24）、`workflow_engine`（43）、`scheduled_jobs`（5）、`roles_page_permissions`（15）、`app_integrations_line_make`（24）、`subscriptions_plan_upgrades`（19）、`admin_observability`（14）、`auth_sso`（13）。

### 6.3 修過的過時 spec 與腳本（全部已 commit）

| 檔案 | 原因 → 修法 |
|---|---|
| `enterprise_general_security_contract.spec.ts` | AI dispatch 改為匿名 401；catalog 與空查詢改用 system 身分 → 34/34 |
| `admin-teacher-escrow.spec.ts` | 狀態標籤「課程進行中」 → 4/4 |
| `pricing_fixes_verification.spec.ts` | Fix 9 改用 system header，並在 finally 還原設定 → 10/10 |
| `learning_content_analysis.spec.ts` | 先登入，另新增「匿名會被導向 /login」案例 → 10/10（1 skip，因為沒有問卷表） |
| `wait-page-redirect.spec.ts` | 不用 networkidle（頁面持續輪詢），timeout 改 90s → 1/1 |
| `order_refund.spec.ts` | canonical id、以 system 設定基準點數、使用 enroll 回傳的真實 id → 1/1 |
| `points-escrow-edge-cases-fixed.spec.ts`／`-quick-release`／`-simple` | canonical id（`idOf(email)`）、escrow release／refund 以 system 身分執行 → 6/6、1/1、7/7 |
| `recommendation_onboarding.spec.ts` | 更新文案；問卷抽屜依 flag 決定 skip；註冊後問卷標為 fixme → 11/11 |
| `e2e/helpers/homepage-helpers.ts` | `registerUserAndVerifyLogin` 原本是空殼（37d12fb 起），改成真正透過 API 註冊並登入，回傳 `{userId,email}` |
| `course_management_flow.spec.ts` | `setTimeout(180s)`、等待「課程已提交審核」、斷言有找到課程（**仍失敗**，見第 10 節） |
| `point_purchase_simulated.spec.ts` | mock user 補上 roid_id／id、等待時間拉長（**仍失敗**） |
| `student_full_verification_responsive.spec.ts` | 學生 canonical id、以 system 身分重置點數與刪除訂單（**仍逾時**） |
| `email_service_verification.spec.ts` | 加 system header → 4/7（其餘因 SMTP 憑證失敗） |
| `email_hybrid_schema.spec.ts` | 註冊改走 API → 7/8（429 案例因 `DISABLE_RATE_LIMIT` 而失敗） |
| `navbar_verification.spec.ts` | 選擇器改用 value 或 name → 註冊成功，但因「不自動登入」而 skip |
| `b2b_enterprise_registration_ui_flow.spec.ts` | 「名／姓」欄位定位 → 1/1 |
| `b2b_dept_admin_ui_flow.spec.ts`、`scripts/verify-b2b-http-routes.mjs`、`scripts/verify-b2b-dept-admin-scope.mjs` | 升級對象改為學生；清理時先刪 profile 再刪部門；新增「老師不可升級」反向案例 → 1/1、92/92、28/28 |
| `scripts/verify-b2c-b2b-course-access.mjs` | 席次持有者先建立帶 `orgId` 的 profile，並新增「非成員不授權」案例 → 18/18 |

---

## 7. 分批驗證結果摘要（2026-09-11～12）

| 批次 | 內容 | 結果 |
|---|---|---|
| 0 靜態 | skills:validate、覆蓋稽核、module matrix（unmapped 0）、SFU 19/19、`db:verify:template`、bundle secrets | 通過。`db:verify` live **缺 4 個 GSI** |
| 1 安全 contract | 10 支新 spec + enterprise contract + phase1 信令 | 全綠（phase1 有 1 skip，缺 `SIGNALING_TOKEN_SECRET`） |
| 2 唯讀頁面 | homepage、student／teacher courses、alignment、device permissions、preflight、escrow 後台 | 修正後全綠（homepage 27/27） |
| 3 寫入流程 | 報名、課程管理、教材、QR、escrow、退款、定價、推薦、b2c | 大多修正後轉綠；仍失敗的見第 10 節 |
| 4 教室 | canary 4/4、sync_quality 1/1、classroom_flow、points-escrow-classroom-flow 通過；04／07 三組並行 0/3；06 PDF 1/3；斷線重連逾時 | classroom 相關保持 PARTIAL |
| 5a 寄信 | 註冊寄信流程可跑，但 Gmail SMTP 回 535、Resend 只能寄給帳號本人 | 環境問題 |
| 5b B2B | 修正 orgUnit 後：seat 37/37、access-orgunits 34/34、course-access 18/18、dept-admin-scope 28/28、http-routes 92/92、enterprise-registration 24/24、audit-log-viewer 12/12、UI flow 全 1/1 | ✅ |
| 5c Stripe | `stripe_payment_verification` 6/6；`point_purchase_real` skip（沒有啟用真實閘道） | ✅ |

---

## 8. 前一個 session 修改的 App 程式碼（在 commit 3948934）

### 8.1 `/api/points` 漏洞（嚴重）

**原問題**：POST 對「本人」放行 add／deduct／set，任何已登入的學生都能把自己的點數設成任意值。
**修正**（`app/api/points/route.ts`）：

```ts
// 只有 admin／system（含 HMAC 簽章的內部呼叫）能直接改點數。
if (req.session.role !== 'admin' && req.session.role !== 'system') {
  return NextResponse.json({ ok: false, error: 'Forbidden: only admin or system may modify points' }, { status: 403 });
}
```

前端和 lib 都沒有 POST 這支 API：購點、報名扣點、escrow 都在伺服器端直接呼叫 `lib/pointsStorage`，所以正常流程不受影響。GET 維持「本人或 admin」。

### 8.2 PermissionGuard 讓所有頁面的 SSR HTML 變空

**原問題**：bd85fe7 在 `app/layout.tsx` 用 `<PermissionGuard>` 包住 `<main>`。這個元件在 `loading || checking` 時 `return null`，而伺服器端永遠處於 checking 狀態，結果所有頁面的 SSR 都只剩 header 和 footer，連帶 SEO、課程頁、票券 QR 都消失。
**修正**（`components/auth/PermissionGuard.tsx`）：判定完成前照常渲染 children，**確定拒絕**之後才換成 403 面板並導回首頁。

```ts
if (!loading && !checking && !authorized) { /* 403 panel */ }
return <>{children}</>;
```

**驗證**：`/`、`/courses`、課程詳情頁的 SSR 都有 `<main>`，也沒有 hydration 警告；homepage 27/27、b2c M3.2 由失敗轉通過。

### 8.3 orgUnitService：`parentId: null` 寫入 GSI `byParentId`

**原問題**：DynamoDB 拒絕 null 作為 GSI 鍵值，**導致正式環境無法建立根部門**。
**修正**（`lib/orgUnitService.ts`）：

```ts
// createOrgUnit：根部門省略欄位
...(input.parentId ? { parentId: input.parentId } : {}),

// moveOrgUnit：null 與 undefined 視為相同
if ((newParentId || null) === (unit.parentId || null)) { /* no-op */ }

// moveOrgUnit：搬到根層級時 REMOVE，不 SET null
UpdateExpression: item.isRoot
  ? newParentId
    ? 'SET #path = :newPath, #level = :newLevel, #parentId = :newParentId, #updatedAt = :now'
    : 'SET #path = :newPath, #level = :newLevel, #updatedAt = :now REMOVE #parentId'
  : 'SET #path = :newPath, #level = :newLevel, #updatedAt = :now',
// 且只有在 newParentId 存在時才提供 ':newParentId'（沒被引用的 value 會讓 DynamoDB 拒絕請求）
```

讀取端一律用 `!unit.parentId` 判斷根部門。`updateOrgUnit` 不會碰 parentId，PATCH 只放行 name、managerId、description、status。全專案 tsc 0 錯誤。

### 8.4 更早的階段（已 commit）

- Agora token 移除寫死的憑證。
- S3／R2 抽象，`check-bundle-secrets` 名單擴充。
- Cloudflare SFU（Phase B）。
- `scripts/update-skill-status.js` 正則修正。
- `.claude/launch.json` 新增 `next-dev-e2e`。

---

## 9. 正式資料清理流程（標準作業）

前一個 session 共刪除約 150 筆**本次測試產生**的資料：課程、訂單、報名、profiles、teachers、組織、部門、授權。每批都依照以下流程：先記錄開始時間 → 執行 → 以時間掃描 → dry-run → `--execute` → 再跑一次 dry-run，確認已全部刪除。

> 當時用的兩支腳本放在 session 暫存目錄，**新 session 看不到**。需要時照下面的內容重建，建議放在 scratchpad，不要放進 repo。

**scan_new_items.mjs**（唯讀）：用 Scan 列出 `createdAt`（或 id 內 13 位數時間戳）≥ 指定時間的資料。

```js
// node --env-file=.env.local scan_new_items.mjs 2026-09-15T00:00:00Z
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const sinceMs = Date.parse(process.argv[2]);
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' }));
const tables = {
  courses: process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses',
  orders: process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders',
  enrollments: process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments',
  profiles: process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles',
  teachers: process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers',
  organizations: process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations',
  orgunits: process.env.DYNAMODB_TABLE_ORG_UNITS || 'jvtutorcorner-org-units',
  licenses: process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses',
};
const ms = (it) => { for (const k of ['createdAt','updatedAt']) { const v = it[k]; if (v == null) continue;
  const n = typeof v === 'number' ? (v < 1e12 ? v*1000 : v) : Date.parse(v); if (!Number.isNaN(n)) return n; }
  const m = String(it.id || it.orderId || '').match(/(\d{13})/); return m ? Number(m[1]) : NaN; };
for (const [name, TableName] of Object.entries(tables)) {
  const found = []; let ExclusiveStartKey;
  do { const r = await client.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    for (const it of r.Items || []) if (ms(it) >= sinceMs) found.push(it); ExclusiveStartKey = r.LastEvaluatedKey; } while (ExclusiveStartKey);
  console.log(`=== ${name}: ${found.length}`);
  for (const it of found) console.log(`  ${it.id || it.orderId} | ${it.title || it.email || it.name || ''} | ${it.createdAt || ''}`);
}
```

**delete_by_ids.mjs**：每行格式為 `<table> <keyName> <keyValue>`（例如 `orders orderId <id>`、`orgunits id <id>`），先 `GetCommand` 確認資料存在，再加上 `ConditionExpression: attribute_exists(<key>)` 刪除。不加 `--execute` 時只做 dry-run。table 別名與上方相同。**部門要先刪子部門，再刪父部門；profile 要比部門先刪。**

---

## 10. 未解決的測試失敗（原因未確認）

| 測試 | 現象 | 已知線索 |
|---|---|---|
| `point_purchase_simulated` | 模擬付款後導回 `/plans`，但「點數購買紀錄」15 秒內沒有「已付款」列 | `/plans` 讀的是 `/api/plan-upgrades?userId=<canonical>`；可能是紀錄沒有被標為 PAID |
| `course_management_flow` | UI 送出後看不到「課程已提交審核」，dev server log 裡也沒有 POST `/api/courses` | 可能是表單驗證擋下或 client 端錯誤，需要看截圖或 console |
| `student_full_verification_responsive` | 填完課程時間後就停住，240 秒逾時 | 可能是 EnrollButton 的時間衝突檢查或 setError 路徑 |
| `verify_remaining_time` | 老師課表找不到新課程的 row | `/teacher_courses` 的 row 來自 `/api/orders?courseId=`（`CourseIdIndex`）；沒有訂單的課程不會出現在 `.course-card` |
| classroom 04／07（3 組並行） | 0/3 同步；07 的 Netless room 停在 `phase: Init, writable:false` | 單一 session 通過；懷疑是本機負載或 Netless 並行限制 |
| classroom 06 PDF | `goToWaitRoomDirect` 30 秒內沒有進入 `/classroom/wait` | 未確認 |
| whiteboard `[standard]` 斷線重連 | 模擬離線後 300 秒逾時 | 未確認 |
| `b2c_verification` M2.1 | 有時會挑到剛建立、沒有點數費用的 `test-*` 課程，回 400 | 應排除 test 課程，或改用固定的 fixture |

---

## 11. 已知缺陷與待辦（依優先順序）

### 11.1 前一個 session 最後提給使用者、尚未處理的項目

1. **教材資訊外洩（app 缺陷，改動小）**：`/courses/[id]` 把整筆課程資料放進 RSC payload，其中 `materials[]` 含檔名、大小，以及完整 S3 key `course-materials/<courseId>/<ts>_<file>`。**未登入的訪客在頁面原始碼就看得到**。預覽 API 仍有報名檢查。修法：在 server component 端移除 `materials`（或只傳筆數）後，再交給 client。`app/courses/[id]/page.tsx` 從 bd85fe7 之後就沒有再改過，所以應該還沒修。
2. **`MaterialsPreviewSection` 從未被接上**：沒有任何地方 import 這個元件，skill 描述的三態教材區塊並不存在。
3. **正式環境缺表或缺 GSI（需要使用者決定，會動到基礎設施）**：
   - `jvtutorcorner-attendance` 表不存在，QR 報到因此回 500。
   - enrollments 缺 `byCourseId`／`byOrderId`／`byOrgId`，courses 缺 `byTeacherId`。dev log 一直出現 `seat occupancy lookup failed`，但錯誤被吞掉。**必須依第 4.6 節的部署順序處理**。
   - 問卷提交表、Email 驗證事件日誌表、Agora 日誌表也不存在。
4. **憑證與祕密（由使用者處理）**：
   - `SESSION_SECRET`／`API_HMAC_SECRET` 仍是已作廢的預設值，需要輪換。
   - Gmail SMTP 回 535，需要應用程式密碼。
   - Resend 帳號仍是測試網域。

### 11.2 盤點時發現、尚未修的安全缺口

1. LINE webhook 帶 `x-simulation: true` header 就能跳過簽章驗證；debug GET 未驗證身分，還會拿呼叫端提供的 token 去打 LINE API。
2. make-webhook 在**沒有設定 secret 時完全不驗簽章**，可以覆寫問卷的推薦老師；`make-sync?health=true` 匿名就能觸發外呼；make-config／make-sync 的 requireAdmin 對錯誤角色回 401，應為 403。
3. `/api/cron/process-reminders` 在非 production 不拒絕任何請求；`daily-report` 在沒設 `CRON_SECRET` 時完全開放；`daily-report/status` GET 匿名可取得整份報表。
4. `/api/agora/{connection-event,connection-log,quality-event}` 與 `/api/client-error` 匿名就能寫入 DynamoDB，沒有速率限制。
5. `/api/whiteboard/stream`：SSE 未驗證身分。
6. `/api/netless/room` 在沒設定時，先回 mock room 才做課程檢查。
7. `DELETE /api/auth/line-login/session` 只清 cookie，DB 裡的 session 仍然有效。
8. `/api/forgot-password` 對不存在的帳號回 404（可以列舉帳號），而且先重設密碼才寄信。
9. `lib/keyLogger.ts` 的 queryKeyLogs 把排序鍵 `sk` 放進 FilterExpression，錯誤被吞掉，回 200 和空陣列。
10. 兩種寄信方式都失敗時回 500，應為 503。`uploads/carousel` 找不到檔案時回 500，但 avatar 回 404，兩者不一致。`whiteboard/room` 會在欄位驗證之前就回 500。

### 11.3 MVP 文件（`docs/MVP.md`，其他 session 產生）列出的 P0

- R1：B2B 席次課程在學生端看不到，因為沒有建立 `B2B_SEAT` enrollment 的程式。
- R2：企業管理員沒有可用的後台。
- R3：沒有單一測試涵蓋「10 組 × 完整旅程」。

其餘 P1、P2 見該文件第 7 節。

### 11.4 SEO（b2c M1）

公開頁都共用 root 的 title「Tutor Platform」；課程詳情頁沒有 `generateMetadata`；`/courses` 列表不是 SSR；公開頁回 `Cache-Control: no-store`；`robots.txt`、`sitemap.xml` 回 404。

---

## 12. 相關文件與記憶

- 架構與規劃：`docs/system-architecture-diagram.md`、`docs/auth-architecture-diagram.md`、`docs/cloud-platform-comparison-aws-gcp-cloudflare.md`、`docs/hybrid-architecture-plan.md`、`docs/page-permissions-matrix.md`、`docs/api_registry.md`（用 `node scripts/inspect_apis.mjs` 重新產生）、`docs/abuse-prevention.md`、`docs/MVP.md`。
- Skill 總表：`.agents/skills/SKILLS_VERIFICATION_STATUS.md`、`SKILL_VERIFICATION_SUMMARY.md`。
- Claude 記憶目錄 `C:\Users\Attlie\.claude\projects\D--jvtutorcorner-rwd\memory\`：
  - `e2e-local-run-gotchas.md`：本機跑測試的必要前綴、禁跑清單、四類 API 行為變更。
  - `project_b2b_data_fixes_deploy_order.md`：B2B 部署順序、verify 腳本的正確跑法、orgUnit 修正紀錄。
  - `project_livekit_migration.md`：LiveKit 只是備援，保留 Agora。
  - `project_questionnaire_line_make.md`：問卷、LINE Login、Make.com。

---

## 13. 使用者的工作偏好（從互動中歸納）

- 使用者習慣下「順便把 X 也修一修」這類指令，期望一次修到好：找出根因、改程式、跑回歸驗證、清理正式資料、更新 skill 文件，最後回報結果。
- 有多個方向可選時，通常會用 AskUserQuestion 讓使用者選，而且會選 (Recommended) 選項。
- 會碰到**正式環境**的操作（寫入、寄信、金流、刪資料），要逐項確認後才執行。
- 回報要誠實：區分「spec 過時」「app 缺陷」「環境問題」「原因未確認」，skip 和失敗都要列出來。
- 發現範圍外的安全問題時，記錄在 skill 的「已知缺口」並回報，除非使用者要求，否則不順手修。
