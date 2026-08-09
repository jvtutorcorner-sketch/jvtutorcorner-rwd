# JVTutorCorner 使用者手冊

版本日期：2026-07-03  
適用對象：業務、銷售、客服、管理者、工程人員  
掃描範圍：Next.js App Router 頁面 93 個、API Route 144 個、主要服務層、既有文件、環境設定範本與測試套件。

> 本手冊依目前專案原始碼與既有文件整理。實際正式環境可見功能仍會受到角色權限、DynamoDB 資料、App 串接狀態與環境變數設定影響。

## 1. 系統定位

JVTutorCorner RWD 是一套線上家教與課程營運平台，核心功能包含：

- 師資與課程展示、搜尋、推薦。
- 學生註冊、登入、問卷、方案與點數購買。
- 課程報名、訂單、付款、退款與點數暫存。
- 老師課程管理、學生名單與線上教室入口。
- 線上教室等待室、設備檢測、音視訊、白板、PDF 同步。
- 管理後台：訂單、付款、退款、師資審核、課程審核、角色與頁面權限。
- App 串接：LINE、金流、Email、AI、資料庫、工作流程與自動化。
- 工程維運：DynamoDB、S3、Agora、Stripe/PayPal/LINE Pay/ECPay、Playwright、k6。

## 2. 角色速查

| 角色 | 主要入口 | 核心工作 |
|---|---|---|
| 訪客 | `/`, `/teachers`, `/courses`, `/pricing`, `/about` | 了解平台、搜尋老師與課程、查看方案。 |
| 學生 | `/student_courses`, `/orders`, `/pricing`, `/calendar`, `/classroom/wait` | 購買方案或點數、報名課程、查看訂單、進入教室。 |
| 老師 | `/teacher_courses`, `/courses_manage`, `/my-courses`, `/teacher/dashboard`, `/teacher-escrow` | 管理課程、查看學生訂單、進入教室、查看點數收益。 |
| 管理者 | `/admin/*`, `/settings`, `/apps`, `/carousel`, `/settings/pricing` | 管理訂單、金流、退款、老師/課程審核、權限、App 串接與營運設定。 |
| 客服 | `/orders`, `/admin/finance/orders`, `/admin/finance/refunds`, `/calendar/reminders`, `/admin/reviews/teacher-reviews` | 查訂單、付款狀態、退款、課程時間、老師資料審核狀態與教室問題。 |
| 業務/銷售 | `/pricing`, `/courses`, `/teachers`, `/admin/analytics`, `/apps` | 說明方案、課程價值、客戶導入、串接能力與營運資料。 |
| 工程 | `app/`, `app/api/`, `lib/`, `docs/api_registry.md`, `e2e/`, `k6/` | 開發、部署、測試、排障與資料維護。 |

系統預設角色為 `admin`、`teacher`、`student`。舊版使用者角色 `user` 在部分前端邏輯會被視為學生。

## 3. 常用入口

### 前台與會員

| 路徑 | 用途 |
|---|---|
| `/` | 首頁，包含推薦、導覽與平台入口。 |
| `/teachers` | 師資列表。 |
| `/teachers/[id]` | 師資詳細頁。 |
| `/courses` | 課程總覽，可依科目、語言、老師、模式篩選。 |
| `/courses/[id]` | 課程詳細頁。 |
| `/pricing` | 訂閱方案與點數方案。 |
| `/pricing/checkout` | 方案或點數結帳流程。 |
| `/orders` | 訂單紀錄。學生看自己的訂單，老師看自己課程訂單，管理者可看全站訂單。 |
| `/student_courses` | 學生課程與進入教室入口。 |
| `/teacher_courses` | 老師課程訂單、學生資訊與進入教室入口。 |
| `/calendar` | 課程行事曆。 |
| `/calendar/reminders` | 課程提醒管理。 |
| `/profile` | 個人資料。 |

### 教室

| 路徑 | 用途 |
|---|---|
| `/classroom/wait` | 等待室、設備權限、麥克風/喇叭/攝影機測試、準備狀態同步。 |
| `/classroom/room` | 正式教室，包含音視訊、白板與 PDF。 |
| `/checkDevices` | 裝置檢測頁。 |

### 管理後台

