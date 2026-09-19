# JV Tutor Corner — MVP 文件／簡報／缺口修正 完整交接（Session 2026-09-13 ～ 09-19）

> **給新的 Claude**：這份文件涵蓋整個 session，讀完即可直接接手。
> 語言：使用者以繁體中文溝通，回覆與文件一律 zh-TW；程式識別字維持英文。
> **必讀的姊妹文件**（本文不重複其內容）：
> - `docs/claude-session-handoff-2026-09-15.md`：本機驗證環境規則、禁跑清單、skill 系統、正式資料清理 SOP、使用者工作偏好。
> - `docs/classroom-concurrency-handoff-2026-09-15.md`：10 組並行壓測歷史數據、stripTabId／心跳／escrow 交易修正、上線後架構計畫。
> - 其他：`claude-session-handoff-b2b-data-structure-2026-09-15.md`（B2B 資料結構）、`-schema-remediation-`（資料庫索引）、`-abuse-prevention-`（限流／停權）、`-production-readiness-`（上線前安全清單）、`-livekit-rtc-`。

---

## 0. 開工前必讀（TL;DR）

1. **本 session 的產出**：`docs/MVP.md`（MVP 規格與驗收，569 行）、MVP 簡報 Artifact（17 張，https://claude.ai/artifact/SWwhjnCdwHL114SNaTEacN ）、以及 MVP.md 第 7 節列出的 R1–R14 缺口修正程式。
2. **所有程式碼修改都未 commit、未部署、未在真實環境跑過 e2e**。已通過的只有：`npx tsc --noEmit`（app + e2e 兩套設定）、`npm run lint:ci`（108 警告 / 上限 109）、7 支離線測試腳本（假 DynamoDB，不連 AWS）。
3. `.env.local` 是 `APP_ENV=production` 且指向**正式 AWS**。任何會寫入資料、寄信、耗用 Agora 分鐘的操作，都要先取得使用者當下同意。
4. **不要跑 `npm run test:stress`**：`e2e/scripts/run-stress-test.ps1` 會先 `Stop-Process` 所有 node／chrome，結束後直接執行 `e2e/cleanup-database-direct.mjs`（未帶 `--dry-run`，會刪資料）。正確指令見 `docs/MVP.md` 第 8.2 節。
5. **同一個工作目錄有其他 session 同時在改檔**（教室並發、資料庫索引等）。碰到不是自己改的異動，不要還原、不要順手 commit。
6. **使用者尚未回覆的三個問題**（本 session 最後提出）：commit 範圍、是否在正式環境實機驗證、企業 CSV 匯入是否改為登入後才能用。見第 9 節。

---

## 1. Session 時間軸與三個任務

| 階段 | 使用者要求 | 產出 |
|---|---|---|
| 09-13 | 「目前沒有 MVP 文件，先以專案有的功能來撰寫；驗收條件要達到老師學生 10 組；要有 B2C B2B 功能；其餘參考 skill」 | `docs/MVP.md` |
| 09-15 | 「把這個 session 的結論整理成知識庫文件」 | `docs/claude-session-handoff-mvp-2026-09-15.md`（已在檔頭標註過時，指向本文件） |
| 09-17 | 「製作 MVP 簡報」 | Slides Artifact（17 張） |
| 09-17 | 「把 MVP 要尚未修復的做修正」 | R1–R14 修正（本文件第 6 節） |
| 09-19 | 「整理成完整知識庫文件」 | 本文件 |

### 1.1 使用者已拍板的決策（不要重新詢問）

| 問題 | 決定 |
|---|---|
| 「10 組」定義 | **10 組同時上課 + 每組走完完整旅程**（註冊 → 購點 → 報名 → 等候室 → 上課 → 結束 → 點數撥給老師） |
| 10 組怎麼分 B2C / B2B | **10 組全為 B2C**；B2B 另外獨立驗收，不計入 |
| 驗收門檻 | **10 / 10 全過**，不採百分比 |
| MVP 文件位置與格式 | `docs/MVP.md`，繁中 Markdown，沿用 docs/ 風格 |
| 簡報格式 | Slides Artifact（未指定格式時的預設） |
| R1、R2（B2B 缺口） | **修程式**（不是寫成「企業由平台代管」） |
| R4（退款） | **人工退款 + 封住自助退款漏洞**，不實作金流退款 API |
| 本輪修正範圍 | P1 小修（R7、R8、R12）+ P2（R10、R11、R13）+ 文件簡報同步 + R3 擴充壓測 |

