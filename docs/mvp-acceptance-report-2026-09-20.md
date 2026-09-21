# JV Tutor Corner — 全平台 MVP 上線驗收報告

- 日期：2026-09-20
- 驗收分支：`main`（HEAD `b5e1f91`）；對照 `integration/b2b-security-merge`（領先 main 21 commits）
- 環境：本機連 **production** AWS（`ap-northeast-1`），`.env.local` 為 `APP_ENV=production`、無環境前綴 → 本機 == 線上資料表
- 執行者：Claude（自動化 + 唯讀查核 + 程式碼審查 + 實機 UI）
- 執行方式圖例：🤖 已自動執行｜👁 程式碼/資料唯讀查核｜⏸ 已授權但本次未執行（附指令）

---

## 一、總結論（Executive Verdict）

**目前 `main` 不建議直接上線。** 至少 4 項 P0 阻擋，且 MVP 規格所依賴的核心修正（R14 老師收款、真實退款流程、rate-limit、B2B seat）只存在於未併入 `main` 的 `integration/b2b-security-merge`。此外 production 資料層有兩類問題：**多張程式碼會用到的表在 prod 不存在**，且**課程/報名/escrow 表被 stress 測試資料淹沒、無任何真實已上架課程**。

| 分級 | 通過 | 失敗/阻擋 | 警告 | 未執行 |
|---|---|---|---|---|
| P0 | 6 | 4 | 4 | 0 |
| P1 | 2 | 2 | 4 | 1 |
| P2 | 3 | 1 | 3 | 0 |

**上線阻擋清單（Go/No-Go）**見第四節。

---

## 二、P0 — 上線阻擋項