| 路徑 | 用途 |
|---|---|
| `/admin/finance/orders` | 管理者訂單清單、狀態與訂單細節。 |
| `/admin/finance/payments` | 付款管理。 |
| `/admin/finance/refunds` | 退款管理。 |
| `/admin/reviews/teacher-reviews` | 老師資料修改審核。 |
| `/admin/reviews/course-reviews` | 課程審核。 |
| `/admin/teacher-escrow` | 老師點數暫存管理。 |
| `/admin/settings/page-permissions` | 頁面可見性、下拉選單、主選單與頁面存取權限。 |
| `/admin/roles` | 角色管理。 |
| `/admin/settings/menu` | 選單設定。 |
| `/admin/settings/dropdown` | 下拉選單設定。 |
| `/settings/pricing` | 方案、點數包、折扣、App 方案設定。 |
| `/apps` | App 串接、金流、Email、AI、自動化、資料庫與知識庫。 |
| `/carousel` | 首頁輪播圖管理。 |
| `/admin/analytics` | 瀏覽分析示例頁。 |

## 4. 業務與銷售說明重點

### 平台可銷售價值

- 一站式線上家教：從找老師、看課程、購買、報名到線上教室完成閉環。
- 方案與點數並行：可賣月費型方案，也可賣單次點數包，適合不同客群。
- 線上教室完整度高：等待室設備檢測、雙方準備同步、音視訊、白板、PDF 同步。
- 後台營運可控：訂單、付款、退款、老師審核、課程審核、角色權限都在後台管理。
- 可擴充 App 生態：支援 LINE、Email、金流、AI 模型、工作流程、知識庫與自動化。
- 有資料化基礎：問卷、互動追蹤、推薦引擎、訂單與點數資料可支持後續營運分析。

### 方案類型

系統目前支援兩種主要收費模式：

- 訂閱方案：例如 Basic、Pro、Elite，用於不同服務等級、功能權限與服務內容。
- 點數方案：購買固定點數後，用點數報名指定課程；點數可與 App 方案成本綁定，顯示購買前消耗與購買後可用點數。

預設方案描述位於 `lib/mockAuth.ts`，正式營運方案以 `/settings/pricing` 與 `/api/admin/pricing` 儲存的 DynamoDB 設定為主。

### 客戶導入時要確認

- 客戶是 B2C 學生/家長、老師端、還是 B2B 組織客戶。
- 採訂閱制、點數制，或兩者並行。
- 是否需要 LINE、Email、Stripe、PayPal、LINE Pay、ECPay。
- 是否要啟用 AI 聊天、AI 工具、圖片辨識、工作流程。
- 是否需要自訂角色、頁面權限、選單與管理後台可見項目。

## 5. 學生使用流程

### 5.1 註冊與登入

1. 到 `/login` 或 `/auth/login` 登入。
2. 新使用者可到 `/login/register` 或 `/auth/register` 註冊。
3. 註冊時可指定角色；若是老師角色，系統會建立老師相關資料。
4. 登入狀態會反映在右上角選單，選單內容依角色與頁面權限顯示。
5. Email 驗證相關頁面包含 `/auth/verify-email`，API 包含 `/api/auth/verify-email`、`/api/auth/resend-verification`。

客服注意：

- 使用者看不到某頁，先確認是否已登入，再確認角色與 `/admin/settings/page-permissions`。
- 若登入後仍被導向登入頁，需確認 Session cookie、`SESSION_SECRET`、瀏覽器封鎖 cookie 或跨站付款跳回後 session 尚未同步。

### 5.2 找老師與找課程

1. 到 `/teachers` 瀏覽老師。
2. 到 `/courses` 瀏覽課程。
3. 課程可依科目、語言、老師與模式篩選。
4. 課程資料優先讀取 DynamoDB `jvtutorcorner-courses`；只有 DynamoDB 無資料時才 fallback 到 `data/courses.ts`。
5. 只有 `status` 為 `上架` 的課程會顯示在課程列表。

### 5.3 問卷與推薦

系統包含 onboarding 問卷與推薦引擎：

- 問卷入口：`/questionnaire`、`/questionnaire/[mode]`。
- 問卷種子 API：`/api/survey/seeds`。
- 推薦 API：`/api/recommendations`。
- 推薦邏輯：依使用者互動與問卷標籤計算 TagScore，包含時間衰退、MMR 多樣性、類別/老師頻率上限、新課程 boost 與指定版位。

新使用者互動資料少時，系統會提高探索比例；有問卷種子但還沒有點擊/報名時，會採中度探索。

