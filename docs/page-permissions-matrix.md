# 頁面權限矩陣（Page Permission Matrix）— 手動／回歸驗證用

> 目的：把「哪個角色能進哪個頁面」整理成矩陣，供人工測試或未來寫自動化腳本時逐格核對。角色與守門邏輯盤點自
> `lib/auth/apiGuard.ts`、`lib/auth/orgAccess.ts`、`lib/auth/pagePermissions.ts`、`lib/types/b2b.ts`、
> `app/admin/layout.tsx`、`app/layout.tsx`、`components/auth/PermissionGuard.tsx`、`middleware.ts`，
> 以及對應的 `app/**/page.tsx`／`app/api/**/route.ts`。盤點時間：2026-08-28。
>
> **⚠️ 2026-09-09 更新**：第 0 節與第 5 節列出的機制缺陷（`middleware.ts` 未注入 `x-pathname`、
> `PermissionGuard` fail-open 且未包住頁面內容、`/carousel` 任何登入者可進、`/settings/pricing` 無守衛、
> `/apps`／`/add-app`／`/workflows`／`/refunds` 等頁面無守衛）**都已修復**——現在共有 23 個
> server `layout.tsx` 在渲染前於伺服器端擋下。這兩節的描述已過期，現況請看
> [auth-architecture-diagram.md](./auth-architecture-diagram.md)。第 3 節的逐頁矩陣尚未重新盤點。
>
> B2B 租戶／部門範圍（`dept_admin` 子樹限制、`isOrgAdmin`）另有專屬文件：
> [b2b-access-orgunit-manual-test-guide.md](./b2b-access-orgunit-manual-test-guide.md)、
> [b2b-b2c-module-matrix.md](./b2b-b2c-module-matrix.md)。本文件只處理「頁面能不能進去」，
> 不重複列組織/部門資料範圍的細節。

## 0. 先讀：三層權限機制彼此獨立，測試要三層都驗

這個專案目前用三種**互不共享同一份真相**的機制在擋頁面／API，任何一層測過不代表另外兩層也對：

| 層級 | 涵蓋範圍 | 實作位置 | 判斷依據 | 能否被使用者繞過 |
|---|---|---|---|---|
| **A. Admin 伺服器守門** | 只有 `/admin/*` | `app/admin/layout.tsx`（Server Component，`redirect()`） | httpOnly `session` cookie（`getSession()`）＋ `DEFAULT_PAGE_PERMISSIONS`（`lib/auth/pagePermissions.ts`，可被 DynamoDB 覆寫） | 不行，伺服器端判斷 |
| **B. 全站 client 守門** | 除了 `/classroom/*`、`/checkDevices/*` 以外的所有頁面 | `components/auth/PermissionGuard.tsx`，掛在 `app/layout.tsx`（root layout，每頁都跑） | `localStorage`（`getStoredUser()`）＋ 未登入即可讀取的 `GET /api/admin/settings` 回傳的 `pageConfigs` | **可以**——角色來自 `localStorage`，使用者能在 devtools 直接改 |
| **C. 個別頁面／API 檢查** | 特定頁面（`teacher_courses`、`teacher/[id]/edit`、`workflows` 等）與所有 `app/api/**/route.ts` | 頁面內 `if (user.role !== ...)`，或 API 的 `withAuth(handler, {roles:[...]})` / `withAdmin` | 頁面同樣讀 `localStorage`；API 讀真正的 `session` cookie | 頁面檢查可以繞過；**API 檢查不行** |

**測試時的正確心法**：`/admin/*` 以外的頁面，頁面本身「看不看得到」多半只是 UX，**真正的權限邊界在對應的 API**。
QA 每一列都建議測兩件事：① 直接改網址／改 `localStorage` 角色能不能看到頁面外殼；② 頁面上的操作（送出表單、按刪除）
呼叫 API 之後是不是真的被 401/403 擋下來。只驗證①會漏掉「頁面擋不住但 API 也沒擋住」的真實漏洞，也會誤判「頁面沒擋
但 API 有擋」為漏洞。

已知的機制缺陷（測試時特別注意，見第 5 節「已知風險」）：
- `middleware.ts` 完全沒有寫入 `x-pathname`，導致 `app/admin/layout.tsx` 裡 `dept_admin` 的子路徑限制
  （`DEFAULT_PAGE_PERMISSIONS['dept_admin']`）實際上恆等於用 `/admin` 這個字面路徑去判斷，等於沒真的按子路徑限制。
- `PermissionGuard`（B 層）在「沒有對應設定 / 角色沒有規則 / 設定還在載入中」時**預設放行**（fail-open），不是預設擋。

