# Claude Session 交接：MVP 規格與驗收文件

> **給新的 Claude**：本文件只涵蓋「撰寫 `docs/MVP.md`」這個 session（2026-09-13 ～ 09-15）。
> 專案通用的環境規則、禁跑清單、先前的程式修改，請看另一份交接 [claude-session-handoff-2026-09-15.md](./claude-session-handoff-2026-09-15.md)（由另一個 session 產生，涵蓋 09-09 ～ 09-12）。**兩份都要讀。**
> 使用者以繁體中文溝通，回覆與文件一律使用 zh-TW。

---

> **⚠️ 2026-09-17 更新（以此為準）**：使用者決定 R1、R2 修程式，R4 採人工退款並封住自助退款漏洞，並要求一併修 R3、R7、R8、R10–R13 與 MVP.md 第 8 節。這些已實作（未 commit、未部署、未在真實環境跑），另發現並修正 **R14：Agora 路徑老師結束課程後點數從不撥款**。下方第 0、6、8 節的「待決策」「待修正」已過時；最新狀態見 [`docs/claude-session-handoff-mvp-2026-09-19.md`](./claude-session-handoff-mvp-2026-09-19.md)（整個 session 的完整交接）與 [`docs/MVP.md`](./MVP.md) 第 7、8 節。

## 0. TL;DR

1. 使用者要求：專案沒有 MVP 文件 → 依**現有功能**撰寫；驗收條件要達到**老師學生 10 組**；要有 **B2C、B2B** 功能；其餘參考 skill。
2. 產出物：[`docs/MVP.md`](./MVP.md)（545 行，**未 commit**）。本 session 沒有修改任何程式碼。
3. 使用者已拍板的三個決策（第 1 節），不要重新詢問。
4. 文件交付時留給使用者一個**待決策**：R1、R2（B2B P0 缺口）要修程式，還是在 MVP 正式寫成「企業由平台代管」。**使用者尚未回覆。**
5. `docs/MVP.md` 第 8 節的執行指令有**已知錯誤需要修正**（第 6 節），尤其是會刪正式資料的清理步驟。修正前不要照著跑。
6. 工作目錄裡有其他 session 的異動（第 7 節），不是本 session 造成的，不要還原。

---

## 1. 使用者決策（已確認）

以 AskUserQuestion 詢問，使用者選擇如下：

| 問題 | 選擇 | 意義 |
|------|------|------|
| 「10 組」怎麼定義 | **10 組並行 + 完整流程** | 10 間教室同時開課（各 1 師 1 生），每組都走完 註冊 → 購點 → 報名 → 等候室 → 上課 → 結束 → 點數撥給老師 |
| 10 組怎麼分 B2C / B2B | **10 組全為 B2C，B2B 另外獨立驗收** | B2B 不計入 10 組 |
| 輸出位置 | **`docs/MVP.md`** | 繁中 Markdown，沿用 docs/ 風格 |

驗收門檻：文件訂為 **10/10 組全過**，不採百分比（現有壓測預設 75%）。

---

## 2. `docs/MVP.md` 結構與內容索引

| 節 | 行號（約） | 內容 |
|----|-----------|------|
| 表頭 | 1–8 | 日期 2026-09-13、分支 `integration/b2b-security-merge`、狀態標記 ✅⚠️❌ |
| 1 | 26–58 | 產品定位；成功定義 G1–G4；**不在 MVP 範圍**（AI 助理/Avatar/RAG、學習內容分析、藥品辨識、Cyberbiz、工作流程引擎/Make、`/redeem`、企業學習路徑/證書、企業自動帳務、企業 SSO 白名單、DSAR） |
| 2 | 62–74 | 角色表：訪客/學生/老師/管理員/企業管理員/部門管理員/企業學員 |
| 3 | 78–189 | B2C 功能範圍 3.1–3.11（帳號、首頁、瀏覽、金流、報名 Escrow、排程、教室、退款、老師端、學生端、管理後台），每列：功能 / 頁面·API / 狀態 / skill |
| 4 | 191–208 | B2B 功能範圍（10 列） |
| 5 | 210–260 | mermaid：5.1 B2C 主流程、5.2 B2B 主流程；5.3 狀態表（Order / Enrollment / Escrow / Organization / License） |
| 6.1 | 264–345 | **主驗收**：測試資料、每組 A–F 共 22 項、系統層級 S1–S6、現有測試對應表、缺口說明 |
| 6.2 | 347–391 | B2C 功能驗收（依 skill 逐項） |
| 6.3 | 393–431 | B2B 獨立驗收 + 腳本/E2E 對應表 |
| 7 | 433–451 | 風險 R1–R13（P0/P1/P2） |
| 8 | 455–504 | 環境注意、10 組執行步驟、B2B 執行步驟、驗收紀錄（**有錯，見第 6 節**） |
| 9 | 506–545 | 相關文件索引、skill 對照狀態表 |