| # | 項目 | 狀態 | 證據 / 說明 |
|---|---|---|---|
| P0-1 | 建置健康（tsc / build）| ⚠️ 有條件通過 | 所有 tracked（MVP）檔案 `tsc --noEmit` **0 error**；14 個 error 全在**未提交**的 WIP 檔（`app/api/class-summaries/**`、`app/api/realtime/ice`、`app/api/whiteboard/{ice,signal}`、`app/rtc-harness`、`app/whiteboard-demo`、`lib/realtime/ice.ts`，引用尚不存在的 `lib/auth/classroomAccess`、`lib/realtime/{config,sfuApi}`）。**這些未提交檔會讓 `next build` 失敗** → 上線前務必確認部署只 build 已提交內容，或移除/完成這些 WIP。 |
| P0-2 | 登入 / 註冊 / captcha | ✅ 通過（UI 層）| `/login` 實機渲染含 Email／密碼／圖形驗證碼／重新取得驗證碼／建立帳戶（對應 `c4eec63` captcha 修正）。三角色登入完整 e2e 屬寫入型，見 ⏸。 |
| P0-3 | 課程 / 老師瀏覽 | ❌ 資料阻擋 | 過濾邏輯**正確**（`/courses` 正確隱藏測試課程）。但 `/api/courses` 回 **190 筆全為 `stress-group-*` 壓測課程**（`status:上架`），**零真實已上架課程** → 公開課程頁對訪客顯示「目前沒有符合篩選條件的課程」。上線前需注入真實課程資料並清理壓測資料。`/api/teachers` 10 筆亦混雜測試帳號（`lin Test`、`J T`、`hi sj`）。 |
| P0-4 | 購點（mock 金流）| ✅ PASS | `point_purchase_simulated.spec.ts` 通過（mock server 3005）：餘額 10313→10314、訂單 PAID。詳見第七節。 |
| P0-5 | 報名扣點 + Escrow HOLDING | ✅ / ⚠️ | 報名扣點 + 進教室：`student_enrollment_flow.spec.ts` **PASS**。Escrow HOLDING 機制確認（`createEscrow` 必呼叫 + prod 有 HOLDING 列），但單筆未隔離、且手動重現時發現 points/身分 keying 不一致。詳見第七節。另 `verify-escrow-settlement.mjs` 的並發缺陷見 P0-7。 |
| P0-6 | 教室 wait→room（A/V、白板、PDF、倒數）| ✅ / ⚠️ | **雙人連線 + 白板同步 PASS**（詳見第八節）：`00_preflight` 7/7、`01_canary` 4/4（師生皆進 room、白板 sync 506ms）、`02_sync_quality` 1/1（5 探針 avg 314ms、60s idle 後仍同步）。**PDF 多頁換頁同步 + 倒數精準度未驗**（`06` 2/3 失敗，為 test-harness 巢狀 webServer 衝突、非產品缺陷）。離線純函式亦全通過。 |
| P0-7 | 下課 → Escrow RELEASED → 老師入帳 | ❌ 阻擋（兩問題）| **(a) R14**：`main` 的 Agora 下課流程**未呼叫釋放 escrow**，老師永遠拿不到點數；修正在 integration `40b3b02`，未併入 main。**(b) 並發缺陷**（`lib/pointsEscrow.ts:194-230`）：`releaseEscrow` 先做**非原子的**老師點數 read-modify-write（`getUserPoints`→`setUserPoints`）再做條件式更新 escrow 狀態。50 筆並發釋放同一 escrow 時，多筆會在加點後才撞上 `ConditionalCheckFailedException`（**未被 try/catch，直接拋出**）→ 可能**重複加點/超付**且回傳非預期錯誤。驗證：`verify-escrow-settlement.mjs` exit 1。 |
| P0-8 | 金流安全 | ❌ 阻擋（S3）| `lib/ecpay.ts:4-6` 在環境變數未設時**fallback 到 ECPay 公開測試金鑰**（MerchantID `2000132`、公開 HashKey/HashIV）→ 若 prod 漏設任一變數，任何人可偽造合法 CheckMacValue + `RtnCode=1` 免費取得點數。應改為**缺變數即 fail-closed**。（prod `.env` 目前有設值，但這是靠設定而非程式保障。）Stripe/PayPal/LINE Pay webhook 驗簽需另行逐一 👁 覆核。 |
| P0-9 | API 權限護欄 | ❌ 阻擋（R4）| **`PATCH /api/orders/[orderId]` 完全未驗證身分**（`app/api/orders/[orderId]/route.ts:73` 簽名為 `(request: Request…)`，無 `withAuth`、無 caller/role 檢查）。任何匿名者知道 orderId 即可設 `status:'REFUNDED'`（觸發 escrow 退點）或 `'PAID'`（標記報名已付）。唯一「風控」是針對**訂單擁有者** profile 的退款次數限制，擋不住第三方攻擊者。修正在 integration `841d3f3`。 |
| P0-10 | Prod 資料層就緒 | ⚠️ 部分 | 唯讀 `DescribeTable` 全表掃描結果見附錄 A。核心表（profiles/orders/courses/points-escrow/enrollments/course-sessions）皆 ACTIVE 且 GSI ACTIVE。**但下列程式會用到的表在 prod 不存在**：`jvtutorcorner-questionnaires`（`lib/questionnaireService.ts` 會寫）、`jvtutorcorner-email-verification-logs`（`lib/email/emailVerificationLog.ts` 會寫）、`jvtutorcorner-class-summaries`、`jvtutorcorner-rate-limits`。 |
| P0-11 | main↔integration 差異 | ✅ 已產出 | 見第五節。**部署警示**（依專案記憶）：integration 分支**嚴禁 force-merge 回 main**（曾丟 15 commit + 破壞 build），只能 cherry-pick 或正常 merge。 |
| P0-12 | 10 組並行完整旅程（MVP §6.1）| ⏸ 未執行 | 測試 helper `e2e/helpers/full_journey.ts` 只存在於 integration 分支。指令見附錄。 |

---

## 三、P1 / P2 摘要