---

## 2. 專案與環境（最低限度，細節見姊妹文件）

| 項目 | 內容 |
|---|---|
| Repo | `D:\jvtutorcorner-rwd`（Windows 10，可用 Git Bash 與 PowerShell） |
| 技術棧 | Next.js App Router、TypeScript、DynamoDB、AWS Amplify SSR、S3、Agora RTC + Netless 白板（備援 LiveKit／Cloudflare SFU）、Playwright、Stripe／PayPal／LINE Pay／ECPay |
| 分支 | `integration/b2b-security-merge`，HEAD `34093a7`，領先 origin/main、未 push |
| 部署風險 | `main` 一 push 就會自動部署到 Amplify 正式環境 |

**本機跑 Playwright 的完整前綴**（缺一就可能打到正式站或被限流擋下）：

```bash
APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true \
QA_TEST_BASE_URL=http://localhost:3000 PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 \
npx playwright test <spec> --project=chromium
```

**獨立腳本**（會 import `lib/*.ts`，repo 沒裝 tsx）：

```bash
APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/<x>.mjs
```

**離線測試腳本**（假 DynamoDB、不連網、不要帶 `--env-file`）：

```bash
node --import ./scripts/lib/register-ts-resolve.mjs scripts/<verify-x>.mjs
```

需要常駐 dev server 時，用 `.claude/launch.json` 的 `next-dev-e2e`（透過 Browser pane 的 `preview_start`，不要用 Bash 起 server）。

---

## 3. 產出 1：`docs/MVP.md`

未 commit。結構（行號為 09-19 當下）：

| 節 | 內容 |
|---|---|
| 1 | 產品定位、MVP 成功定義 G1–G4、不在 MVP 範圍（AI 助理／Avatar／RAG、藥品辨識、工作流程引擎、點數兌換、企業學習路徑與證書、企業自動帳務、企業 SSO 白名單、DSAR） |
| 2 | 七種角色與識別方式 |
| 3 | B2C 功能範圍 3.1–3.11，每列：功能 / 頁面·API / 狀態（✅⚠️❌）/ 對應 skill |
| 4 | B2B 功能範圍（11 列） |
| 5 | mermaid 主流程圖（B2C、B2B）+ 狀態表（Order / Enrollment / Escrow / Organization / License） |
| 6.1 | **主驗收**：測試資料、每組 A–F 共 22 項、系統層級 S1–S6、現有測試對應表 |
| 6.2 | B2C 功能驗收（依 skill 逐項） |
| 6.3 | B2B 獨立驗收 + 腳本／e2e 對應表 |
| 7 | 風險 R1–R14 + 每項修正內容與狀態；7.1 本輪修正後的待辦 |
| 8 | 測試環境與執行方式（8.1 環境、8.2 10 組主驗收、8.3 B2B、8.4 驗收紀錄） |
| 9 | 相關文件索引、skill 對照狀態表 |

### 3.1 主驗收（§6.1）的量化條件（數值皆出自 skill）

- **A 帳號**：註冊 + Email 驗證（白名單）；老師開課 → 待審核 → 管理員核准上架。
- **B 購點與報名**：`initialPoints + (pkgPoints − appCost) = finalPoints`；`balanceBeforeEnroll − pointCost = finalBalance`（不得寫死）；Escrow `HOLDING` 且不計入學生餘額；Enrollment `ACTIVE`；提醒 `reminderMinutes=180`。
- **C 課程頁**：師生兩頁時間／標題一致；老師頁顯示學生姓名而非 ID、時長 `50 m`、剩餘堂數為數字；開課前 10 分鐘外按鈕顯示「(未開放)」。
- **D 等候室**：未登入導向 `/login?redirect=`；設備權限；一方就緒另一方 ≤5 秒看到；同角色重複進入顯示「房間已滿」。
- **E 教室**：自動加入頻道；白板同步；PDF `check=1` → `found:true`、首頁 index 0、翻頁同步 ≥3 頁；倒數初始 ≤ 預期 +1 秒、12 秒後遞減 6–25 秒、師生一致；≥10 分鐘不斷線。
- **F 結算**：老師結束課程 → `completed`；Escrow `RELEASED` + `releasedAt`；老師餘額 + escrowPoints。
- **S 系統**：10 間同時正常；點數守恆；跨組 403；無 5xx；k6 p95 基準；只清理本次資料。