### 5.4 購買方案或點數

1. 到 `/pricing` 查看目前方案與點數包。
2. 登入後可點選方案進入 `/pricing/checkout?plan=...`。
3. 金流可透過 Stripe、PayPal、LINE Pay、ECPay 等整合。
4. 付款完成後，訂單會更新狀態，點數餘額會重新抓取。
5. 若付款跳回後點數仍未顯示，前端會重試 `/api/points`；客服可請使用者重新整理頁面。

常見狀態：

| 狀態 | 意義 |
|---|---|
| `PENDING` | 訂單建立但尚未付款完成。 |
| `PAID` | 已付款，通常可視為可使用或待後續完成。 |
| `COMPLETED` | 訂單或課程流程完成。 |
| `CANCELLED` | 訂單取消。 |
| `REFUNDED` | 已退款。 |
| `FAILED` | 付款或流程失敗，部分列表會過濾不顯示。 |

### 5.5 報名與進入課程

1. 學生報名由 `/api/enroll` 處理。
2. 訂單與報名資料可在 `/orders`、`/student_courses` 查看。
3. `/student_courses` 會顯示課程名稱、老師、堂數、剩餘時間、開始/結束時間。
4. 進入教室按鈕只有在課程開始前 10 分鐘到課程結束時間內顯示。
5. 點數課程會扣學生點數，並建立暫存紀錄，課程完成後釋放給老師，取消時退回學生。

## 6. 老師使用流程

### 6.1 老師課程與訂單

老師主要入口為 `/teacher_courses`：

- 顯示老師課程相關訂單。
- 可用課程名稱、老師、開始時間區間搜尋。
- 顯示學生、課程、老師、課程時長、剩餘堂數、剩餘時間、開始/結束時間。
- 課堂時間內顯示進入教室按鈕。
- 若老師有排程課程但尚未有預約，頁面會在時間符合時顯示準備/預演入口。

系統會用多種方式匹配老師課程：

- `teacherId`
- 老師 email
- 老師 displayName
- 老師姓氏或名字 fallback

### 6.2 課程管理

常見入口：

- `/courses_manage`：課程管理。
- `/courses_manage/new`：新增課程。
- `/courses_manage/[id]/edit`：編輯課程。
- `/my-courses`、`/my-courses/[id]/edit`：老師自己的課程管理頁。

管理者可另外透過 `/admin/reviews/course-reviews` 審核課程。

### 6.3 老師資料審核

老師可編輯自己的資料，管理者透過 `/admin/reviews/teacher-reviews` 審核：

- 待審核修改會存成 TeacherReview。
- 管理者可看差異比較。
- 核准後同步到老師資料。
- 拒絕時保留原資料。

### 6.4 老師收益與點數暫存

入口：

- `/teacher-escrow`
- `/admin/teacher-escrow`

點數暫存流程：

1. 學生報名點數課程。
2. 系統扣學生點數並建立 `HOLDING` 暫存。
3. 課程完成時釋放給老師，暫存狀態變 `RELEASED`。
4. 課程取消時退回學生，暫存狀態變 `REFUNDED`。

工程上由 `lib/pointsEscrow.ts` 控制，正式 DynamoDB 環境使用交易寫入，避免「扣點成功但暫存未建立」。

## 7. 線上教室使用流程

### 7.1 等待室

入口格式：

```text
/classroom/wait?courseId=<courseId>&orderId=<orderId>
```

等待室功能：

- 讀取課程名稱。
- 判斷登入使用者角色，老師或管理者視為 teacher，其他視為 student。
- 要求登入，未登入會導向 `/login?redirect=...`。
- 檢查 HTTPS；正式環境需使用 HTTPS 才能正常要求相機與麥克風權限。
- 檢查麥克風、喇叭、攝影機。
- 儲存裝置選擇到 localStorage。
- 透過 `/api/classroom/ready` 寫入與讀取準備狀態。
- 透過 `/api/classroom/stream` 使用 SSE，同時有 polling 與 BroadcastChannel 輔助同步。
- 可上傳 PDF，供教室內白板/PDF 同步使用。

客服排障順序：

1. 確認使用者已登入。
2. 確認網址含 `courseId`，最好也有 `orderId`。
3. 確認瀏覽器使用 HTTPS。
4. 確認瀏覽器已允許相機與麥克風。
5. 若準備狀態不同步，請雙方重新整理等待室，並確認同一個 `session` 參數。
6. 若只有一方進不去，確認角色與頁面權限。