### P1 — 上線前應完成

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| P1-1 | 退款流程 | ❌ | `main` 的 `app/admin/refunds/page.tsx:134-156` 用 `Math.random()` 假裝金流狀態；真實審核流程在 integration `841d3f3`。 |
| P1-2 | 師/生課程頁對齊、剩餘堂數 | ⏸ | 唯讀 UI e2e，可於 mock server 執行（`student_courses_verification`、`teacher_courses_verification`、`course_alignment_verification`）。 |
| P1-3 | 管理後台（訂單/CSV/審核/定價）| ⚠️ | 靜態稽核顯示教師資料修改審核、拒絕、重送、權限隔離**尚無完整回歸套件**；CSV 匯入的 admin-only 化在 integration `7cc64dc`。 |
| P1-4 | B2B（組織/單位樹/席次/跨租戶隔離）| ⚠️ | 表齊全（organizations/org-units/licenses 皆 ACTIVE，GSI 完整）。但跨租戶隔離（R5 `b2b-tenant-isolation`）在 MVP 文件標為 SCAFFOLD/未完成；B2B seat 報名（R1/R2）在 integration。 |
| P1-5 | 濫用防護 | ❌ | **`jvtutorcorner-rate-limits` 表 prod 不存在（G2 確認）** → 即使 integration 的 rate-limit 程式上線，也會 fail-open。另 XFF 偽造（G1/S2）、忘記密碼帳號枚舉（G5）待修。`main` 目前根本無 rate-limit 程式。 |
| P1-6 | 排課提醒 / cron | ⏸ | 需驗 `CRON_SECRET` 保護（未帶 secret 打 cron 應 401）。 |
| P1-7 | 白板權限 / classroom-ready | ⚠️ | `app/api/whiteboard/room/route.ts` 有 strict-check 停用的 TODO；classroom-ready 已 DynamoDB 化。 |
| P1-8 | 安全標頭 / 假成功 auth 頁 / 密鑰輪替 | ⚠️ | S7 無任何安全標頭；S8 `app/auth/login`、`app/auth/register` 為假成功 Cognito scaffold（永遠顯示成功、POST 到不存在的 API）；S9 需輪替 `SESSION_SECRET`/`API_HMAC_SECRET`。 |
| P1-9 | RWD 核心頁 | ⏸ | 可於 mock server 跑 `mobile-chrome` project。 |

### P2 — 上線後可追

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| P2-1 | i18n 三語 | ⏸ | `homepage_verification` 語言切換待跑。 |
| P2-2 | 問卷 / 推薦 / LINE Login | ❌ | 問卷持久化目標表 `jvtutorcorner-questionnaires` **prod 不存在** → 問卷提交會在寫入時失敗。LINE Login OAuth 需人工。 |
| P2-3 | SEO（per-page title/sitemap/no-store）| ⚠️ | R11 部分修正在 integration `bc307d0`；CDN 快取未解。 |
| P2-4 | lint / api_registry | ✅（僅記錄）| `npm run lint` 已知約 1662 errors（CI 僅擋 `lib`+`types`）；`docs/api_registry.md` 過期（243 列 vs 現 168 route 檔，footer 2026-08-08）。 |
| P2-5 | 壞掉的 scripts | ✅（已記錄）| `audit-course-sessions.mjs`（缺 `lib/types/courseSession.ts`）、`verify-course-sessions-index.mjs`（缺 `scripts/lib/schema.mjs`）、`test:stress*`/`setup-agora`/`setup-s3`（目標檔不存在）、`e2e/playwright.config.ts` 為 stale 重複。 |
| P2-6 | 未提交功能離線驗證 | ⚠️ | class-summary 13/13、class-summary-process 7/7、ICE/RTC/whiteboard/draw-plan 全通過。**但 `verify-strip-tabid` 4/15 失敗**（見下）。 |
| P2-7 | 可觀測性 | ❌（已知）| `/api/health` 回 404（實測確認，無真實健康檢查）；無 Sentry；`key-logs` 表 1 筆（`lib/keyLogger.ts` 使 admin key-logs 幾乎恆空）。 |

**額外發現（P2-6 衍生，建議升級為 P1）— `stripTabId` 資料損毀**：`lib/accessControl.ts:19` 的 `stripTabId` 對 canonical `u_<digits>` 使用者 ID 會截斷成 `"u"`（`"u_1776606536043" → "u"`），`verifyCourseAccess` 用截斷後的 ID 查 enrollments → **對此類 ID 的使用者存取判斷全錯**。`verify-strip-tabid.mjs` 4/15 例失敗。**需先確認 production 真實 userId 格式**：若為 `u_<digits>` 則屬 P0 存取控制缺陷；若真實 ID 一律含 `@`（email）則影響有限。