### 2.1 狀態標記的判定規則

- 以 `.agents/skills/SKILLS_VERIFICATION_STATUS.md`（2026-09-11 批次驗證）的 skill 狀態為主。
- 程式碼查證與 skill 狀態矛盾時，以程式碼為準並標 ❌ 或 ⚠️，並在第 7 節說明（例：R4）。

### 2.2 6.1 主驗收的檢查點（摘要，數值皆出自 skill）

| 區 | 檢查點 | 來源 skill |
|----|--------|-----------|
| A 帳號 | A1 註冊 + Email 驗證（白名單）；A2 老師開課 → 待審核 → 管理員核准上架 | `auth-sso`、`course-management-service` |
| B 購點報名 | B1 `initialPoints + (pkgPoints − appCost) = finalPoints`；B2 `balanceBeforeEnroll − pointCost = finalBalance`（不寫死）；B3 Escrow `HOLDING`，不計入 `userPoints`；B4 Enrollment `ACTIVE`；B5 `reminderMinutes=180` | `payment-fee-deduction-logic`、`student-enrollment-flow`、`points-escrow`、`course-scheduling-reminders` |
| C 課程頁 | C1 師生頁時間/標題一致；C2 老師頁學生姓名非 ID、`50 m`、剩餘堂數為數字；C3 開課前 10 分鐘外按鈕「(未開放)」 | `course-alignment`、`teacher-courses-page`、`course-scheduling-reminders` |
| D 等候室 | D1 未登入導向 `/login?redirect=`；D2 設備權限；D3 就緒 ≤5 秒同步；D4 同角色已在房再進入顯示「房間已滿」 | `classroom-wait`、`classroom-wait-device-permissions` |
| E 教室 | E1 自動加入頻道；E2 白板同步；E3 PDF `check=1` → `found:true`、首頁 index 0、翻頁同步 ≥3 頁；E4 倒數初始 ≤ 預期+1s、12 秒後遞減 6–25s、師生一致；E5 ≥10 分鐘無斷線 | `classroom-room`、`classroom-room-whiteboard-sync` |
| F 結算 | F1 結束確認框 → `completed`；F2 `RELEASED` + `releasedAt`；F3 老師 +escrowPoints | `points-escrow` |
| S 系統 | S1 10 間同時正常；S2 點數守恆（學生扣點總和 = Escrow 總和 = 老師入帳總和）；S3 跨組 403；S4 無 5xx；S5 k6 p95 基準；S6 清理 | `api-performance-testing` 等 |

D4 原本寫「第三人進入」，已依 `classroom-wait` skill 改為「同角色已在房再進入」。

---

## 3. 本 session 查證過的程式碼事實

「已查證」= 本 session 親自 grep/讀檔確認；「agent 回報」= 由 Explore agent 摘要，未親自打開。

### 3.1 已查證