### 7.2 正式教室

入口：`/classroom/room`

教室功能：

- 自動補 `courseId`、`session` 與 `role` 參數。
- 管理者可測試老師或學生角色。
- 使用 Agora RTC/RTM 音視訊。
- 支援白板、PDF、同步狀態。
- 使用一次性進入控制，降低重複進入造成的狀態混亂。

相關服務與 API：

- Agora token：`/api/agora/token`、`/api/agora/rtm-token`
- Agora session：`/api/agora/session`
- 連線與品質事件：`/api/agora/connection-event`、`/api/agora/quality-event`
- 白板：`/api/whiteboard/*`、`/api/agora/whiteboard`
- 教室準備：`/api/classroom/ready`
- 教室 SSE：`/api/classroom/stream`

## 8. 客服常見問題處理

### 使用者看不到某個選單

處理順序：

1. 確認已登入。
2. 確認使用者角色。
3. 到 `/admin/settings/page-permissions` 查該頁的 `menuVisible`、`dropdownVisible`、`pageVisible`。
4. 若是新角色，確認角色已同步到頁面權限。
5. 管理者一般可看到後台，但已配置頁面仍會依權限顯示。

### 付款成功但點數未增加

處理順序：

1. 到 `/orders` 或 `/admin/finance/orders` 查訂單狀態是否 `PAID`。
2. 查付款紀錄是否有成功事件。
3. 到 `/pricing` 請使用者重新整理點數餘額。
4. 若仍未更新，工程查 `/api/points`、金流 webhook、`paymentSuccessHandler` 與 DynamoDB 點數表。

### 已報名但沒有進入教室按鈕

處理順序：

1. 確認訂單有 `courseId`。
2. 確認課程或訂單有正確 `startTime`、`endTime`。
3. 系統只在開始前 10 分鐘到結束時間顯示按鈕。
4. 若課程資料尚未載入，學生頁可能暫時不顯示，請重新整理。

### 老師看不到學生訂單

處理順序：

1. 確認老師登入帳號的 `role` 是 `teacher`。
2. 確認老師帳號有 `teacherId`。
3. 確認課程資料中的 `teacherId`、老師 email 或老師姓名能對上。
4. 到 `/api/courses?teacherId=...` 或 `/api/orders?courseId=...` 協助工程查資料。

### 無法開啟相機或麥克風

處理順序：

1. 正式環境確認網址是 HTTPS。
2. 瀏覽器網址列權限確認相機/麥克風已允許。
3. 確認裝置沒有被其他會議軟體占用。
4. 等待室先按「授權」再測試麥克風、喇叭、攝影機。
5. iOS/Safari 裝置若裝置名稱無法列出，先確認是否能預覽與收音。

### Email 驗證信或提醒信沒有收到

處理順序：

1. 確認 Email 是否在白名單設定內。
2. 確認 SMTP/Gmail/Resend 等 App 串接是否啟用。
3. 查看 `/admin/email-verification` 或相關測試頁/API。
4. 工程查 `lib/email/*`、`/api/test/send-verification-email`、`/api/cron/process-reminders`。

## 9. 管理者操作

### 9.1 訂單管理

入口：

- `/admin/finance/orders`
- `/admin/finance/orders/[orderId]`
- `/orders` 管理者視角也可看全站訂單。

可做事項：

- 依狀態、課程、日期篩選。
- 查看訂單流程與付款紀錄。
- 查看訂單細節與 metadata。
- 搭配退款、付款、點數查詢處理客服案件。

### 9.2 付款與退款

入口：

- `/admin/finance/payments`
- `/admin/finance/refunds`
- `/refunds`

整合金流：

- Stripe：`/api/stripe/checkout`、`/api/stripe/webhook`、`/api/stripe/portal`
- PayPal：`/api/paypal/create-order`、`/api/paypal/capture-order`、`/api/paypal/return`
- LINE Pay：`/api/linepay/checkout`、`/api/linepay/confirm`
- ECPay：`/api/ecpay/checkout`、`/api/ecpay/return`、`/api/ecpay/client_return`
- 泛用 webhook：`/api/payments/webhook`

### 9.3 方案與價格設定

入口：`/settings/pricing`

管理項目：