---

## 4. 產出 2：MVP 簡報（Slides Artifact）

- URL：https://claude.ai/artifact/SWwhjnCdwHL114SNaTEacN （版本 3，2026-09-17 同步缺口修正）
- 17 張：封面 / 兩條業務線 / 目標 G1–G4 / 七種角色 / B2C 11 模組 / B2B 11 項 / 不在範圍 / B2C 主流程 / 「10 組全過」陳述頁 / 測試規格 / 每組 6 關 / 系統 6 項 / B2B 獨立驗收 / 目前進度 / P0（R1、R2、R3、R14）/ 其他風險 R4–R13 狀態 / 下一步
- 設計：Noto Sans TC + JetBrains Mono；深藍 `#15233B`、米白 `#F5F3EE`、teal `#1F7A70`、琥珀 `#E4A93A`；狀態色 綠 `#1E6B41` / 琥珀 `#87520C` / 紅 `#A12F2F`。
- 本機工作副本在 scratchpad（session 結束即失效）。**要再改簡報，先用 Artifact `read` 取回該張投影片，改完以同一 `url` publish**，不要憑記憶覆蓋。
- 沒有實際渲染檢查過版面，若使用者回報某張爆版，再針對該張調整。

---

## 5. 系統架構重點（撰寫與修正所依據）

### 5.1 B2C 主流程

註冊（`/api/register` + Email 驗證）→ 問卷（`/api/survey/seeds` → `lib/recommendationEngine.ts`）→ `/pricing` 購點（Stripe／PayPal／LINE Pay／ECPay，或 `NEXT_PUBLIC_PAYMENT_MOCK_MODE`；入帳 `lib/paymentSuccessHandler.ts`）→ 報名（`components/EnrollButton.tsx` → `POST /api/enroll` → `POST /api/orders`，`paymentMethod='points'` 時伺服器扣點並 `createEscrow` HOLDING）→ 提醒（`/api/cron/process-reminders`，開課前 180 分鐘）→ `/classroom/wait`（`/api/classroom/ready` + SSE `/api/classroom/stream`）→ `/classroom/room`（`app/classroom/ClientClassroom.tsx`）→ 老師結束課程 → **`POST /api/classroom/complete`**（本 session 新增）→ Escrow `RELEASED`。

- 取消 → `REFUNDED`（點數退回學生）；老師中途離開 → 維持 `HOLDING`，管理員以 `POST /api/points-escrow` 裁決。
- **時間格式陷阱**：`EnrollButton` 存的是沒有時區的牆上時間字串（`2026-09-17T18:00`，台北時間），其他路徑存 UTC ISO。伺服器在 Lambda 上是 UTC，直接 `Date.parse` 會差 8 小時。用 `parseOrderTime`（`lib/classroomCompletion.ts`）處理。

### 5.2 B2B 模型

Organization → OrgUnit（部門樹）→ License（席次）→ Profile（`isB2B`、`orgId`、`orgUnitId`、`licenseId`）。

- License 欄位：`id`、`orgId`、`userId?`、`courseId?`（空 = 全課程）、`status`、`expiresAt?`（epoch 秒）。每位成員最多 1 個有效 License。
- 組織身分**不在 session 裡**，每次請求由 `lib/auth/orgAccess.ts` 重新查 profile。企業管理員的 `role` 通常仍是 `student`。
- 加入組織時個人 `plan` 暫存於 `planBeforeOrg`，離開時還原；`dept_admin` 解除時還原 `previousRole`。
- 成員加入方式：網域自助註冊、CSV 匯入、管理員指派（沒有邀請信）。
- 企業帳務只有手動發票，逾期於讀取時計算、不自動停用。

### 5.3 權限層

- 頁面層：`app/admin/layout.tsx` → `lib/auth/pagePermissions.ts`（內建預設矩陣 + DB 覆寫）。
- API 層：`lib/auth/apiGuard.ts`（`withAuth` / `withAdmin` / `withAnyAuth` / HMAC）、`lib/auth/orgAccess.ts`（組織範圍）、`lib/auth/classroomAccess.ts` → `lib/accessControl.ts`（課程存取）。
- `x-e2e-secret` 繞過（非 production）會給 `role: system`，等同管理員。
- 金流 webhook 以 HMAC 內部呼叫 `PATCH /api/orders/[orderId]`，身分為 `system`。