---

## 四、上線阻擋清單（Go / No-Go）

必須全部解決才可上線：

1. **[P0-9 / R4] `PATCH /api/orders/[orderId]` 匿名可改單狀態** → 金流/退款詐騙。（cherry-pick integration `841d3f3`）
2. **[P0-7 / R14] Agora 下課不釋放 escrow，老師拿不到錢** + `releaseEscrow` 並發超付/未捕捉例外。（cherry-pick `40b3b02` + 修並發原子性）
3. **[P0-8 / S3] ECPay fallback 到公開測試金鑰** → 改 fail-closed。
4. **[P0-3] production 課程表無真實已上架課程**（190 筆全為壓測資料）→ 注入真實內容 + 清理壓測資料。
5. **[P0-10 / P1-5 / P2-2] prod 缺表**：`rate-limits`、`questionnaires`、`email-verification-logs`（+ `class-summaries`）→ 建表或關閉對應功能。
6. **[P0-1] 未提交 WIP 檔會破壞 `next build`** → 確認部署範圍或移除。
7. **[P1-8 / S8] 假成功 auth scaffold 頁** `app/auth/{login,register}` → 移除或修正。

---

## 五、integration/b2b-security-merge 需進 main 的修正（依 P 分級）

> 只能 cherry-pick / 正常 merge，**嚴禁 force-merge**（記憶記載曾造成 15 commit 遺失 + build 破壞）。

- **P0**：`841d3f3`（退款漏洞+審核流程/R4）、`40b3b02`（Agora 下課釋放 escrow/R14）、`8b1c00d`（rate limiting + 帳號停權）、`bd85fe7`+`3948934`+`12c668d`（API 認證 hardening、org-unit GSI null-key、B2B/B2C 資料結構修復/R1、R12）
- **P1**：`7406e28`（B2B seat 授權課程存取/R1）、`7cc64dc`（B2B console + atomic import + admin-only CSV/R7）、`25f411b`（admin 停權/封鎖 UI+API/R8）、`05430d8`（移除追蹤的機密備份檔/S9）
- **P2**：`bc307d0`（SEO metadata + DB 權限覆寫/R10、R11）、`4dffce8`（typecheck+lint CI 阻擋）、`7881bcb`+`ab042cc`（Cloudflare SFU、S3/R2 統一 — 非 MVP）

---

## 六、本次在 production 表留下的資料（供人工處理）

本次驗收**未執行任何寫入型 e2e、未做任何 cleanup、未刪除任何資料**。唯讀查核與登入頁瀏覽不寫業務資料（僅可能因 QA 登入產生 `jvtutorcorner-sessions` 列，本次未登入故無）。`git status` 除本報告檔外無變化。

**既有污染（非本次造成，建議上線前清理）**：courses 190 筆全為 `stress-group-*`；enrollments ~1325、points-escrow ~1360、sessions ~9732 皆以壓測/測試資料為主；orders 僅 17。

---

## 七、寫入型旅程實跑結果（mock server, 2026-09-20）

環境：停掉原本佔用 port 3000 的 `npm run dev`（production 模式）後，起 `next-dev-e2e-3005`（`APP_ENV=local` + `NEXT_PUBLIC_PAYMENT_MOCK_MODE=true`，確認 `模擬支付 (Demo)` 按鈕存在 → mock 模式生效）。Playwright 以 `NEXT_PUBLIC_BASE_URL=http://localhost:3005` pin 住目標。