## 1. 角色定義

| 角色值 | 說明 | 定義位置 |
|---|---|---|
| （未登入／訪客） | 沒有 session、沒有 `localStorage` 使用者 | — |
| `student` | 一般學員（B2C 或 B2B 成員皆可能是此角色） | `ProfileB2B.role` |
| `teacher` | 授課老師 | 同上 |
| `dept_admin` | B2B 部門管理者，僅限自己 `orgUnitId` 子樹範圍 | `lib/types/b2b.ts:141`、`lib/auth/orgAccess.ts` |
| `admin` | 全站系統管理員 | 同上 |
| `system` | 內部／服務對服務身分（E2E bypass、HMAC 呼叫） | `lib/auth/apiGuard.ts:49`，在 `orgAccess.ts` 內等同系統管理員 |

另有一個**不是 `role` 的旗標**，會影響 API 資料範圍（但目前沒有獨立頁面）：

- `isOrgAdmin`（`lib/types/b2b.ts:165`）：可以掛在 `student` 或 `teacher` 角色的 profile 上，代表「這個人是自己所屬
  Organization 的擁有者／管理者」，在 API 層對自己 `orgId` 內的資料有近乎完整讀寫權（billing／`isOrgAdmin` 授予除外，
  那兩項只有 `admin`/`system` 能動）。**目前沒有一個頁面是專門為「`role=student/teacher` 但 `isOrgAdmin=true`」設計的**
  ——`/admin/organizations/[id]` 這種管理頁仍然卡在 A 層的 `ALLOWED_ADMIN_ROLES = {admin, dept_admin, system}`，
  一個純 `isOrgAdmin` 的 student/teacher 進不去，等於他們的 API 權限目前沒有對應 UI 可用。這點列入第 5 節已知落差。

## 2. 矩陣圖例

- ✅ 允許進入／使用
- ❌ 阻擋（redirect 或畫面明確拒絕）
- 🟡 允許進入，但資料範圍會依角色自動收斂（例如只看自己的訂單／課程）
- ⚪ **沒找到任何守門邏輯**——頁面本身不擋任何角色，實際邊界（如果有）完全在後端 API；需要人工確認是否為預期設計
- 保護機制欄代碼：`A`=admin layout 伺服器守門　`B`=全站 client PermissionGuard　`C`=頁面內自寫檢查（client，可繞過）　
  `API`=只有後端 API 擋，頁面本身沒擋　`redirect`=寫死轉址的相容頁，本身無邏輯

## 3. 頁面權限矩陣

### 3.1 公開／行銷頁

| 頁面路由 | 訪客 | student | teacher | dept_admin | admin/system | 保護機制 | 備註 |
|---|:---:|:---:|:---:|:---:|:---:|---|---|
| `/` | ✅ | ✅ | ✅ | ✅ | ✅ | 無 | 首頁，公開 |
| `/about`、`/terms` | ✅ | ✅ | ✅ | ✅ | ✅ | 無 | 靜態頁 |
| `/carousel` | ❌ | ✅ | ✅ | ✅ | ✅ | C | 只檢查「有沒有登入」，**沒有**限定 admin，任何已登入角色都能進管理輪播圖的頁面——建議確認是否應改為 admin-only |
| `/test-phase1` | ✅ | ✅ | ✅ | ✅ | ✅ | 無 | 疑似測試／開發頁，建議確認是否該下架或加保護 |
| `/testimony`、`/testimony/rating` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ | 未發現角色檢查 |

### 3.2 登入／註冊

| 頁面路由 | 訪客 | 已登入使用者 | 保護機制 | 備註 |
|---|:---:|:---:|---|---|
| `/login`、`/login/register`、`/login/register_enterprise` | ✅ | ✅（登入前頁面，通常無阻擋） | 無 | — |
| `/auth/login`、`/auth/register`、`/auth/verify-email` | ✅ | ✅ | 無 | 成功後導向 `/dashboard` |

### 3.3 學生／老師共用：課程、訂單、點數