---

## 6. 本輪修正（R1–R14）逐項

> 全部未 commit。每項都附「怎麼驗證」。

### R14（P0，本 session 新發現）Agora 路徑結束課程從不撥款

- **問題**：`/api/agora/session` 的 PATCH 會 `releaseEscrow`，但**前端從來不呼叫這支 API**（grep `app`、`components`、`lib` 只有型別定義）。只有 LiveKit webhook (`lib/livekit/webhookHandler.ts`) 與管理員 `POST /api/points-escrow` 會撥款。預設 provider 是 Agora → 上完課點數永遠停在 `HOLDING`，驗收項 F2／F3 不可能通過。
- **修正**：
  - 新增 `lib/classroomCompletion.ts`：純函式 `decideCompletion()`（release / noop / reject）+ `parseOrderTime()`（無時區字串視為 +08:00）+ `COMPLETION_EARLY_WINDOW_MS = 10 分鐘`。
  - 新增 `app/api/classroom/complete/route.ts`：`withAuth` + `verifyClassroomAccess` 要求 `isHost`（課程老師或管理員）；未帶 `orderId` 時以 Scan 找出該課程當前時段唯一有效訂單；`getEscrowByOrder` → `releaseEscrow`；冪等（已 RELEASED 回 ok）；寫 audit log。
  - `app/classroom/ClientClassroom.tsx` 的 `endSession()` 在清理流程中加一支 `fetch('/api/classroom/complete', { keepalive: true })`（只有老師會送）。
- **驗證**：`scripts/verify-class-completion.mjs` 15 項全過（含時區、未開課、已退款、冪等）。
- **未做**：真實環境沒跑過；LiveKit 與此 API 同時結算時靠 `releaseEscrow` 的條件交易擋重複（該交易是另一個 session 09-16 加的）。

### R1（P0）B2B 席次學員看不到課程

- **問題**：沒有任何程式建立 `B2B_SEAT` 報名；`/student_courses` 讀 `/api/orders`；`lib/livekit/authorizeJoin.ts` 只看報名不看席次；`EnrollButton` 把 `plan === null`（B2B 成員）當成最低方案擋下。
- **修正**：
  - `lib/accessControl.ts`：新增並匯出 `findValidSeatLicense(userId, courseId)`（active、課程相符或全組織、未過期、`license.orgId === profile.orgId`、組織 active／trial）；`findPurchasedEnrollment` 略過 `B2B_SEAT` 列 → **席次報名列本身不給存取權**（撤銷席次即失去存取）。
  - 新增 `app/api/enroll/seat/route.ts`：`GET ?courseId=` 供按鈕判斷；`POST` 以 session 身分驗證席次、檢查時間與重疊，單一 `TransactWriteCommand` 寫入 enrollment（`B2B_SEAT`、ACTIVE、orgId、licenseId）與 order（`paymentMethod:'b2b_seat'`、amount 0、PAID、remainingSessions／Seconds）；id 由 user+course+start 導出 → 重複送出回 409。
  - `components/EnrollButton.tsx`：有席次時跳過方案檢查、隱藏付款方式，顯示「使用企業席次報名」。
  - `lib/livekit/authorizeJoin.ts`：無購買報名時改查席次。
  - `scripts/repair-b2b-data.mjs`：只改寫沒有 `licenseId` 的 `B2B_SEAT` 列（否則會毀掉正當的席次報名）。
- **驗證**：`scripts/verify-seat-enrollment.mjs` 35 項全過。
- **未做**：席次報名不會建立開課前 3 小時提醒；兩個不同但重疊的時段同時送出仍可能都成功；`lambda/livekit-token` 打包後需要 licenses／organizations 表的讀取權限。

### R2（P0）企業管理員沒有可用後台