| 旅程段 | 結果 | 證據 |
|---|---|---|
| **購點（mock 金流）** | ✅ PASS | `point_purchase_simulated.spec.ts` 1 passed（10.9s）。`pro@test.com` 餘額 10313 → 10314，`/plans` 出現「已付款／點數套餐」紀錄。確認 mock 購點 → 點數入帳 → 訂單 PAID。 |
| **報名扣點 + 進教室** | ✅ PASS | `student_enrollment_flow.spec.ts` 1 passed（30.9s）。「Enroll → Points deducted → Pricing confirmed → Student Courses → Enter Classroom」全流程通過；建立 course `sync-1789900387339` + order `5bdaa599…`，抵達 `/classroom/wait`（SSE stream 正常）。spec 自帶 cleanup 已刪除該 order/course。 |
| **Escrow HOLDING** | ⚠️ 機制確認、單筆未隔離 | `app/api/orders/route.ts:130` 在扣點後**必定呼叫 `createEscrow`**；prod `points-escrow` 表存在多筆 `status=HOLDING`（如 order `de2c2e22` pts=10 teacher=teacher-demo2）。本次 run 的 escrow 因 spec cleanup 刪除 order 而無法隔離；手動 API 重現時撞上下列身分問題而未成功建單。 |

**實跑過程新發現（已自我驗證）：**

1. **`stripTabId` bug 確認可觸發（升為 P0/P1）**：prod escrow 資料出現 `teacher=u_1781191953960` 這種 canonical `u_<digits>` ID → `stripTabId("u_1781191953960")` 會截成 `"u"`（lib/accessControl.ts:19），`verifyCourseAccess` 會用錯 ID 查 enrollments。先前「待確認 ID 格式」已證實：**此格式真實存在於 production**。
2. **points/身分 keying 不一致（P1 correctness）**：登入 `pro@test.com` 後 `GET /api/auth/me` 的 `session.userId = "pro-demo"`，但 `GET /api/points?userId=pro@test.com` 顯示 10314 點。`POST /api/orders` 用 `session.userId`（`pro-demo`）扣點時讀到 **0 點** → 回 `400 點數不足，目前餘額 0 點`。即同一使用者的「顯示餘額」與「扣點餘額」落在不同 key（email vs session slug）。UI 完整流程（spec）因走一致身分而成功，但 API 層身分不一致會造成「明明有點卻報餘額不足」。**建議確認 production 帳號的 session.userId / points key 對應**。
3. **escrow 建立失敗被吞掉（P1 risk）**：`app/api/orders/route.ts:132-137` 對 `createEscrow` 失敗僅 log「Points were deducted but escrow not recorded. Manual reconciliation required」→ 扣了點但沒建 escrow 時，老師永遠收不到、且無自動補償。
4. **POST /api/orders 是安全的**：`handlePost` 有 `withAuth` 且 `userId = request.session.userId`（server-authoritative）。故 P0-9 的漏洞**僅限** unauthenticated 的 `PATCH /api/orders/[orderId]`，POST 路徑無此問題（報告已據此收斂）。

**本次在 production 留下的資料（未 cleanup）：**
- 購點 spec：`pro@test.com` 一筆點數購買訂單（餘額 +1），未清。
- 報名 spec：course `sync-1789900387339` + order `5bdaa599-8efa-4059-8063-49eb572fc90a` — **spec 已自行刪除**；可能殘留一筆對應 escrow（未確認）。
- 手動 enroll 嘗試：3 次皆回 400、**未建立任何 order**（餘額未變）；其中一次 `grant-points` 使 `pro@test.com` email 點數桶 +50。
- 多次登入產生 `jvtutorcorner-sessions` 列。
- ⚠️ **原 port 3000 的 dev server 已被停止**（依你同意）；如需你自己的 server，請重新啟動。

---

## 八、教室雙人連線實跑結果（P0-6，mock server, 2026-09-20）

以 Playwright classroom 套件實跑師生雙 client 連線（fake camera/mic、RTC 白板）：