| 頁面路由 | student | teacher | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|---|---|
| `/student_courses`、`/student_courses/[orderId]` | 🟡 | 🟡（可查全部） | 🟡（可查全部） | ⚪（頁面無阻擋，靠 `GET /api/orders` 範圍收斂） | 三種角色都能開頁面，資料範圍靠 API |
| `/teacher_courses`、`/teacher_courses/[id]` | ❌ | ✅ | ✅ | C | `role !== 'teacher' && role !== 'admin'` 時直接不 fetch、畫面顯示「僅老師可用」 |
| `/teacher_courses/[id]/edit` | ⚪ | ⚪ | ⚪ | ⚪（頁面完全沒檢查，靠後端 API） | 建議補頁面層檢查，避免依賴 API 400 才擋下操作 |
| `/my-courses`、`/my-courses/[id]/edit` | ⚪ | ⚪ | ⚪ | ⚪ | 未發現角色檢查 |
| `/courses`、`/courses/[id]` | ✅ | ✅ | ✅ | 無（公開課程列表） | `GET /api/courses` 本身也是公開／未驗證 |
| `/courses_manage`、`/courses_manage/new`、`/courses_manage/[id]/edit` | ⚪ | ⚪ | ⚪ | ⚪ 頁面／`API`（`POST /api/courses` 限 teacher/admin/system） | 頁面沒擋，寫入靠 `withAuth` 擋 |
| `/orders`、`/orders/[orderId]` | 🟡 | 🟡 | 🟡 | ⚪（頁面無阻擋，靠查詢範圍收斂） | — |
| `/enrollments` | ⚪ | ⚪ | ⚪ | ⚪ | 未發現角色檢查 |
| `/calendar` | 🟡 | 🟡 | 🟡（看全部） | C（client 分流，非硬擋） | — |
| `/calendar/reminders` | 🟡（看自己） | 🟡（看自己） | 🟡（可切全部／自己） | C＋`API`（寫入操作限 `admin`/`system`） | — |
| `/teacher-escrow` | ❌ | ✅（僅自己 teacherId） | ✅（全部） | C | — |
| `/plans` | ✅（僅自己） | ✅（僅自己） | ✅（可切全部） | ⚪（僅需登入，非角色阻擋）＋C（admin 才多顯示欄位） | 未登入會被導去 `/login` |
| `/pricing`、`/pricing/checkout` | ❌ | ✅ | ✅ | C（僅檢查是否登入） | 任何已登入角色皆可購買，無角色限制 |
| `/redeem` | ❌ | ✅ | ✅ | C（僅檢查是否登入） | — |
| `/refunds` | ⚪ | ⚪ | ⚪ | ⚪ | 未發現角色檢查 |
| `/checkDevices` | ✅ | ✅ | ✅ | 自理（明確排除在全站 B 層之外） | — |

### 3.4 教室（Classroom）

| 頁面路由 | student | teacher | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|---|---|
| `/classroom`、`/classroom/wait`、`/classroom/room` | 🟡 | 🟡（可上傳 PDF 等額外權限） | 🟡 | 自理（明確排除在全站 B 層之外），角色只用來切換教室內功能，不是進場門檻 | 進場資格靠 `app/api/classroom/session/route.ts` 等 API 判斷是否有報名／授權，非本文件範圍 |

### 3.5 老師檔案／老師管理

| 頁面路由 | student | teacher | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|---|---|
| `/teacher/[id]`、`/teacher/[id]/edit` | ❌ | ✅ | ❌ | C | **只允許 `teacher`，不含 `admin`**——與其他老師相關頁面（見下）不一致，建議確認是否為刻意設計 |
| `/teacher/dashboard` | ⚪ | ⚪ | ⚪ | ⚪ | 未發現角色檢查 |
| `/teacher/scanner` | ❌ | ✅ | ✅ | C | — |
| `/teachers`、`/teachers/[id]` | ✅ | ✅ | ✅ | 無（公開目錄） | — |
| `/teachers/[id]/edit` | ❌ | ✅ | ✅ | C | 與 `/teacher/[id]/edit` 不同，這裡是 teacher+admin |
| `/teachers/manage` | ❌ | ❌ | ✅ | C | 明確只給 admin |

### 3.6 個人設定

| 頁面路由 | student | teacher | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|---|---|
| `/profile` | ✅ | ✅ | ✅ | ⚪（僅顯示標籤不同，無阻擋） | — |
| `/dashboard` | ✅ | ✅ | ✅ | ⚪ | 也是各種 forbidden redirect 的落點頁 |
| `/settings` | ✅ | ✅ | ✅ | ⚪ | 未發現角色檢查 |
| `/settings/pricing` | ⚪ | ⚪ | ⚪ | ⚪（頁面無阻擋，後端寫入 API 保護狀況本次未逐一追蹤） | 定價設定頁「感覺」應該 admin-only，但頁面本身未強制，建議補測 |

### 3.7 商品／教材／問卷（含歷史相容轉址）