- **問題**：`app/admin/layout.tsx` 只放行 `admin`／`dept_admin`／`system`，企業管理員 role 是 `student` → 被導去 `/dashboard?forbidden=1`；`dept_admin` 預設可見的 `/admin/learners`、`/admin/learning-paths/assign` 頁面根本不存在。
- **修正**：
  - 新增 `app/admin/organizations/orgViewerScope.ts`：`extractOrgIdFromAdminPath()` + `resolveOrgViewerScope()` → `'system' | 'org_admin' | 'dept_admin' | null`（以 React `cache()` 每請求只查一次 profile）。
  - `app/admin/layout.tsx`：非 admin／system 進入 `/admin/organizations/<orgId>`（含子路徑）時改用上面的判斷，只放行本組織的企業管理員與部門管理員；其他路徑維持原本的角色 + page permission 檢查。`x-pathname` 由 middleware 覆寫，無法偽造（已查證）。
  - `app/admin/organizations/[id]/page.tsx` 改為 server component，把 `viewerScope` 傳給 `components/OrganizationDetailManager.tsx`（不再看 localStorage）；dept_admin 只顯示部門與成員分頁；企業管理員可切換部門管理員（API 本來就允許）。
  - `components/Header.tsx`：非 admin 使用者載入時查 `GET /api/organizations`，是企業／部門管理員就顯示「企業管理」連結。
- **殘留**：企業管理員在組織頁用前端連結切到其他 `/admin` 頁時 layout 不會重跑（資料仍受各 API 權限保護）。

### R3（P0）沒有 10 組 × 完整旅程的測試

- **問題**：`e2e/classroom/07_room_pdf_sync_stress.spec.ts` 以 `grantPointsViaAdmin(9999)` 取代購點，流程只到 PDF／畫線同步，不驗證結算，預設 `SUCCESS_THRESHOLD=0.75`。
- **修正**：
  - 新增 `e2e/helpers/full_journey.ts`：`loginViaApi`、`getPointsBalance`、`purchasePointsSimulated`（UI 模擬付款）、`enrollWithOwnPoints`（不補點，核對扣點）、`getEscrowForOrder`／`waitForEscrowStatus`、`endClassAsTeacher`（接受 confirm 對話框）。
  - 07 spec 加 `FULL_JOURNEY=1`：Phase 0b 購點（B1）→ Phase 3 以自有點數報名並確認 Escrow `HOLDING`（B2、B3）→ Phase 9 老師結束課程 → 等 `RELEASED`、核對老師餘額增量（F2、F3）→ 全體點數守恆斷言（S2）。結算失敗的組 `synced=false`，計入門檻。
  - 未帶 `FULL_JOURNEY` 時行為完全不變（其他 session 也在用這支 spec）。
- **注意**：`grantPointsViaAdmin` 是**設定**餘額為指定值（不是累加）。

### R4（P1）退款

- **問題（含本輪新發現）**：金流原路退款程式不存在；**學員可自行把訂單改成 `REFUNDED` 並自動退點**；`/admin/refunds` 是 `Math.random()` 模擬；任何老師可改任何訂單狀態；使用者建立訂單時可自行送 `status:'PAID'`。
- **修正**（使用者選「人工退款」）：
  - `app/api/orders/[orderId]/route.ts`：依角色白名單——管理員／system 可核准退款；訂單本人只能 `action:'request_refund'`（寫 `refundStatus:'REQUESTED'`，不動資產）、取消未付款訂單、同步 `remainingSeconds`；課程老師只能改 `remainingSeconds` 與 `action:'deduct'`（並檢查 `canManageCourse`）；其他欄位一律 400。24 小時限制與鎖定只算在使用者申請上。
  - 新增 `app/api/admin/refunds/{route,refundService,refundPolicy}.ts`：GET 列出申請、POST `approve`／`reject`／`gateway_ref`；核准時先把訂單標成 PROCESSING 再動資產（冪等）；點數課程走 `refundEscrow`，點數包餘額不足或方案訂單轉 `MANUAL_REVIEW`；非點數訂單寫 `gatewayRefund:{mode:'manual', status:'PENDING_MANUAL'|'DONE', reference}`；企業席次訂單（`paymentMethod:'b2b_seat'`）一律拒絕退款。
  - `app/admin/refunds/page.tsx` 改接真實 API；`app/refunds/` 改為學員送出申請與查看狀態（`RefundsClient.tsx`）。
  - `app/api/orders/route.ts`（POST）：非管理員時狀態由伺服器決定——`points` → `PAID`（因為扣點已成功），其餘 → `PENDING`。
  - skill：`payment-refund-gateway` 改 ⚠️ PARTIAL 並移除不存在的路由引用；`payment-refund-orchestration` 更新流程。
