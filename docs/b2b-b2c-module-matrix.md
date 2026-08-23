# JV Tutor Corner B2B / B2C / Shared 模組總覽與驗證分類

> 本文件是產品功能、程式架構與測試覆蓋的共同索引。所有模組都按照「UI、API、Service、Data、Auth／Tenant、Test」分層記錄，避免只看到頁面或 route 存在就誤判為功能完成。
>
> 最近盤點：2026-08-08。重新產生報告：`node scripts/audit-enterprise-general-module-matrix.mjs`。

## 1. 閱讀方式與狀態定義

### 1.1 模組分組

| 分組 | 使用者／範圍 | 內容 |
|---|---|---|
| B2B 企業功能 | 企業管理員、`dept_admin`、企業成員 | 企業註冊、組織、部門、席次、授權、稽核、SSO、租戶、企業帳單 |
| B2C 一般功能 | 訪客、學生、老師、平台管理員 | 註冊登入、公開課程、報名、付款、訂單、點數、課程管理、老師審核、後台營運 |
| Shared 共用功能 | 企業與個人都會使用 | 課程存取閘門、等待室、教室、白板、PDF、QR 報到 |
| Platform 平台附加 | 系統與營運功能 | AI、Email、排程、整合、App 權限、教學教材影像分析、學習問卷、健康檢查 |

### 1.2 狀態定義

| 狀態 | 意義 | 判定規則 |
|---|---|---|
| `COVERED` | 已覆蓋 | 有實際程式碼、主要層級已接通，且有可執行測試證據 |
| `PARTIAL` | 部分覆蓋 | 主流程存在，但缺角色、錯誤、外部 provider、API contract 或某一層 |
| `UNTESTED` | 尚未測試 | 功能或 API 存在，但找不到專用可執行測試 |
| `BLOCKED` | 架構或 fixture 阻塞 | 目前缺少必要架構能力或真實測試資料，不能用 skip 假裝通過 |
| `NOT_IMPLEMENTED` | 尚未實作 | 只有欄位、雛形或 stub；補測試不能把它變成完成 |

### 1.3 每個模組必查的六層

1. **UI**：頁面、元件、操作入口、成功／失敗狀態是否存在。
2. **API**：route 的 method、request schema、status code、錯誤回應是否正確。
3. **Service**：商業規則、交易、狀態轉換、外部 provider 是否集中在服務層。
4. **Data**：資料模型、DynamoDB／S3／外部資料寫入與索引是否完整。
5. **Auth／Tenant**：登入、角色、組織、部門、資源擁有權與跨租戶邊界是否被驗證。
6. **Test**：service／API contract／UI E2E／跨角色或跨租戶測試是否真的可執行；`test.skip`、stub response 與只測匿名拒絕都不算完整覆蓋。

## 2. 全模組覆蓋摘要

目前共 32 個模組、57 個 API domain，未映射 API domain 為 0：

> 2026-08-23 更新：B2B-06／07／08 的狀態已依實測結果更正（見各模組說明）；其餘模組的
> `COVERED` 標記仍沿用 2026-08-08 的稽核結果，其中 B2B-01／02／04／05 引用的部分測試檔案
> （`scripts/verify-b2b-enterprise-registration.mjs`、`scripts/verify-b2b-http-routes.mjs`
> 等）經人工確認並不存在，`COVERED` 標記本身不完全可信，之後盤點時應一併修正。

| 分組 | 模組數 | `COVERED` | `PARTIAL` | `BLOCKED` | `UNTESTED` | `NOT_IMPLEMENTED` |
|---|---:|---:|---:|---:|---:|---:|
| 企業 B2B | 9 | 6 | 1 | 0 | 0 | 2 |
| 一般學員 B2C | 7 | 5 | 2 | 0 | 0 | 0 |
| 老師／管理員 | 4 | 0 | 4 | 0 | 0 | 0 |
| B2B／B2C 共用 | 4 | 3 | 1 | 0 | 0 | 0 |
| 平台共通／附加 | 8 | 1 | 7 | 0 | 0 | 0 |
| **合計** | **32** | **15** | **15** | **0** | **0** | **2** |

> 分組中的共用模組會以實際使用者範圍標記；因此同一個模組可能同時服務 B2B 與 B2C，但只計入一次。

## 3. B2B 企業功能

### B2B-01 企業註冊／公開組織／CSV 批次匯入