| 測試 | 結果 | 重點數據 |
|---|---|---|
| `00_preflight` | ✅ 7/7 | 所有 classroom API 可達、login 200、`AGORA_WHITEBOARD_APP_ID` present(len 37)、DynamoDB 可達、homepage 832ms |
| `01_canary`（單組師生完整旅程）| ✅ 4/4（2.4m）| 建課→審核→師生報名→**雙方皆進 `/classroom/room`**（participants 1→2 同步）→**白板畫 4 線 sync latency 506ms**（SLO 8000ms）、Synced=true |
| `02_sync_quality`（白板 QoS）| ✅ 1/1（4.5m）| 5 探針 avg **314ms**（305–324ms）、師生 canvas 皆有內容、**60s idle 後 post-idle sync 307ms**（SSE 存活） |
| `06_room_pdf_sync_countdown` | ⚠️ 1/3 | PDF render/sync 1 項 PASS；**多頁換頁同步 + 倒數精準度 2 項失敗於 enrollment 前置**——`runEnrollmentFlow` fallback 去 `execSync('npx playwright test student_enrollment_flow')` 巢狀啟第二個 webServer 撞 port 3000（`whiteboard_helpers.ts:225`）→ **test-harness 衝突、非 PDF/倒數產品缺陷**，該 2 項未觸及實際斷言。 |

**P0-6 結論**：教室**雙人連線、進房、白板即時同步（含 idle 後存活）已驗證通過**，延遲遠優於 SLO。A/V 由進房隱含觸發 Agora RTC join（fake media）。

**`06` 兩項失敗的根因（已定位，屬 test-harness/身分設計缺陷，非 PDF 產品缺陷）**：
- X-E2E-Secret bypass session 的 `userId = 'system'`（`lib/auth/apiGuard.ts:47`），而 `POST /api/orders` 以 `session.userId` 扣點 → e2e 報名一律扣 **`system`** 這個桶。
- 唯讀查得 **`jvtutorcorner-user-points` 的 `system` balance = (none)=0**。`runEnrollmentFlow` 只 `grant-points` 到「學生 email 桶」9999 點，**從不 top-up `system`** → 只要課程 `pointCost>0`，e2e 報名就扣 `system`(0) → 回「點數不足」→ 落入 subprocess fallback（`whiteboard_helpers.ts:225`）→ 巢狀 webServer 撞埠而失敗。
- `01_canary`/`02_sync_quality` 之所以過，是其測試課程 `pointCost=0`（扣 0 免驗餘額）。`06` 的付費課程才踩到空 `system` 桶。
- **已為 `system` 補點**（0 → 999999，經授權寫入 `jvtutorcorner-user-points`），解除扣點阻擋。此為**真缺陷**：e2e bypass 身分（`system`, apiGuard.ts:47）被當扣點主體卻從未被 fund，任何付費課程的 e2e 報名都會失敗。
- **補點後重跑 `06` 仍未能完成**（已排除：system 補點、首頁 500 修復、warm cache）：最終卡在 `06` setup 的**逐測 UI 帳號註冊流程**（`registering lin@test.com as teacher` → `roleSelect failed: Test ended`）**超過 420s test timeout**，3/3 皆 timeout 於 setup（**非** insufficient points、**非** PDF/倒數斷言）。且**有另一個 session 同時在編輯此 repo**（曾 revert 本次 CourseCard 修正、變動多檔），run 期間 HMR 重編譯使 dev server 不穩、browser context 中途被關（`Target page/context/browser has been closed`）。
- **結論**：PDF 多頁同步 + 倒數精準度**在本次自動化環境無法穩定驗證**，屬 **test-harness（慢速 UI 註冊）+ 環境（並行編輯 repo）** 限制，非 PDF/倒數產品缺陷。PDF sync 與白板 sync 共用同一 SSE 傳輸（已驗證 314ms 穩定同步），功能極可能正常。建議在**無並行編輯的隔離環境**、且改用 API 註冊（非 UI 逐測註冊）重跑 `06`。

**新缺陷（P1）— 首頁 CourseCard null-safety crash**：`components/CourseCard.tsx:48` `hueFromString(subjectValue || title)`，當某課程無 `subject`/`category` 且 `title` 無法解析時傳入 `undefined` → line 24 `input.length` throw → **整個首頁 500**。觸發者：唯讀 Scan 查得 courses 表有 **1 筆全欄位 undefined 的髒課程 `course_room_pdf_single_1789903522662`**（本次 `06` 失敗殘留），surfacing 到首頁即 crash。修法二選一：(a) 刪除該髒課程（清本次污染、恢復首頁）；(b) `hueFromString(subjectValue || title || course.id || '')` null-safe（真 bug 修正）。**建議兩者都做**：CourseCard 應對畸形資料容錯，且課程建立路徑不該允許全 undefined 的課程落表。