- **驗證**：`scripts/verify-refund-authz.mjs` 66 項全過；`e2e/order_refund.spec.ts` 已改寫（未跑）。
- **未做**：`plan-upgrades` 買的點數包／方案還沒接進退款流程；列出申請是全表 Scan。

### R7／R12（P1）企業 CSV 匯入與孤兒帳號

- **問題**：逐列呼叫 `/api/register`，同 IP 第 6 列起被 `registerPerIp`（5/小時）擋下；席次只在開頭檢查一次；中途失敗不回捲；註冊失敗時的補償刪除若再失敗會留孤兒 profile，且交易已提交但後續讀取失敗時會刪掉已佔席次的 profile。
- **修正**：
  - 新增 `app/api/register/batch/route.ts`：整批先驗證（≤200 列、必填、Email 格式、網域、批內重複、已註冊、席次足夠），任一項不過就 400 且不寫入；驗證碼只驗一次，整批算 `registerPerIp` 一次並新增 `registerBatchPerIp`（5/小時）。
  - `lib/orgMembershipService.ts` 新增 `createNewMembersWithLicenses()`：≤49 列單一交易；50–200 列分段並在後段失敗時補償刪除前段；逾時會回查實際寫入狀況。
  - 新增 `lib/registerProfile.ts`（單筆與批次共用的 profile 建構）、`lib/registerProfileCsv.ts`（可處理引號的 CSV 解析，無新套件）。
  - `app/api/register/route.ts`：**B2B 單筆註冊也改走同一交易**（批次大小 1），所以不再有「先建 profile 再加入組織」的空窗，R12 自然消失。
- **驗證**：`scripts/verify-register-batch.mjs` 47 項全過。
- **未決**：匯入頁是公開頁，驗證碼 5 分鐘內可重用 → 單一 IP 每小時最多 5 批 × 200 筆。是否改為企業管理員登入後才能匯入，待使用者決定。

### R8（P1）`/admin/users` 沒有入口

- `components/Header.tsx` 管理選單與 `app/dashboard/page.tsx` 新增「使用者管理」；`lib/adminRoutes.ts` 路徑改為實際資料夾並補 `users`（此檔目前沒有任何程式 import）。
- **未做**：停權／限流功能本身仍未驗證；正式環境的 `jvtutorcorner-rate-limits` 表尚未建立（見 abuse-prevention 交接）。

### R10（P2）頁面權限 DB 覆寫無效

- **問題**：`queryDbPermission` 查 GSI `RolePathIndex` 的頂層 `roleId`，但 `lib/pagePermissionsService.ts` 寫的是「一頁一筆 + `permissions[]` 陣列」，沒有頂層 `roleId` → 覆寫永遠不生效。
- **修正**：改成把路徑拆成前綴（最長 → 最短）用 `id` BatchGet PageConfig，第一筆含該角色的 item 決定；30 秒記憶體快取；表名 fallback 與寫入端一致。
- **重要安全決策**：**DB 設定只能收緊內建預設，不能放寬**。因為 `/api/admin/settings` 的「重新整理」會替每個角色、每個頁面寫入 `pageVisible: true`，若允許放寬，部門管理員／老師會因此進入 `/admin/settings`。`admin`／`system` 在查 DB 前就短路放行，不會被鎖在外面。
- **驗證**：`scripts/verify-page-permissions.mjs` 全過（含「重新整理寫入的 true 不放行」案例）。

### R11（P2）SEO

- 新增 `lib/seo.ts`（`SITE_URL` 取 `NEXT_PUBLIC_BASE_URL`）；root metadata 加 `metadataBase`、title template `%s｜JV Tutor Corner`、OG／Twitter；`/courses`、`/teachers`、`/pricing`、`/about`、`/terms` 各自 title／description／canonical（後三者用新的 server `layout.tsx`）；課程與老師詳情頁 `generateMetadata`（與頁面共用 cached loader，新增 `app/courses/_data.ts`、`app/teachers/_data.ts`）；`app/sitemap.ts` 加入課程與老師頁並 `revalidate=3600`；`app/pricing/checkout/layout.tsx` 設 noindex。
- **未做**：M1.6 CDN 快取標頭（要改渲染策略，風險較高）；`e2e/b2c_verification.spec.ts:43` 的 `FALLBACK_TITLE` 仍是舊的 `'Tutor Platform'`，`homepage-verification` skill 也還寫舊標題。