| 事實 | 證據 |
|------|------|
| 10 組壓測 spec 支援 `CONCURRENT_GROUPS=10`，預設門檻 `SUCCESS_THRESHOLD=0.75` | `e2e/classroom/07_room_pdf_sync_stress.spec.ts:56`、`:986` |
| 07 壓測以管理員補點（`grantPointsViaAdmin(..., 9999)`）取代購點，流程只到 PDF 同步，**不驗證結束課程與 Escrow 釋放** | 同檔 `:555-578`、`:490` 測試標題 |
| 壓測帳號 `group-N-teacher@test.com` / `group-N-student@test.com`，N 從 `GROUP_OFFSET`（預設 0）起算 → 10 組為 `group-0`～`group-9` | `e2e/test_data/whiteboard_test_data.ts:155-177` |
| `npm run test:stress` → `e2e/scripts/run-stress-test.ps1`，`-Groups` 預設 3；**開始前 `Stop-Process node/chrome`**；結束後**直接執行 `e2e/cleanup-database-direct.mjs`（未帶 `--dry-run`，預設會刪除）** | `run-stress-test.ps1:13,22-23,31`，`cleanup-database-direct.mjs:27` |
| `/api/enroll` 寫入 `sourceType: 'B2C'`；`B2B_SEAT` 只出現在型別與 `accessControl.ts:97` 的授權判斷 | `app/api/enroll/route.ts:120-143`、`lib/enrollmentService.ts:81`、`lib/accessControl.ts:9,97` |
| `/admin` 只允許 `admin` / `dept_admin` / `system` 角色 | `app/admin/layout.tsx:21` |
| dept_admin 預設可見 `/admin/learners`、`/admin/learning-paths/assign`，但兩個頁面目錄不存在 | `lib/auth/pagePermissions.ts:34,36`；`app/admin/` 無此目錄 |
| `/admin/users` 頁面存在，但 `lib/adminRoutes.ts` 沒有這個選單項目 | grep 無結果 |
| `lib/stripe.ts`、`lib/paypal.ts`、`lib/linepay.ts`、`lib/ecpay.ts` 內**沒有任何 refund 呼叫**；含 refund 字樣的只有 `app/api/admin/payments`、`app/api/orders/[orderId]`、`app/api/points-escrow`、`lib/pointsEscrow.ts`、`lib/courseSessionService.ts` | grep |
| `payment-refund-gateway` skill 標 ✅ VERIFIED，但其列出的 `app/api/orders/[orderId]/refund/route.ts` 不存在 | skill 檔 + `ls` |
| `lib/auth/pagePermissions.ts` 使用 GSI `RolePathIndex`（DB 覆寫失效是 agent 回報，見 3.2） | `pagePermissions.ts:6,28,149` |
| `npm run db:verify` = `node scripts/verify-schema.mjs` | `package.json:18` |
| skill 位置：`.agents/skills/<name>/SKILL.md`，共 63 個；總表 `.agents/skills/SKILLS_VERIFICATION_STATUS.md` | `ls` |
| 現有 MVP 相關文件只有 `docs/mvp-cost-analysis-agora-alternatives.md`（成本分析，10 組並行、50 分鐘/堂、門檻 75%） | 檔案開頭 |
| MVP.md 內引用的 e2e spec、`scripts/*.mjs`、相對連結、約 60 個程式路徑，全部確認存在 | 迴圈 `[ -e ]` 檢查 |

### 3.2 Agent 回報（寫入文件前未逐一打開）

- 頁面權限 DB 覆寫無效：`RolePathIndex` 查詢不會命中，永遠用內建預設（R10；出處 `cloudformation/dynamodb-b2b-tables.yml` 註解）。
- CSV 匯入先檢查一次席次後逐筆呼叫 `/api/register`，非原子性（R7）。
- 註冊失敗補償刪除 profile 若失敗會留孤兒（R12；出處 `docs/b2b-request-path-diagram.md`）。
- `docs/b2b-b2c-module-matrix.md` 仍稱企業帳務未實作、部分 COVERED 引用不存在的測試（R13）。
- 企業帳務只有手動發票（`lib/orgBillingService.ts` 檔頭），逾期讀取時計算、不自動停用（R9）。
- `org admin` 若 `role=student`（如 `scripts/seed-demo-org.mjs` 建立者）會被 `/admin` 導走——layout 角色限制已查證，seed 腳本角色未查證。
- SEO 缺口（R11）出自 `b2c-verification` skill。

---

## 4. 系統架構摘要（撰寫 MVP 所依據）

### 4.1 技術與資料

- Next.js App Router + AWS Amplify SSR + DynamoDB（表名 `DYNAMODB_TABLE_<X>`，fallback `jvtutorcorner-<x>`，見 `lib/dynamo.ts`）。
- RTC：`lib/providers/rtc/useRTC.ts` 依 `NEXT_PUBLIC_RTC_PROVIDER` 切換，預設 Agora；LiveKit、Cloudflare SFU 為備援（記憶 `project_livekit_migration`）。
- B2C 核心表：profiles、teachers、courses、course-sessions、enrollments、orders、plan-upgrades、user-points、points-escrow、pricing、questionnaires、calendar-reminders、attendance、whiteboard。
- B2B 表：organizations、org-units、licenses、org-invoices、audit-logs（schema 真相來源 `scripts/lib/schema.mjs`）。

### 4.2 B2C 主流程