| 頁面路由 | 任何人 | 保護機制 | 備註 |
|---|:---:|---|---|
| `/medicine-product`、`/medicine-product/questionnaire`、`/medicine-survey-settings`、`/products`、`/products/add`、`/product-scan` | ✅（直接 redirect） | `redirect` | 純轉址到 `/learning-content` 或 `/questionnaire/learning`，本身無邏輯 |
| `/learning-content`、`/learning-content/questionnaire` | ✅ | ⚪ | 未發現角色檢查 |
| `/questionnaire`、`/questionnaire/[mode]` | ✅ | ⚪ | 注意頁面裡的「身分」是表單欄位值，不是登入角色檢查 |

### 3.8 金流子頁

| 頁面路由 | 任何人 | 保護機制 | 備註 |
|---|:---:|---|---|
| `/ecpay/checkout`、`/ecpay/success`、`/paypal/checkout`、`/paypal/mock`、`/stripe/checkout` | ✅ | ⚪（子頁本身無檢查，實務上靠 `/pricing/checkout` 前置登入導流） | 若使用者直接貼網址進來，未經前置頁面，目前沒有二次登入檢查 |

### 3.9 Workflows（自動化流程建構器）

| 頁面路由 | student | teacher | dept_admin | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|:---:|---|---|
| `/workflows`、`/workflows/[id]` | ❌ | ❌ | ❌ | ✅ | C（用 `getStoredUser()`，非 session cookie，理論上可被 devtools 繞過看到殼） | 後端 `app/api/workflows/**` 一致用 `withAdmin`，寫入操作有真正保護 |

### 3.10 `/apps`、`/add-app`（整合市集，與 `/admin` 無關）

| 頁面路由 | 訪客 | student/teacher | admin | 保護機制 | 備註 |
|---|:---:|:---:|:---:|---|---|
| `/apps`、`/apps/ai-chat`、`/apps/daily-report` | ✅（殼會渲染） | ✅ | ✅ | ⚪（頁面完全無守門，`app/apps/` 沒有 `layout.tsx`） | 實際資料操作靠 `withAdmin` 的 API（如 `app/api/apps/permissions/route.ts`、`app/api/app-integrations/**`），未登入使用者能看到畫面殼但呼叫會 401/403 |
| `/apps/page-permissions` | ✅（殼會渲染） | ✅ | ✅ | ⚪ 頁面／`API`（`POST /api/admin/settings` 為 `withAdmin`，但 `GET /api/admin/settings` **未驗證、公開可讀**） | 這頁本身就是在管理第 B 層 `pageConfigs` 矩陣，設定讀取端點目前對所有人（含匿名）公開，建議確認是否洩漏敏感設定 |
| `/add-app` | ✅（殼會渲染） | ✅ | ✅ | ⚪（頁面無檢查） | — |

### 3.11 `/admin/*`（全部由 A 層伺服器守門）

進入 `/admin/*` 的第一關（`app/admin/layout.tsx`）：角色必須是 `admin`／`dept_admin`／`system` 之一，否則整段導去 `/login`；
`teacher`／`student`／未登入一律擋在外。

| 角色 | 能進 `/admin/*` 嗎 | 細節 |
|---|:---:|---|
| （未登入） | ❌ | 導去 `/login` |
| `student` | ❌ | 同上 |
| `teacher` | ❌ | 同上 |
| `dept_admin` | 🟡（理論上只限部分子路徑，但因 `x-pathname` 未設置，實測請務必人工驗證，見第 0、5 節） | `DEFAULT_PAGE_PERMISSIONS['dept_admin']` 設定的允許清單是 `/admin/learners`、`/admin/analytics`、`/admin/learning-paths/assign`、`/admin/organizations/*/members`——但前兩者、後兩者目前**不是真實存在的頁面路由**（見下方「所有 `/admin/*` 實際頁面」清單），代表這份設定跟現有頁面已經對不上，需要重新盤點 |
| `admin` | ✅（全部） | `DEFAULT_PAGE_PERMISSIONS['admin'] = ['*']` |
| `system` | ✅（全部，服務對服務用） | 同上 |

所有實際存在的 `/admin/*` 頁面（都只吃上表的粗粒度角色門檻，逐頁沒有額外差異化邏輯，除非備註特別寫出）：

`ai-chat`、`analytics`、`audit-logs`、`course-reviews`、`make-settings`、`migrate-reminders`、`orders`、
`orders/[orderId]`、`organizations`、`organizations/[id]`、`payments`、`refunds`、`roles`、`settings`、
`settings/about`、`settings/dropdown`、`settings/menu`、`settings/page-permissions`、`settings/roles-usage`、
`settings/whiteboard`、`teacher-escrow`、`teacher-reviews`、`whiteboard_agora`、`whiteboard_canvas`、`whiteboard_sse`