- 訂閱方案。
- 點數包。
- 折扣方案。
- App 方案。
- 點數包綁定 App 方案後的預扣點數成本。

資料服務：`lib/pricingService.ts`  
API：`/api/admin/pricing`、`/api/shared/pricing`

### 9.4 角色與頁面權限

入口：

- `/admin/roles`
- `/admin/settings/page-permissions`
- `/apps/page-permissions`

權限欄位：

- `menuVisible`：是否出現在主選單。
- `dropdownVisible`：是否出現在登入使用者下拉選單。
- `pageVisible`：是否可進入頁面。

注意：

- 若頁面已配置但某角色沒有權限紀錄，前端會保守隱藏。
- `/api/admin/settings` 支援 refresh 動作，可掃描 `app/` 的 page.tsx 重新產生頁面設定。
- 權限儲存在 DynamoDB page permissions table。

### 9.5 App 串接

入口：`/apps`

主要分頁：

- 基本設定：通訊渠道、金流、Email、已連接 App。
- 自動化：排程與每日報告。
- AI 功能：AI 服務、AI 聊天室、平台代理、Ask-Plan-Agent、技能預覽。
- 資料庫與知識庫：資料儲存、Qdrant 等能力。

常見串接類型：

- LINE channel 與 LINE push/reply。
- Stripe、PayPal、LINE Pay、ECPay。
- Gmail/SMTP/Resend。
- Gemini/OpenAI/Anthropic。
- Qdrant knowledge base。
- Make.com webhook。

## 10. AI 與工作流程

### AI 聊天

入口：

- `/apps/ai-chat`
- `/admin/tools/ai-chat`
- 全站 `AIAssistantWidget`

API：

- `/api/ai-chat`
- `/api/ai-chat/dispatch`
- `/api/ai-chat/generate-workflow`

AI 服務設定來自 App Integrations 與 AI Models 設定。支援 Gemini、OpenAI、Anthropic 等 provider；實際可用模型取決於 `/apps` 設定與 API key。

### 工作流程

入口：

- `/workflows`
- `/workflows/[id]`

核心能力：

- 視覺化節點流程。
- Trigger、Action、AI、HTTP、資料轉換、通知、Delay、Output。
- Email、Gmail、Resend、LINE push/reply。
- AI dispatch 與 agent execute。
- 圖片分析、LINE 圖片下載與視覺辨識。
- Qdrant knowledge base。
- Figma export、檔案 import/export。
- JavaScript 執行與 Python Lambda 代理執行。

主要服務：

- `lib/workflowService.ts`
- `lib/workflowEngine.ts`
- `components/workflows/*`

## 11. 資料與技術架構

### 技術棧

- Frontend：Next.js 16 App Router、React 18、Tailwind CSS 4。
- Backend：Next.js API Routes、AWS Amplify、DynamoDB、S3。
- Auth：本地 mock/session、Server-side signed session、HMAC API guard。
- Live Classroom：Agora RTC/RTM、SSE、BroadcastChannel、白板/PDF。
- AI：Gemini/OpenAI/Anthropic provider integration。
- Payment：Stripe、PayPal、LINE Pay、ECPay。
- Testing：Playwright E2E、k6 API/壓力測試。

### 主要資料表與用途

| 環境變數 | 預設表名 | 用途 |
|---|---|---|
| `DYNAMODB_TABLE_COURSES` | `jvtutorcorner-courses` | 課程。 |
| `DYNAMODB_TABLE_ORDERS` | `jvtutorcorner-orders` | 訂單。 |
| `DYNAMODB_TABLE_PROFILES` | `jvtutorcorner-profiles` | 使用者/老師資料。 |
| `DYNAMODB_TABLE_ROLES` | `jvtutorcorner-roles` | 角色。 |
| `DYNAMODB_TABLE_PAGE_PERMISSIONS` | `jvtutorcorner-page-permissions` | 頁面權限。 |
| `DYNAMODB_TABLE_USER_POINTS` | `jvtutorcorner-user-points` | 使用者點數餘額。 |
| `DYNAMODB_TABLE_POINTS_ESCROW` | `jvtutorcorner-points-escrow` | 點數暫存。 |
| `DYNAMODB_TABLE_PRICING` | `jvtutorcorner-pricing` | 方案與價格設定。 |
| `DYNAMODB_TABLE_APP_INTEGRATIONS` | `jvtutorcorner-app-integrations` | App 串接。 |
| `DYNAMODB_TABLE_AI_MODELS` | `jvtutorcorner-ai-models` | AI 模型設定。 |
| `DYNAMODB_TABLE_SESSIONS` | `jvtutorcorner-sessions` | Session。 |
| `WHITEBOARD_TABLE` | `jvtutorcorner-whiteboard` | 白板狀態。 |
| `DYNAMODB_TABLE_KEY_LOGS` | `jvtutorcorner-key-logs` | 關鍵業務日誌。 |