註冊（`/api/register` + Email 驗證）→ 問卷（`/api/survey/seeds` → `lib/recommendationEngine.ts`）→ `/pricing` 購點（Stripe/PayPal/LINE Pay/ECPay 或 `NEXT_PUBLIC_PAYMENT_MOCK_MODE`；入帳由 `lib/paymentSuccessHandler.ts`）→ 報名（`POST /api/orders` `paymentMethod='points'`，`lib/pointsEscrow.ts` 建立 `HOLDING`）→ 提醒（`/api/cron/process-reminders`，180 分鐘前）→ `/classroom/wait`（`/api/classroom/ready` + SSE `/api/classroom/stream`）→ `/classroom/room` → 結束（`PATCH /api/agora/session` 或 LiveKit webhook）：`completed`→`RELEASED`、`interrupted`→維持 `HOLDING` 由管理員 `POST /api/points-escrow {action}` 裁決、取消→`REFUNDED`。

### 4.3 B2B 模型

Organization → OrgUnit（部門樹）→ License（席次）→ Profile（`isB2B`、`orgId`、`orgUnitId`、`licenseId`）。組織身分每次請求由 `lib/auth/orgAccess.ts` 從 DB 重載。成員加入：網域自助註冊 / CSV / 管理員指派（無邀請信）。每人最多 1 個有效 License；`maxSeats ≥ usedSeats`；移除成員撤銷 License；加入時個人 `plan` 暫存 `planBeforeOrg`。dept_admin 範圍＝所屬部門及子部門；僅學生可升 dept_admin，解除還原 `previousRole`。

---

## 5. 風險清單 R1–R13（MVP.md 第 7 節）

| # | 等級 | 摘要 |
|---|:----:|------|
| R1 | P0 | 席次課程學生端看不到（無程式建立 `B2B_SEAT` enrollment；`/student_courses` 讀訂單） |
| R2 | P0 | 企業管理員無可用後台（layout 角色限制 + dept_admin 預設頁不存在） |
| R3 | P0 | 無單一測試涵蓋 10 組 × 完整旅程；07 壓測門檻 75%、不含購點與 Escrow 釋放 |
| R4 | P1 | 金流原路退款程式不存在，skill 卻標 ✅ |
| R5 | P1 | `b2b-tenant-isolation` 為 🔄 SCAFFOLD |
| R6 | P1 | 教室相關 skill 多為 ⚠️、`classroom-ready` ❌ |
| R7 | P1 | CSV 匯入非原子性 |
| R8 | P1 | `abuse-prevention` ❌、`/admin/users` 無選單 |
| R9 | P2 | B2B 帳務僅手動發票 |
| R10 | P2 | 頁面權限 DB 覆寫無效 |
| R11 | P2 | SEO 缺口 |
| R12 | P2 | 註冊補償刪除失敗留孤兒 |
| R13 | P2 | module-matrix 文件過時 |

6.1 驗收建議做法（文件已寫）：**方案 1** 單組 spec 逐一跑 10 組帳號（A–C、F）+ 07 壓測 10 組並行（D–E、S1）；**方案 2（建議）** 擴充 07 壓測：Phase 0 改模擬付款購點，結尾加入老師結束課程與 `RELEASED` 斷言，並以 `SUCCESS_THRESHOLD=1` 執行。

---

## 6. `docs/MVP.md` 已知錯誤（尚未修正）

寫完後對照另一份交接文件發現，第 8 節與專案實際的安全執行規則不一致。**修正需要使用者同意後才改**（使用者目前只要求交接文件）。

| 位置 | 問題 | 應改為 |
|------|------|--------|
| 8.1 | 本機前綴漏了 `DISABLE_RATE_LIMIT=true`、`QA_TEST_BASE_URL=http://localhost:3000`、`PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000` | 完整前綴：`APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true QA_TEST_BASE_URL=http://localhost:3000 PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000` |
| 8.2 步驟 3 | `npm run test:stress -- -Groups 10` 會先殺掉所有 node/chrome，結束後**直接刪除**資料（`cleanup-database-direct.mjs` 無 `--dry-run`），而 `.env.local` 指向正式 AWS | 改用直接執行 spec 的那條指令（加完整前綴 + `SUCCESS_THRESHOLD=1`），並加註「不要用 `npm run test:stress`」 |
| 8.2 步驟 6 | 寫「自動執行 cleanup-database-direct.mjs；手動時需自行呼叫」 | 改為：先 `node e2e/cleanup-database-direct.mjs --dry-run` 預覽，只刪本次產生、可用 id 列出的資料，經使用者確認後才刪（依另一份交接第 9 節流程） |
| 8.2 步驟 2 | `npx cross-env ... playwright test`，前綴不完整 | 同 8.1 |
| 8.3 | `node --env-file=.env.local scripts/verify-b2b-*.mjs` 漏了 TS 解析 hook；部分腳本需要常駐 dev server | `APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-*.mjs`；需 dev server 者（`verify-b2b-http-routes`、`-audit-log-viewer`、`-enterprise-registration`）以 Browser pane `preview_start` 啟動 `.claude/launch.json` 的 `next-dev-e2e` |
| 8.3 | `node ... scripts/seed-demo-org.mjs` 會寫入正式 DB | 加註需使用者確認 |
| 8.2 步驟 1 | （已查證無誤）`scripts/verify-schema.mjs:45` 自行以 dotenv 讀 `.env.local`，唯讀檢查 | 不需修改 |