備註：
- `admin/teacher-reviews`、`admin/migrate-reminders` 頁面內部**額外**又用 `getStoredUser()` 重複檢查一次
  `role === 'admin'`（C 層疊加在 A 層之上）——這層是多餘但無害的保險，不影響主要判斷。
- `admin/organizations/[id]` 內的組織單位／成員操作，實際資料範圍改由 `lib/auth/orgAccess.ts` 的
  `requireOrgAccess`／`requireOrgUnitAccess`／`requireMemberScopeAccess` 在 API 層再收斂一次（`dept_admin` 只能碰
  自己子樹），細節見 [b2b-access-orgunit-manual-test-guide.md](./b2b-access-orgunit-manual-test-guide.md)。

## 4. 測試建議做法（逐格驗證流程）

對矩陣裡的每一列（頁面），至少跑一次：

1. **登出狀態**直接貼網址，記錄畫面行為（能看到殼／被導去 `/login`／顯示錯誤）。
2. 用 `student`、`teacher`（必要時 `dept_admin`、`admin`）分別登入後貼網址，記錄畫面行為是否符合矩陣的 ✅/❌/🟡。
3. 對標 ⚪ 或 C 的列，額外用瀏覽器 devtools 把 `localStorage` 裡的使用者角色改成不該有權限的角色，確認：
   - 頁面殼會不會被騙過去（預期：C／⚪ 會，這是已知限制不是新 bug）；
   - 頁面上的操作按鈕（送出、刪除、儲存）呼叫對應 API 時，是不是仍然拿到 401/403（這才是要不要修的判斷依據）。
4. 對標 A 層（`/admin/*`）的列，改用**真的登入不同角色**（不能只改 `localStorage`，因為 A 層吃的是 httpOnly session
   cookie），確認能否進入、以及 `dept_admin` 實際能碰到哪些子頁面（見第 0、3.11、5 節的已知落差，這裡最需要人工紀錄
   真實結果，而不是照抄 `DEFAULT_PAGE_PERMISSIONS` 的設定去假設它一定有效）。

## 5. 已知風險／需要人工再確認的落差（測試時優先看這些）

1. **`dept_admin` 的 `/admin` 子路徑限制可能沒有真的生效**：`middleware.ts` 沒有設置 `app/admin/layout.tsx` 讀取的
   `x-pathname`，導致頁面層的細粒度判斷疑似恆定用字面字串 `/admin` 判斷。請實測 `dept_admin` 帳號直接訪問
   `/admin/roles`、`/admin/settings` 等清單外頁面，確認是否真的被擋。
2. **`DEFAULT_PAGE_PERMISSIONS['dept_admin']` 指向不存在的路由**（`/admin/learners`、`/admin/learning-paths/assign`），
   需要重新盤點 `dept_admin` 目前實際上能用到哪些 `/admin` 頁面（很可能目前形同無頁面可用，只能靠 API 直接操作）。
3. **全站 `PermissionGuard`（B 層）預設放行（fail-open）**，且完全基於可被竄改的 `localStorage`。這層只能當 UX
   提示，不能當成安全邊界；真正要驗證權限，一律以對應 API 的回應為準。
4. **以下頁面「感覺」該有角色限制、但目前完全沒有守門邏輯**，建議列為優先補測／確認清單：
   `/carousel`（任何登入角色可管理輪播圖，未限 admin）、`/settings/pricing`、`/my-courses/*`、
   `/courses_manage/*`（寫入 API 有擋，頁面本身沒擋）、`/refunds`、`/enrollments`、`/apps/*`、`/add-app`。
5. **老師相關頁面的允許角色不一致**：`/teacher/[id]`、`/teacher/[id]/edit` 只允許 `teacher`（不含 `admin`）；
   `/teacher_courses`、`/teacher-escrow`、`/teacher/scanner`、`/teachers/[id]/edit` 則允許 `teacher` 或 `admin`。
   建議與需求方確認何者才是正確設計，兩邊挑一個統一。
6. **`GET /api/admin/settings` 對匿名使用者公開**（`app/apps/page-permissions` 讀的就是這支），已在程式碼註解中說明
   是刻意設計；測試時請視為已知行為而非缺陷，但若設定內容之後加入敏感欄位要重新評估。
7. **`isOrgAdmin` 旗標目前沒有對應頁面**：一個 `role=student`／`teacher` 但 `isOrgAdmin=true` 的使用者，API 層對自己
   組織有近乎完整權限，但因為 A 層只認 `role ∈ {admin, dept_admin, system}`，這類使用者進不去任何 `/admin/organizations/*`
   頁面去實際操作。若產品預期他們該有自助管理畫面，目前是缺口（同見 `docs/b2b-b2c-module-matrix.md` B2B-06）。