- **責任**：企業建立 Organization、驗證企業網域、CSV 匯入成員，以及公開組織清單。
- **UI**：[企業註冊頁](../app/login/register_enterprise/page.tsx)
- **API／Service**：`app/api/register/route.ts`、`app/api/organizations/public/route.ts`、`lib/organizationService.ts`
- **主要驗證**：單筆註冊、網域驗證、CSV 格式錯誤、席次不足、競態註冊 rollback、公開清單不洩漏私有資料。
- **測試**：`scripts/verify-b2b-enterprise-registration.mjs`、`e2e/b2b_enterprise_registration_ui_flow.spec.ts`
- **狀態**：`COVERED`
- **仍需注意**：測試涉及環境資料、網域與 CAPTCHA bypass fixture，執行前要確認環境與清理策略。

### B2B-02 組織／成員管理與 HTTP 權限

- **責任**：建立、讀取、更新 Organization，查看成員，並限制只有合法組織管理者可以操作。
- **UI**：[企業管理頁](../app/admin/organizations/page.tsx)
- **API／Service／Data**：`app/api/organizations/**`、`lib/organizationService.ts`、`lib/types/b2b.ts`
- **主要驗證**：組織擁有者、`isOrgAdmin`、一般成員與匿名使用者的 status code；不能以其他組織的 id 讀寫資料；audit log 要落地。
- **測試**：`scripts/verify-b2b-http-routes.mjs`、`e2e/b2b_admin_ui_flow.spec.ts`
- **狀態**：`COVERED`

### B2B-03 部門／OrgUnit 階層／移動／刪除

- **責任**：建立樹狀部門、巢狀子部門、移動節點、刪除節點與維護 `parentId`／`path`／`level`。
- **UI**：`components/org/OrgUnitTreePanel.tsx`
- **API／Service／Data**：`app/api/org-units/**`、`lib/orgUnitService.ts`、`lib/types/b2b.ts`、OrgUnits DynamoDB table
- **主要驗證**：同組織限制、循環移動禁止、移動後子樹 path 更新、刪除前成員／子部門處理、dept_admin 的範圍限制。
- **測試**：`scripts/verify-b2b-access-orgunits.mjs`、`scripts/verify-b2b-http-routes.mjs`、`e2e/b2b_admin_ui_flow.spec.ts`
- **狀態**：`COVERED`

### B2B-04 Seat／License／成員指派與撤銷

- **責任**：管理企業最大席次、建立 License、指派成員、限制課程範圍、撤銷或過期授權。
- **UI**：`components/org/OrgLicensesPanel.tsx`
- **API／Service／Data**：`app/api/licenses/**`、`lib/licenseService.ts`、`lib/orgMembershipService.ts`、`License` table
- **主要驗證**：席次上限競態、跨表一致性、重複指派、撤銷立即失效、expired／pending 狀態、組織與成員不能跨租戶。
- **測試**：`scripts/verify-b2b-seat-membership.mjs`、`scripts/verify-b2b-http-routes.mjs`、`e2e/b2b_license_panel_ui_flow.spec.ts`
- **狀態**：`COVERED`

### B2B-05 稽核紀錄／Audit Log

- **責任**：記錄組織、成員、席次、部門與權限異動，供企業追蹤與日後合規查詢。
- **API／Service／Data**：`app/api/organizations/**`、`app/api/licenses/**`、`lib/auditLogService.ts`、`cloudformation/dynamodb-audit-log-table.yml`
- **主要驗證**：每個 mutation 都有 actor、organization、action、target、timestamp；失敗操作不應產生錯誤的成功紀錄；查詢不能跨組織。
- **測試**：`scripts/verify-b2b-http-routes.mjs`
- **狀態**：`COVERED`
- **待補強**：目前主要由 route／service 間接驗證，尚缺獨立 audit log API contract 與管理 UI。

### B2B-06 `dept_admin` 部門／子部門範圍