另外，mermaid 節點中以 `/` 開頭的標籤已加上雙引號（避免被解析成梯形語法），但**沒有實際渲染預覽**。

---

## 7. 工作目錄狀態（2026-09-15 查詢）

```
 M .agents/skills/SKILL_VERIFICATION_SUMMARY.md       ← 非本 session 修改（1 行）
?? docs/MVP.md                                        ← 本 session 產出
?? docs/claude-session-handoff-2026-09-15.md          ← 另一個 session 產出（09-15 09:56）
?? docs/claude-session-handoff-mvp-2026-09-15.md      ← 本文件
?? scripts/create-dev-tables.mjs                      ← session 開始前就存在
```

- 分支 `integration/b2b-security-merge`，HEAD `4dffce8`。
- `docs/MVP.md` 在 09-13 產出後被標示「磁碟上有變動」，比對內容與本 session 最後版本一致（545 行、D4 修正、mermaid 引號皆在）。
- 另一份交接文件第 11.3 節已引用本 MVP 的 R1–R3。
- 本 session **未 commit、未 push**。使用者未要求 commit。

---

## 8. 下一步（依優先順序）

1. **等使用者回覆 R1/R2 決策**：修程式，或在 MVP 寫明「企業由平台代管」。若選後者：更新 1.3 排除表、第 2 節企業管理員列、6.3 最後一項（席次學員課程存取）改為由管理員代為報名或移出驗收、R1/R2 降級。
2. 取得同意後修正第 6 節列出的 MVP.md 第 8 節錯誤（安全性問題，建議主動提出）。
3. R3：若使用者要自動化主驗收，擴充 `e2e/classroom/07_room_pdf_sync_stress.spec.ts`：
   - Phase 0：`grantPointsViaAdmin` 改為模擬付款購點並斷言 B1。
   - 報名後斷言 B2–B5（Escrow `HOLDING`、reminder 180）。
   - 結尾：老師結束課程 → 斷言 `RELEASED`、老師餘額增量、S2 點數守恆。
   - 保留 `SUCCESS_THRESHOLD` 環境變數，驗收時設 1。
   - 動手前先讀該 spec 全檔（約 1,030 行）與 `e2e/points-escrow-classroom-flow.spec.ts` 的結束課程寫法。
4. R4：修正 `payment-refund-gateway` skill 狀態（✅ → ❌/⚠️）或實作退款；需使用者決定。
5. 若要驗證 mermaid：用 Browser pane 開 GitHub/VS Code 預覽，或貼到 mermaid live editor 以外的本地工具（不要把內容送到外部服務，除非使用者同意）。

---

## 9. 參考

- 產出：[`docs/MVP.md`](./MVP.md)
- 通用交接：[`docs/claude-session-handoff-2026-09-15.md`](./claude-session-handoff-2026-09-15.md)（環境前綴第 3 節、禁跑清單 3.2、資料清理第 9 節、使用者偏好第 13 節）
- 主要依據：`.agents/skills/SKILLS_VERIFICATION_STATUS.md`、`docs/b2b-b2c-module-matrix.md`、`docs/b2b-enterprise-seat-course-flow.md`、`docs/mvp-cost-analysis-agora-alternatives.md`、`architecture_overview.md`
- 計畫檔：`C:\Users\Attlie\.claude\plans\mvp-10-b2c-cosmic-chipmunk.md`
- 記憶：`e2e-local-run-gotchas.md`、`project_b2b_data_fixes_deploy_order.md`、`project_livekit_migration.md`