### R13（P2）模組盤點文件過時

- `docs/b2b-b2c-module-matrix.md` 與 `docs/企業功能與一般學員老師功能整理.md` 已同步更新（企業帳務 PARTIAL、B2B-06/07/08、B2C-02 等；統計為 COVERED 15、PARTIAL 17）。引用的測試檔都確認存在。
- **未做**：`scripts/audit-enterprise-general-module-matrix.mjs` 內建狀態仍舊（文件已註明）。

### R5、R6、R9（未處理）

- R5 租戶隔離 skill 仍是 🔄 SCAFFOLD，要實跑 `e2e/b2b_cross_tenant_isolation.spec.ts`。
- R6 教室相關 skill 狀態要等 10 組實跑結果再更新。
- R9 企業自動帳務已正式排除於 MVP（`docs/MVP.md` §1.3）。

---

## 7. 本 session 新增／修改的檔案

**新增（未追蹤）**

```
lib/classroomCompletion.ts            app/api/classroom/complete/route.ts
app/api/enroll/seat/route.ts          app/admin/organizations/orgViewerScope.ts
app/api/admin/refunds/{route,refundService,refundPolicy}.ts
app/refunds/RefundsClient.tsx         app/api/register/batch/route.ts
lib/registerProfile.ts                lib/registerProfileCsv.ts
lib/seo.ts                            app/courses/_data.ts   app/teachers/_data.ts
app/{pricing,about,terms}/layout.tsx  app/pricing/checkout/layout.tsx
e2e/helpers/full_journey.ts
scripts/verify-{class-completion,seat-enrollment,refund-authz,register-batch,page-permissions}.mjs
docs/MVP.md                           docs/claude-session-handoff-mvp-2026-09-{15,19}.md
```

**修改（本 session）**

```
lib/{accessControl,auth/pagePermissions,adminRoutes,orgMembershipService,rateLimit,livekit/authorizeJoin}.ts
app/admin/{layout.tsx,organizations/[id]/page.tsx,refunds/page.tsx}
app/api/{orders/route.ts,orders/[orderId]/route.ts,register/route.ts}
app/{layout,courses/page,courses/[id]/page,teachers/page,teachers/[id]/page,robots,sitemap}.ts(x)
app/classroom/ClientClassroom.tsx（只加了結算呼叫）
app/login/register_enterprise/page.tsx  app/refunds/{page,layout}.tsx  app/dashboard/page.tsx
components/{Header,EnrollButton,OrganizationDetailManager,org/OrgMembersPanel}.tsx
e2e/classroom/07_room_pdf_sync_stress.spec.ts   e2e/order_refund.spec.ts
locales/{en,zh-TW,zh-CN}/common.json（新增 enroll_seat_*、admin_users_label、org_admin_console、CSV 匯入相關 14 鍵）
scripts/repair-b2b-data.mjs   cloudformation/dynamodb-b2b-tables.yml（註解）
.agents/skills/{b2b-enterprise-registration,b2c-verification,payment-refund-gateway,payment-refund-orchestration,roles-page-permissions}/SKILL.md
docs/{b2b-b2c-module-matrix,企業功能與一般學員老師功能整理}.md
```

**其他 session 的未 commit 異動**（不要還原、不要順手 commit）：`lib/{pointsEscrow,pointsStorage,courseSessionService,types/courseSession,livekit/config,providers/rtc/useCloudflareSfuProvider}.ts`、`app/api/classroom/ready/route.ts`、`components/AgoraWhiteboard/BoardImpl.tsx`、`e2e/helpers/{draw_plan,canvas_probe,draw_workload,whiteboard_helpers,streaming_monitor}.ts`、`e2e/scripts/*`、`scripts/{setup-db,verify-schema,lib/schema,lib/setup-steps,audit-course-sessions,verify-course-sessions-index,verify-draw-plan,verify-escrow-settlement,verify-strip-tabid}.mjs`、`package.json`。

**CRLF 陷阱**：平行代理曾把幾個檔轉成 CRLF，造成整檔 diff。commit 前務必檢查：

```bash
for f in $(git diff --name-only); do a=$(git diff --numstat -- "$f" | awk '{print $1+$2}'); b=$(git diff --ignore-cr-at-eol --numstat -- "$f" | awk '{print $1+$2}'); [ "$a" != "$b" ] && echo "EOL churn: $f $a vs $b"; done
```