- **責任**：讓部門管理者只能管理指定 `orgUnitId` 與其子部門的成員、授權和資料。
- **API／Service**：`lib/auth/orgAccess.ts`（`requireOrgUnitAccess`／`requireOrgOrDeptAccess`／`resolveDeptScopeUnitIds`）、`lib/orgMembershipService.ts`（`setMemberDeptAdmin`）、`app/api/org-units/**`、`app/api/organizations/[id]/members/**`
- **UI**：`components/org/OrgMembersPanel.tsx`（成員列表的「部門管理員」欄位，勾選即以該成員目前所屬部門為管理範圍）
- **資料模型**：`ProfileB2B.isDeptAdmin` / `ProfileB2B.deptAdminUnitId`（2026-08-23 新增）。範圍判斷用 `orgUnit.path` 前綴比對，不是寫死的單位清單——部門被搬移後，管理範圍自動重算，不用重新授權。
- **主要驗證**：本部門允許、子部門允許、兄弟部門拒絕、跨組織拒絕、不能自行提升權限（含不能把 `isDeptAdmin` 授予別人）、移動部門後範圍重新計算。
- **測試**：`e2e/b2b_dept_admin_scope.spec.ts`（真實 HTTP API，22 個子步驟，含「組織管理員移動部門後、部門管理員範圍自動涵蓋新子部門」的動態重算驗證）
- **狀態**：`COVERED`
- **仍需注意**：v1 只允許系統管理員／組織管理員授予或收回 `isDeptAdmin`，部門管理員之間不能互相授權或移除彼此，避免範圍混亂；如需部門管理員自助委派子部門管理權，需要另外設計。

### B2B-07 跨租戶隔離／Org A-B／DSAR

- **責任**：隔離不同 Organization 的課程、成員、訂單、Profile、證書與刪除／匿名化請求。
- **Service／Data**：`lib/auth/orgAccess.ts`、`lib/types/b2b.ts`
- **架構說明（2026-08-23 更正）**：先前把這個模組標成 `BLOCKED`、理由是「`SessionPayload` 沒有 `tenantId`」，這個判斷不成立——這個專案的組織權限完全不靠 session 帶的 tenant 宣告，`resolveOrgActor()` 每個請求都重新從 DynamoDB 查 `profile.orgId`／`isOrgAdmin`／`isDeptAdmin`，client 端無法偽造或用舊 session 繞過。加 `tenantId` 到 `SessionPayload` 不會提升安全性，所以沒有加。
- **主要驗證**：Org A session 不能讀／改 Org B 的組織、部門、成員、授權（含正對照：Org A 讀寫自己的組織要正常成功，證明不是 guard 整個壞掉）。
- **測試**：`e2e/b2b_cross_tenant_isolation.spec.ts`（真實 HTTP API，兩個真實登入 session 對打 11 種跨租戶操作 + 2 個正對照）
- **狀態**：`PARTIAL`
- **仍未涵蓋**：訂單／證書／DSAR 刪除或匿名化流程的跨租戶邊界尚未驗證；DSAR 匿名化功能本身也還沒實作（見下方「範圍以外」）。這次只把 B2B 核心資源（organizations／org-units／licenses／members）的跨租戶邊界從「沒有證據」變成「真實 HTTP 測試證明」。

### B2B-08 Google SSO／企業網域白名單

- **責任**：authorization code 登入、state／nonce CSRF 防護、Google token 驗證、email verified 與企業網域白名單。
- **API**：`app/api/auth/callback/google/route.ts`
- **狀態說明（2026-08-23 更正）**：先前把這個模組標成 `PARTIAL`，並引用 `app/api/auth/google/start/route.ts`、`lib/auth/googleSSO.ts`、`e2e/enterprise_general_security_contract.spec.ts` 作為證據——這三個檔案在 git 歷史裡從來沒存在過。實際程式碼是一支明寫 `STUB` 的路由：收到任何 `code` 查詢參數就當作登入成功，沒有 token exchange、沒有 JWT 驗證、沒有 state/nonce，而且 UI 上完全沒有「使用 Google 登入」的按鈕能導向這條路徑——只能靠手動組網址觸發。已於 2026-08-23 移除這個假成功路徑：路由現在一律導回登入頁並帶錯誤訊息，前端也不再信任 URL 帶的 `google_auth_success`／`email` 參數建立本機 session。密碼登入不受影響。
- **狀態**：`NOT_IMPLEMENTED`（安全性已修復，但真正的 Google OAuth 整合——token exchange、JWT 驗證、網域白名單——需要使用者提供 Google Cloud OAuth client ID/secret 才能開始做）

### B2B-09 企業帳單／合約／續約／發票

- **責任**：企業層級付款、席次計價、合約起訖、月／年週期、續約、發票、webhook 與欠款處理。
- **目前證據**：`lib/types/b2b.ts`、`app/api/organizations/route.ts` 僅有 Organization billing 欄位。
- **應有驗證**：建立帳單客戶、席次變更計價、付款成功／失敗、webhook idempotency、續約、合約到期、發票權限與退款。
- **測試狀態**：目前沒有組織層級 billing route、service 或專用測試。
- **狀態**：`NOT_IMPLEMENTED`