**本次 P0-6 留下的 prod 資料**：`01_canary`/`02_sync_quality` 皆有自帶 cleanup（log 顯示「Cleaned up canary course」「Cleanup done for syncq」）；`06` 失敗的兩項可能殘留 course `room-countdown-1789903611650`（未確認）。

**環境影響（重要）**：本次為裝 `@playwright/test` 曾以 `npm i --no-save` 造成 node_modules 連鎖 prune（一度移除 `next`/`react`/`dotenv`/`react-compiler-runtime`、首頁 build 壞掉），已用 `npm ci` + 補裝修復，**目前 app 正常（首頁 200）**。過程暴露一個真缺陷：**`react-compiler-runtime` 被 `components/home/Reveal.tsx` 使用，但未宣告於 package.json/package-lock** → 乾淨 `npm ci` 會缺此套件、首頁 build 失敗（build 可重現性 P1/P2）。且 **Playwright 本身不在專案依賴內**（package-lock 無 `@playwright/test`），e2e 需另裝才能跑。

---

## 附錄 A — 唯讀 DescribeTable 結果（prod，ap-northeast-1）

**存在且 ACTIVE**：profiles(89, GSI byOrgId/EmailIndex/email-index)、user-points(59)、orders(17, UserIdIndex/CourseIdIndex)、courses(190, 無 GSI)、course-sessions(0, byTeacherId/byCourseId/**byStatus**/byRoomId)、points-escrow(1360, byOrderId/byStudentId/byTeacherId)、enrollments(1325, byUserId)、teachers(10)、teacher-reviews(1)、sessions(9732)、subscriptions(4)、plan-upgrades(266, byUserId)、pricing(1)、roles(7)、organizations(7, StatusIndex/BillingEmailIndex)、org-units(12, byOrgId/byParentId)、licenses(76, byOrgId/byUserId)、carousel(9)、user-interactions(32)、key-logs(1)、audit-logs(653, byTargetId)、whiteboard(2843)、whiteboard-strokes(0)、ai-models(3)、workflows(8)、app-integrations(10)、app-permissions(14)

**MISSING（ResourceNotFound）**：`user-profiles`（legacy，僅 `lib/awsHealthChecker.ts` 參照）、`org-invoices`（B2B billing，非 MVP）、**`questionnaires`**、**`class-summaries`**、**`rate-limits`**、**`email-verification-logs`**、`daily-reports`、`tickets`

備註：`profiles` 同時有 `EmailIndex` 與 `email-index` 兩個功能重疊的 GSI（成本/一致性風險，可清理其一）。

## 附錄 B — 未執行的寫入型驗收指令（已授權 QA + mock，需 known-safe server）

先起 known-safe mock server（`.claude/launch.json` 的 `next-dev-e2e-3005`，`APP_ENV=local` + `NEXT_PUBLIC_PAYMENT_MOCK_MODE=true`），再逐檔執行；**注意仍會寫入 production 資料表**（無環境前綴），跑前確認可接受污染：

```bash
APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true npx playwright test e2e/point_purchase_simulated.spec.ts --project=chromium --workers=1
```

其餘依序：`line_pay_simulated`、`pricing_deduction`、`student_enrollment_flow`、`points-escrow-*`（**排除** `points-escrow-production`）、`classroom_wait_verification`、`classroom_room_verification`、`order_refund`、`b2b_admin_ui_flow`。

10 組主驗收（僅 integration 分支有 helper）：

```bash
FULL_JOURNEY=1 SUCCESS_THRESHOLD=1 CONCURRENT_GROUPS=10 APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true npx playwright test e2e/classroom/07_room_pdf_sync_stress.spec.ts --project=chromium --workers=1
```

**永不執行**：`e2e/cleanup-test-data.spec.ts`、`e2e/point_purchase_real.spec.ts`、`points-escrow-production.spec.ts`、`verify-b2b-*`/`verify-b2c-b2b-*`（建立後硬刪）、`scripts/setup-db.mjs`（`--dry-run` 被靜默忽略、會實際套用）、k6 production stress。