### 重要資料流

#### 購買與報名

```text
學生選方案/點數
  -> 建立訂單 /api/orders
  -> 導向金流
  -> webhook/return 更新付款狀態
  -> 更新點數或方案
  -> 報名 /api/enroll
  -> 課程與訂單出現在 /student_courses 或 /teacher_courses
```

#### 點數暫存

```text
學生報名點數課程
  -> atomicDeductAndCreateEscrow()
  -> 學生點數扣除，Escrow = HOLDING
  -> 課程完成 releaseEscrow()
  -> 老師點數增加，Escrow = RELEASED
  -> 課程取消 refundEscrow()
  -> 學生點數退回，Escrow = REFUNDED
```

#### 教室準備同步

```text
/classroom/wait
  -> 設備授權與測試
  -> POST /api/classroom/ready
  -> GET /api/classroom/ready
  -> SSE /api/classroom/stream
  -> 雙方 ready
  -> /classroom/room
```

## 12. API 速查

完整 API 清單請看 `docs/api_registry.md`。以下是跨角色最常用群組：

| 群組 | API |
|---|---|
| Auth | `/api/login`, `/api/logout`, `/api/register`, `/api/auth/me`, `/api/auth/verify-email`, `/api/auth/resend-verification` |
| Courses | `/api/courses`, `/api/courses/[id]`, `/api/admin/course-reviews` |
| Orders | `/api/orders`, `/api/orders/[orderId]`, `/api/admin/orders` 對應頁面使用同一類資料 |
| Enrollment | `/api/enroll` |
| Points | `/api/points`, `/api/points-escrow`, `/api/admin/grant-points` |
| Pricing | `/api/admin/pricing`, `/api/shared/pricing`, `/api/admin/subscriptions` |
| Payment | `/api/stripe/*`, `/api/paypal/*`, `/api/linepay/*`, `/api/ecpay/*`, `/api/payments/webhook` |
| Classroom | `/api/classroom/ready`, `/api/classroom/session`, `/api/classroom/stream` |
| Agora | `/api/agora/token`, `/api/agora/rtm-token`, `/api/agora/session`, `/api/agora/connection-event`, `/api/agora/quality-event` |
| Whiteboard | `/api/whiteboard/pdf`, `/api/whiteboard/pdf-page`, `/api/whiteboard/room`, `/api/whiteboard/state`, `/api/whiteboard/stream`, `/api/whiteboard/presign` |
| Admin | `/api/admin/settings`, `/api/admin/roles`, `/api/admin/teacher-reviews`, `/api/admin/payments`, `/api/admin/refunds`, `/api/admin/stats` |
| Apps | `/api/app-integrations`, `/api/app-integrations/test`, `/api/apps/permissions` |
| AI | `/api/ai-chat`, `/api/ai-chat/dispatch`, `/api/admin/ai-models`, `/api/shared/ai-models` |
| Workflow | `/api/workflows`, `/api/workflows/[id]`, `/api/workflows/execute`, `/api/workflows/*` |
| Recommendation | `/api/questionnaire`, `/api/questionnaire/match`, `/api/recommendations`, `/api/survey/seeds`, `/api/tracking/*` |

## 13. 工程維運

### 本機啟動

```powershell
npm install
npm run dev
```

常用腳本：

```powershell
npm run dev          # Next dev server
npm run dev:http     # localhost:3001
npm run build        # production build
npm run lint         # ESLint
npm test             # Playwright
npm run test:local   # APP_ENV=local Playwright
npm run test:prod    # APP_ENV=production Playwright
```

### 環境變數

本機以 `.env.local` 為主，範本見 `.env.local.example`。必要類別：

- AWS region/credentials。
- DynamoDB table names。
- S3 bucket。
- Agora RTC/Whiteboard credentials。
- Session/HMAC secrets。
- Payment provider keys。
- SMTP/Gmail/Resend 設定。
- AI provider API key。
- 測試帳號與 `LOGIN_BYPASS_SECRET`。