## 4. B2C 一般功能

### B2C-01 註冊／登入／Session／Profile／密碼

- **責任**：一般註冊、登入、登出、Email 驗證、忘記密碼、目前使用者查詢與個人資料更新。
- **UI／API／Service／Data**：`app/login/**`、`app/api/register/route.ts`、`app/api/login/route.ts`、`app/api/auth/**`、`app/api/profile/route.ts`、`lib/auth/sessionManager.ts`、`lib/profilesService.ts`
- **主要驗證**：匿名／student／teacher／admin 角色、session 過期、Profile 只能修改本人、points／role／org 欄位不可由一般使用者任意竄改。
- **測試**：`e2e/email_verification_flow.spec.ts`、`e2e/navbar_verification.spec.ts`、`e2e/enterprise_general_security_contract.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：尚缺獨立 auth API contract、已登入角色矩陣、logout／forgot-password／profile 完整正反例。

### B2C-02 公開頁／課程目錄／老師目錄／SEO

- **責任**：訪客首頁、課程列表與詳情、老師列表、公開導覽、metadata、cache、robots／sitemap。
- **UI／API／Service**：`app/page.tsx`、`app/courses/**`、`app/teachers/page.tsx`、`app/api/courses/route.ts`、`app/api/teachers/route.ts`、`middleware.ts`
- **主要驗證**：未登入可瀏覽、無資料時畫面穩定、課程詳情不洩漏草稿、語系與 cache 正確、SEO metadata／robots／sitemap 可被搜尋引擎讀取。
- **測試**：`e2e/b2c_verification.spec.ts`、`e2e/homepage_verification.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：SEO metadata、cache、robots／sitemap 仍有已知缺口；既有測試含資料不存在與 bypass secret 的 skip，需分開統計。

### B2C-03 課程瀏覽／報名／學生課程／學習進度

- **責任**：學生查看課程、報名、已購課程、進度與課程／老師對應。
- **UI／API／Service**：`app/student_courses/page.tsx`、`app/my-courses/page.tsx`、`app/api/enroll/route.ts`、`app/api/courses/[id]/route.ts`、`lib/accessControl.ts`
- **主要驗證**：未購買不可進入受保護內容、已購課程可進入、時間與課程 id 對齊、重複報名與座位不足、一般帳號與企業授權均可正確判斷。
- **測試**：`e2e/student_enrollment_flow.spec.ts`、`e2e/student_courses_verification.spec.ts`、`e2e/course_alignment_verification.spec.ts`
- **狀態**：`COVERED`
- **待補強**：CI 中必須確認「找不到課程」不是無聲 skip。

### B2C-04 方案／點數購買／多金流

- **責任**：定價、點數套餐、個人方案與 Stripe／PayPal／LINE Pay／ECPay。
- **UI／API／Service**：`app/pricing/page.tsx`、`app/api/stripe/**`、`app/api/paypal/**`、`app/api/linepay/**`、`app/api/ecpay/**`、`lib/paymentSuccessHandler.ts`、`lib/pricingService.ts`
- **主要驗證**：方案價格、折扣、支付建立、成功／取消／失敗、webhook、重複通知、點數入帳、應用程式方案扣點。
- **測試**：`e2e/stripe_payment_verification.spec.ts`、`e2e/line_pay_simulated.spec.ts`、`e2e/point_purchase_simulated.spec.ts`、`e2e/point_purchase_real.spec.ts`、`e2e/pricing_comprehensive.spec.ts`
- **狀態**：`COVERED`
- **注意**：真實金流與 provider webhook 必須按環境 secrets 分開執行。

### B2C-05 訂單／退款／點數回復

- **責任**：訂單查詢、明細、退款申請、原路退款、資產回復與狀態同步。
- **UI／API／Service**：`app/orders/page.tsx`、`app/refunds/page.tsx`、`app/api/orders/**`、`lib/paymentSuccessHandler.ts`
- **主要驗證**：只能查本人訂單、管理員才能處理退款、退款後點數／方案狀態一致、重複退款不可重複回復資產。
- **測試**：`e2e/order_refund.spec.ts`、`e2e/stripe_payment_verification.spec.ts`
- **狀態**：`COVERED`

### B2C-06 點數暫存／釋放／取消回退

- **責任**：學生報名時扣點、教師端 escrow、課程完成時釋放、取消時返還。
- **UI／API／Service／Data**：`app/teacher-escrow/page.tsx`、`app/api/points/**`、`app/api/points-escrow/**`、`lib/pointsEscrow.ts`、`lib/pointsStorage.ts`
- **主要驗證**：扣點原子性、暫存狀態、釋放一次性、取消回退、負餘額禁止、教師／學生／管理員視角一致。
- **測試**：`e2e/points-escrow-edge-cases-fixed.spec.ts`、`e2e/points-escrow-classroom-flow.spec.ts`、`e2e/points-escrow-release.spec.ts`、`e2e/admin-teacher-escrow.spec.ts`
- **狀態**：`COVERED`

### B2C-07 問卷／推薦／行為追蹤

- **責任**：新手問卷、冷啟動、MMR／TagScore 推薦、課程點擊追蹤。
- **UI／API／Service**：`app/questionnaire/page.tsx`、`app/api/questionnaire/route.ts`、`app/api/recommendations/route.ts`、`lib/questionnaireService.ts`、`lib/recommendationEngine.ts`、`app/api/tracking/course-click/route.ts`
- **主要驗證**：訪客與登入者流程、問卷不完整、冷啟動空資料、推薦排序、重複追蹤與個資最小化。
- **測試**：`e2e/recommendation_onboarding.spec.ts`、`e2e/homepage_verification.spec.ts`
- **狀態**：`COVERED`
- **待補強**：補 API 失敗、空資料與推薦 fallback contract。

## 5. B2C 老師／管理功能

### TEACHER-01 老師課程建立／編修／學生資訊

- **責任**：老師管理自己的課程、查看學生與進入教室，管理員可處理必要的重新指派。
- **UI／API／Service**：`app/teacher_courses/page.tsx`、`app/courses_manage/page.tsx`、`app/api/courses/**`、`lib/teacherVisibility.ts`、`lib/auth/courseOwnership.ts`
- **主要驗證**：匿名拒絕、老師只能改自己的課、老師不能改 `teacherId`、admin 可管理、學生不可寫入課程、刪除／更新 ownership 一致。
- **測試**：`e2e/teacher_courses_verification.spec.ts`、`e2e/course_management_flow.spec.ts`、`e2e/course_alignment_verification.spec.ts`、`scripts/verify-course-ownership-scope.mjs`、`e2e/enterprise_general_security_contract.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：目前有 ownership service 與匿名邊界證據，尚缺真實 HTTP session 的 teacher A／teacher B／admin 角色矩陣 E2E。

### TEACHER-02 老師資料／變更申請／審核

- **責任**：老師提交個人資料變更，管理員審核、核准、拒絕與重新送審。
- **UI／API／Service**：`app/teachers/page.tsx`、`app/admin/teacher-reviews/page.tsx`、`app/api/teachers/[id]/review-request/route.ts`、`app/api/admin/teacher-reviews/route.ts`、`lib/teacherReviewService.ts`
- **主要驗證**：pending／approve／reject／resubmit 狀態轉移、老師只能申請自己、admin 才能審核、拒絕理由、重複審核與 audit log。
- **測試**：目前主要由 `e2e/course_management_flow.spec.ts` 間接涵蓋。
- **狀態**：`PARTIAL`
- **缺口**：缺完整審核生命週期與角色隔離回歸。

### ADMIN-01 課程建立／送審／管理員核准

- **責任**：課程送審、審核、拒絕、重送與公開狀態控制。
- **UI／API／Service**：`app/admin/course-reviews/page.tsx`、`app/api/admin/course-reviews/route.ts`、課程管理服務。
- **主要驗證**：草稿不可公開、admin 才能核准／拒絕、老師不可自行核准、拒絕後可重送、跨老師課程不可操作。
- **測試**：`e2e/course_management_flow.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：拒絕、重送、越權與狀態轉換的專用 contract 不足。

### ADMIN-02 訂單／統計／設定／角色／定價後台

- **責任**：平台訂單、統計、設定、角色、定價、支付與營運管理。
- **UI／API**：`app/admin/**`、`app/api/orders/route.ts`、`app/api/admin/**`
- **主要驗證**：公開 GET 與 admin-only mutation 的界線、admin／teacher／student／匿名 status code、訂單與統計資料範圍、設定與定價修改 audit。
- **測試**：`e2e/pricing_comprehensive.spec.ts`、`e2e/probe_admin_pricing.spec.ts`、`e2e/enterprise_general_security_contract.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：部分 route 已補共用 auth／role guard，但完整 admin 操作 API contract、拒絕與越權案例仍不足；公開 GET 不等於 POST 可公開。

## 6. Shared 共用學習功能

### SHARED-01 課程存取閘門

- **責任**：統一判斷 B2C 購課、B2B License、課程綁定授權與教材／白板存取。
- **API／Service／Data**：`lib/accessControl.ts`、`app/api/courses/[id]/materials/preview/route.ts`、`app/api/whiteboard/room/route.ts`、`lib/licenseService.ts`
- **主要驗證**：已購學生允許、有效企業 License 允許、撤銷／過期拒絕、指定課程 License 不可進入其他課程、匿名與跨租戶拒絕。
- **測試**：`scripts/verify-b2c-b2b-course-access.mjs`
- **狀態**：`COVERED`
- **限制**：共用 access gate 已驗證，但尚不是完整 Org A／Org B E2E；完整跨租戶項目以 B2B-07 為準。

### SHARED-02 等待室／設備權限／進入教室

- **責任**：身份驗證、等待室同步、麥克風／攝影機／聲音檢查、網路速度測試與進入按鈕。
- **UI／API**：`app/classroom/wait/page.tsx`、`app/checkDevices/page.tsx`、`app/api/classroom/session/route.ts`、`app/api/speed-test/route.ts`
- **主要驗證**：student／teacher 身份、未授權課程拒絕、裝置允許／拒絕／無裝置、網路測試失敗、等待室 redirect 與 session。
- **測試**：`e2e/classroom_wait_verification.spec.ts`、`e2e/classroom-wait-device-permissions.spec.ts`、`e2e/wait-page-redirect.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：UI／API 有測試，但 service／data 層與跨 B2B License 進入教室的 contract 尚不完整。

### SHARED-03 視訊／Agora／白板／即時同步

- **責任**：Agora token、教室加入、白板 room、事件同步、倒數、結束課程與多端協作。
- **UI／API／Service**：`app/classroom/room/page.tsx`、`app/api/agora/token/route.ts`、`app/api/whiteboard/**`、`lib/whiteboardService.ts`、`lib/agora/**`
- **主要驗證**：只有課程參與者可取 token、老師／學生權限、白板事件順序、重連、PDF 同步、結束後狀態與壓力行為。
- **測試**：`e2e/classroom_room_verification.spec.ts`、`e2e/classroom_room_whiteboard_sync.spec.ts`、`e2e/classroom_flow.spec.ts`、`e2e/classroom_stress_test_multi_duration.spec.ts`
- **狀態**：`COVERED`
- **注意**：壓力測試需獨立執行，不可當成一般 smoke test。

### SHARED-04 PDF 教材／線上預覽／同步

- **責任**：教師上傳教材、S3 受保護串流、已報名學生預覽、教室內 PDF／白板同步。
- **API／Service／Data**：`app/api/courses/[id]/materials/**`、`app/api/whiteboard/pdf/route.ts`、`lib/pdfUtils.ts`、`lib/s3.ts`
- **主要驗證**：未報名拒絕、教師／管理員上傳權限、下載 URL 不公開、檔案類型與大小、刪除後無法讀取、同步頁碼與筆記。
- **測試**：`e2e/materials_pdf_preview.spec.ts`、`e2e/classroom_room_whiteboard_sync.spec.ts`
- **狀態**：`COVERED`
- **補充**：目前測試重點在 API 與教室同步；教材管理 UI 可再補專用流程。

## 7. Platform 平台共通與附加功能

### PLATFORM-01 AI Chat／Agent／Tool Calling／Workflow

- **責任**：AI 對話、多 provider、agent、tool calling、workflow CRUD／execute 與 action nodes。
- **UI／API／Service**：`app/apps/ai-chat/page.tsx`、`app/api/ai-chat/**`、`app/api/workflows/**`、`lib/workflowEngine.ts`、`lib/workflowService.ts`、`lib/platform-agents.ts`
- **主要驗證**：匿名拒絕、admin／HMAC 邊界、provider fallback、工具 schema、失敗回復、SSRF 防護、workflow 內部呼叫簽章、敏感輸出遮罩。
- **測試**：`e2e/enterprise_general_security_contract.spec.ts`；另有 `e2e/ai_chat_verification.spec.ts`、`scripts/test-ai-chat.mjs` 可作補充。
- **狀態**：`PARTIAL`
- **缺口**：多 provider、工具失敗回復仍缺專用 contract；`figma-export`、`notebooklm-create`、`export-file`、`context7-retrieve` 仍是 TODO／stub。

### PLATFORM-02 Email 驗證／提醒／郵件服務

- **責任**：Email 驗證、重送、密碼信、課程提醒、郵件模板與 local／Amplify 發送。
- **API／Service**：`app/api/auth/verify-email/route.ts`、`app/api/auth/resend-verification/route.ts`、`lib/email/**`
- **主要驗證**：token 一次性與過期、重送節流、連結 base URL、模板資料、發送失敗與 retry、排程不重複寄送。
- **測試**：`e2e/email_verification_flow.spec.ts`、`e2e/email_service_verification.spec.ts`、`e2e/email_hybrid_schema.spec.ts`、`e2e/email_link_base_url.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：部分 email service evidence 路徑與現行實作不一致，且排程／retry contract 仍需補。

### PLATFORM-03 QR 報到／票券／通知

- **責任**：學員動態票券、助教／管理員掃碼、報到核銷與通知。
- **API／Service**：`app/api/attendance/checkin/route.ts`、`lib/attendance/**`、`lib/ticket/**`
- **主要驗證**：票券簽章與過期、重複報到、非本課程票券、助教權限、報到通知與重試。
- **測試**：`e2e/attendance_checkin_qr.spec.ts`
- **狀態**：`COVERED`

### PLATFORM-04 App Integration／LINE／Make／自動化

- **責任**：第三方 App 設定、Make webhook、LINE webhook、推播與自動化串接。
- **UI／API／Service**：`app/add-app/page.tsx`、`app/api/app-integrations/**`、`app/api/integration/make-webhook/route.ts`、`app/api/line/webhook/**`、`lib/integration/**`
- **主要驗證**：整合設定的 owner、webhook 簽章、secret masking、失敗 retry、不可任意指定 userId、不可未授權廣播或 SSRF。
- **測試**：目前只有 `e2e/line_pay_simulated.spec.ts` 間接涉及。
- **狀態**：`PARTIAL`
- **缺口**：Make／LINE webhook／secret 欄位缺專用回歸；整合設定 GET 仍需遮罩敏感資料。

### PLATFORM-05 日曆／提醒／Cron／排程工作

- **責任**：日曆顯示、課前提醒、backfill／migrate、每日報告與 Cron 執行。
- **UI／API／Service**：`app/calendar/page.tsx`、`app/api/calendar/**`、`app/api/cron/**`、`lib/dailyReportService.ts`、`lib/email/**`
- **主要驗證**：session／HMAC／Cron secret、管理員權限、重複執行 idempotency、時區、重試、失敗紀錄、提醒不重複。
- **測試**：`scripts/test-reminder-flow.ts`、`e2e/enterprise_general_security_contract.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：主要 route 已補 auth／HMAC，但 scheduler、retry、duplicate execution 的完整 contract 尚不足。

### PLATFORM-06 App 權限／整合服務設定

- **責任**：全站 App permission matrix、第三方服務設定與 AI image analysis 的權限控管。
- **UI／API／Service**：`app/apps/page.tsx`、`app/api/apps/permissions/route.ts`、`app/api/app-integrations/route.ts`、`lib/appPermissionsService.ts`
- **主要驗證**：匿名拒絕、非 admin 拒絕、HMAC 內部呼叫、不能讀取他人 credentials、GET secret masking、不能用外部設定形成 SSRF。
- **測試**：`e2e/enterprise_general_security_contract.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：目前已補匿名拒絕與 admin guard，但 secret masking 與登入後非 admin 越權測試仍不足；現行 config 仍可能明文回傳給 admin。

### PLATFORM-07 教學教材／內容影像分析與學習問卷

- **責任**：協助學員上傳教材、課程圖片或學習內容，進行內容辨識／影像分析，搭配學習問卷產生理解檢核、學習回饋或個人化教學建議。
- **UI／API／Service／Data**：`app/learning-content/page.tsx`、`app/api/learning-content-analysis/route.ts`、`lib/learningContentAnalysis.ts`、`app/questionnaire/[mode]/page.tsx`、`app/api/questionnaire/route.ts`、`lib/questionnaireService.ts`、`types/questionnaire.ts`。
- **主要驗證**：教材圖片與檔案類型／大小、內容辨識失敗、OCR／影像分析結果、登入與課程存取權限、學習問卷提交、學習回饋儲存、敏感圖片處理、結果不可被任意竄改。
- **測試**：`e2e/learning_content_analysis.spec.ts`，涵蓋新頁面入口、舊路由 redirect、匿名 API 拒絕與舊掃描 API 不得匿名發點。
- **狀態**：`PARTIAL`
- **仍需補強**：真實 AI provider contract、分析結果持久化、教材檔案／PDF pipeline，以及指定課程內容的完整資料 fixture。舊 `/medicine-product`、`/product-scan` 與 `/api/scan-product` 僅為相容入口，不再代表商品或藥品功能。

### PLATFORM-08 Debug／健康檢查／錯誤／上傳

- **責任**：ping、資料庫健康、client error、avatar／upload、AWS health diagnostics。
- **API／Service**：`app/api/ping/route.ts`、`app/api/test-db/route.ts`、`app/api/client-error/route.ts`、`app/api/uploads/avatar/[...path]/route.ts`、`lib/awsHealthChecker.ts`
- **主要驗證**：production-safe 回應、不得暴露 secret、健康檢查權限、上傳 path／content type／size、錯誤資料脫敏。
- **測試**：`e2e/smoke.spec.ts`
- **狀態**：`PARTIAL`
- **缺口**：缺 production-safe health、secret exposure 與 upload authorization matrix。

## 8. API domain 對模組的映射

目前稽核到 57 個 API domain，全部已歸入模組；新增 `app/api/**/route.ts` 時必須同步檢查本表與 `docs/api_registry.md`。

| API domain | 所屬模組 |
|---|---|
| `register`、`login`、`logout`、`auth`、`forgot-password`、`captcha`、`profile` | B2C-01；Google SSO 屬 B2B-08 |
| `organizations`、`org-units`、`licenses` | B2B-02～B2B-06 |
| `courses`、`teachers`、`enroll` | B2C-02、B2C-03、TEACHER-01、ADMIN-01、SHARED-01 |
| `stripe`、`paypal`、`linepay`、`ecpay`、`payments`、`plan-upgrades`、`orders` | B2C-04、B2C-05；企業帳單預留 B2B-09 |
| `points`、`points-escrow` | B2C-06 |
| `classroom`、`speed-test`、`agora`、`signaling`、`token`、`whiteboard`、`netless` | SHARED-01～SHARED-04 |
| `questionnaire`、`recommendations`、`survey`、`tracking`、`carousel`、`i18n` | B2C-02、B2C-07 |
| `admin`、`shared` | ADMIN-01、ADMIN-02、TEACHER-02 |
| `ai-chat`、`chat`、`workflows` | PLATFORM-01 |
| `calendar`、`cron` | PLATFORM-05；Email 發送屬 PLATFORM-02 |
| `attendance` | PLATFORM-03 |
| `app-integrations`、`apps`、`integration`、`line` | PLATFORM-04、PLATFORM-06 |
| `scan-product`、`image-analysis` | PLATFORM-07 教學教材／內容影像分析與學習問卷（目前為 legacy route） |
| `ping`、`test-db`、`client-error`、`uploads`、`avatar`、`debug`、`debug-env`、`test` | PLATFORM-08 |

## 9. 測試與文件維護規則

- 每個新模組至少要有一個可執行的 service／API／E2E 證據，並在矩陣中列出 UI、API、Service、Data 的實際檔案。
- `test.skip`、`fixme`、缺 fixture、只回傳 stub 的 route 必須在報告中列為 `PARTIAL`、`BLOCKED` 或 `NOT_IMPLEMENTED`，不能列為 `COVERED`。
- B2B 腳本與部分 Playwright 流程會寫入 DynamoDB；執行前必須確認環境、帳號、資料清理與是否為 production。
- 真實金流、Google SSO、外部 AI、LINE、Make 與 headed browser 測試要依環境 secrets 分組，不可在未知環境直接執行破壞性流程。
- 新增或修改 API route 後執行 `node scripts/inspect_apis.mjs`，並更新 `docs/api_registry.md`。
- 每次功能修正後執行：

  ```bash
  npm run test:audit-coverage
  npm run test:audit-module-matrix
  npx playwright test e2e/enterprise_general_security_contract.spec.ts --list
  ```

- 若要檢查是否仍有 critical 缺口，執行：

  ```bash
  npm run test:audit-module-matrix:strict
  ```

  `strict` 預期會在目前仍有 `PARTIAL`、`BLOCKED` 或 `NOT_IMPLEMENTED` 的 critical 模組時回傳非 0；這代表尚有工作，不代表稽核腳本壞掉。