（09-19 檢查：只剩 `lib/auth/pagePermissions.ts` 183 vs 181，HEAD 本身混用行尾，可忽略。）

---

## 8. 驗證狀態（誠實版）

| 檢查 | 結果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 錯誤（09-19 重跑） |
| `npx tsc --noEmit -p tsconfig.e2e.json` | 0 錯誤 |
| `npm run lint:ci` | 108 警告 / 上限 109（CI 阻擋閘門） |
| `scripts/verify-class-completion.mjs` | 15/15 |
| `scripts/verify-seat-enrollment.mjs` | 35/35 |
| `scripts/verify-refund-authz.mjs` | 66/66 |
| `scripts/verify-register-batch.mjs` | 47/47 |
| `scripts/verify-page-permissions.mjs` | 全過 |
| `scripts/verify-strip-tabid.mjs` / `verify-escrow-settlement.mjs`（他 session） | 15 / 23 |
| **Playwright e2e** | **完全沒跑** |
| **真實環境（dev server／正式 AWS）** | **完全沒跑** |
| 簡報版面 | 沒有實際渲染檢查 |

---

## 9. 待使用者決定（本 session 結束時仍未回覆）

1. **commit 範圍**：工作目錄同時有其他 session 的未 commit 修改，要一起 commit 還是分開？
2. **實機驗證**：是否在正式 DynamoDB 上跑？會寫入測試資料並耗用 Agora 分鐘數。建議先 `FULL_JOURNEY=1` 跑 1 組，再分散式 5+5 跑 10 組。
3. **企業 CSV 匯入**：是否改為企業管理員登入後才能使用（目前是公開頁）。

---

## 10. 建議的下一步（依序）

1. 取得 commit 決定後，把本輪修正整理成幾個主題 commit（席次／企業後台、退款與訂單權限、結束課程結算、企業批次註冊、頁面權限與 SEO、壓測與文件）。commit 前跑第 7 節的 CRLF 檢查與 `npm run typecheck`、`npm run lint:ci`。
2. 部署到測試環境（不要直接 push `main`，會自動部署正式站）。
3. 依 `docs/MVP.md` §8.2：先 `FULL_JOURNEY=1` 跑 1 組確認購點 → 報名 → 結算整條通，再跑 10 組（單機資源不足時用 `e2e/scripts/run-distributed-stress.ps1` 5+5）。
4. B2B 實機驗證：席次報名、企業管理後台（用 `scripts/seed-demo-org.mjs` 的 demo 帳號）、CSV 整批匯入、跨租戶隔離（R5）。
5. 依實跑結果更新 `.agents/skills/SKILLS_VERIFICATION_STATUS.md` 與 `docs/MVP.md` §7 狀態欄（「已修正」→「已驗證」），並同步簡報。
6. 收尾小項：`e2e/b2c_verification.spec.ts` 的 `FALLBACK_TITLE`、正式環境限流表、R11 CDN 快取策略。

---

## 11. 相關文件與記憶

- 產出：[`docs/MVP.md`](./MVP.md)、簡報 Artifact（第 4 節）。
- 本工作線舊交接：[`docs/claude-session-handoff-mvp-2026-09-15.md`](./claude-session-handoff-mvp-2026-09-15.md)（檔頭已標註過時）。
- 主要依據：`.agents/skills/SKILLS_VERIFICATION_STATUS.md`、`docs/b2b-b2c-module-matrix.md`、`docs/b2b-enterprise-seat-course-flow.md`、`docs/mvp-cost-analysis-agora-alternatives.md`（10 組 10 分鐘 ≈ 0.83 美元）、`architecture_overview.md`。
- Claude 記憶（`C:\Users\Attlie\.claude\projects\D--jvtutorcorner-rwd\memory\`）：`project_mvp_doc_b2b_gaps.md`（本工作線）、`project_classroom_concurrency_mvp.md`、`e2e-local-run-gotchas.md`、`project_b2b_data_fixes_deploy_order.md`、`project_abuse_prevention.md`、`project_livekit_migration.md`。
- 計畫檔：`C:\Users\Attlie\.claude\plans\mvp-10-b2c-cosmic-chipmunk.md`（MVP 文件計畫）、`3-5-redis-parsed-phoenix.md`（上線後架構，他 session）。