安全要求：

- 不要把正式金鑰寫入文件或提交到 Git。
- `.env.local`、`.env.production` 含敏感資訊，僅限授權人員使用。
- 對外文件只描述變數名稱，不放變數值。

### 測試

Playwright E2E：

```powershell
npm test
npm run test:local
npm run test:prod
```

壓力與 API 測試：

```powershell
.\k6\run.ps1 smoke
.\k6\run.ps1 -Test auth -BaseUrl http://localhost:3000
.\k6\run.ps1 stress
```

重點測試目錄：

- `e2e/`：登入、首頁、報名、金流、教室、等待室、白板、權限、Email。
- `e2e/classroom/`：教室 canary、同步、壓力、PDF 同步。
- `k6/tests/`：Auth、HMAC、Points、Courses、Enroll、Smoke、Stress。

### 部署與雲端

相關文件：

- `DEPLOYMENT_GUIDE.md`
- `AMPLIFY_DEPLOYMENT_CHECKLIST.md`
- `AMPLIFY_WORKFLOW_DEPLOYMENT_CHECKLIST.md`
- `cloudformation/README.md`
- `cloudformation/*.yml`

部署前檢查：

- DynamoDB table 已建立。
- Amplify 環境變數完整。
- S3 bucket 與 CORS 正確。
- Agora、金流、Email、AI key 設定完整。
- `/api/ping`、登入、課程列表、金流 webhook、教室 token 可用。
- Playwright smoke 與 k6 smoke 通過。

## 14. 工程排障索引

| 問題 | 優先查看 |
|---|---|
| 課程列表空白 | `app/courses/page.tsx`, `/api/courses`, `DYNAMODB_TABLE_COURSES` |
| 老師課程對不到 | `app/teacher_courses/page.tsx`, `teacherId/email/name` mapping |
| 學生進教室按鈕不顯示 | `app/student_courses/page.tsx`, 訂單 `startTime/endTime`, courseMap |
| 點數扣了但老師未收到 | `lib/pointsEscrow.ts`, `/api/points-escrow`, DynamoDB transaction logs |
| 付款成功但訂單未更新 | provider webhook route, `/api/orders`, `lib/paymentSuccessHandler.ts` |
| 權限/選單異常 | `components/Header.tsx`, `components/auth/PermissionGuard.tsx`, `lib/pagePermissionsService.ts` |
| 教室 ready 不同步 | `/api/classroom/ready`, `/api/classroom/stream`, wait page session uuid |
| Agora 連不上 | `/api/agora/token`, `/api/agora/session`, `/admin/tools/whiteboard_agora`, Agora env |
| 白板/PDF 不同步 | `/api/whiteboard/*`, `lib/whiteboardService.ts`, S3/whiteboard table |
| AI 無回應 | `/apps`, `/api/ai-chat`, `lib/platform-agents.ts`, `lib/platform-skills.ts` |
| Workflow 執行失敗 | `/api/workflows/execute`, `lib/workflowEngine.ts`, node logs |
| Email 未寄出 | `lib/email/*`, SMTP/Gmail/Resend App 設定, whitelist |

## 15. 文件來源

本手冊主要依以下檔案與目錄整理：

- `architecture_overview.md`
- `docs/project-mind-map.md`
- `docs/api_registry.md`
- `README.md`
- `package.json`
- `.env.local.example`
- `app/`
- `app/api/`
- `components/Header.tsx`
- `components/auth/PermissionGuard.tsx`
- `lib/mockAuth.ts`
- `lib/pricingService.ts`
- `lib/pointsEscrow.ts`
- `lib/recommendationEngine.ts`
- `lib/workflowEngine.ts`
- `lib/pagePermissionsService.ts`
- `lib/rolesService.ts`
- `e2e/`
- `k6/README.md`

## 16. 後續建議

- 將本手冊與正式營運截圖搭配，製作業務/客服版簡報。
- 為客服建立「訂單、付款、點數、教室」四張一頁式排障表。
- 將 `/admin/settings/page-permissions` 的實際角色權限匯出成附錄。
- 重新執行 API 掃描，更新 `docs/api_registry.md`，目前 registry 的時間戳是 2026-06-19。
- 增加正式環境 smoke checklist，放在客服與工程交接流程中。
