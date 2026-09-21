# JV Tutor Corner — 資料庫結構修正 Session 交接知識庫

> **給新的 Claude**：本文件整理「資料庫結構稽核與五項修正」這個 session（約 2026-09-03）的結論、程式邏輯與進度。
> 另一份 `docs/claude-session-handoff-2026-09-15.md` 記錄的是**之後**的 session（09-09～09-12，安全強化、skill 驗證）。**兩份都要讀**；本文件只負責資料層，不重複那份的環境規則。
> 文件產生日期：2026-09-15。凡標「**現況（09-15 查證）**」的內容，都是寫文件當下重新讀程式碼或查正式環境得到的，**優先於**本 session 當時的說法。
> 使用者用繁體中文溝通，回覆一律 zh-TW。

---

## 0. TL;DR（開工前必讀）

1. 本 session 的程式碼**已 commit**（主體在 `bd85fe7`），之後被 `12c668d`、`3948934` 修正過，現在都在 `integration/b2b-security-merge`，**領先 `origin/main`、尚未 push、尚未部署**。
2. **正式環境仍缺 4 個 GSI**（09-15 以 `verify-schema --live` 查證）：
   enrollments 的 `byCourseId`／`byOrderId`／`byOrgId`，courses 的 `byTeacherId`。
3. **不可以現在就跑 `node scripts/setup-db.mjs` 補這 4 個 GSI**。正確順序：**部署程式 → `scripts/repair-b2b-data.mjs`（先 dry-run 再 `--apply`）→ `setup-db.mjs` → `verify-schema.mjs --live`**。原因見 §5.1。
4. 本 session 的兩個設計**後來被推翻**，不要照舊版說法實作：
   - enrollment **不再**帶買家的 `orgId`（§3.4）。
   - GSI 鍵值欄位**不可以寫 `null`**，要省略欄位（§5.1）。
5. 教師外鍵遷移**已在正式環境執行完畢**（295 筆），可重跑，冪等。
6. **尚未處理**：30 筆已 RELEASED 的 escrow 當初把點數付到錯誤的點數桶，需要人工調帳，使用者尚未決定（§6.1）。
7. `.env.local` 指向**正式 AWS**。任何寫入正式資料的動作都要先取得使用者當下同意。

---

## 1. 使用者原始需求

使用者先要求稽核「課程、方案、教室、老師、學生、企業」關聯是否有缺陷，接著下達五項修正：

| # | 需求（原文摘要） |
|---|---|
| 1 | 統一 B2B 表 schema：刪掉或改寫 CloudFormation 版本，以 `setup-db.mjs` 為準 |
| 2 | 老師外鍵統一為 `teacherId` = profile 的 `roid_id`；補 `teacherId` GSI；跑一次遷移把 `teacherEmail` 換成 id；修正 escrow 的鍵 |
| 3 | 方案字彙收斂成一張表；`profile.plan` 只允許表內 id；`plan-upgrades` 加 `withAuth` |
| 4 | Enrollment 補 `orderId` 與 `orgId`；報名必須有 session；存取判定改用 GSI Query |
| 5 | 新增「梯次／場次」實體，承載教室房間、出席、完成狀態；`usedSeats`、`seatsLeft` 改為由來源表計算或全部走交易 |

---

## 2. 核心規則（跨表一致的約定）

| 規則 | 內容 |
|---|---|
| canonical user id | `profile.roid_id \|\| profile.id`。`/api/login` 的 `session.userId` 就是它。**永遠不用 email 當外鍵** |
| 老師外鍵 | 所有表一律存 `teacherId` = canonical id。`teacherEmail` 僅為舊資料相容欄位，不可作為 key |
| schema 唯一來源 | `scripts/lib/schema.mjs`。`setup-db.mjs` 由它產生 CreateTable／UpdateTable；CloudFormation 是鏡像；`verify-schema.mjs` 負責比對 |
| GSI 鍵值 | 可選的 GSI key 欄位**省略，不寫 null**（DynamoDB 拒絕 null 作為索引鍵，會回 `Type mismatch for Index Key`） |
| GSI 命名 | 本 repo 擁有的新表用 `by<Field>`；舊表的 `XxxIndex` 保留原名（改名需重建索引並改所有呼叫端） |
| 名稱例外 | `plan-upgrades` 的 PK 是 `upgradeId`、`points-escrow` 的 PK 是 `escrowId`，不是 `id`（改 PK 需重建表） |
| 存取判定 | 用 GSI Query 並分頁到底，**不用帶 FilterExpression 的 Scan**（Limit 作用在「掃描筆數」而非「符合筆數」，會漏資料） |

---

## 3. 五項修正：邏輯與現況

### 3.1 項目 1 — B2B schema 統一

**發現的缺陷**：`cloudformation/dynamodb-b2b-tables.yml` 與程式碼每個鍵都不一致，用 CloudFormation 建的環境 app 讀不到。

| 實體 | CFN（舊） | 程式碼實際使用 |
|---|---|---|
| Organizations | PK `organizationId` | PK `id` |
| Licenses | PK `licenseId`、GSI `OrganizationIdIndex`／`UserIdIndex`、欄位 `organizationId` | PK `id`、GSI `byOrgId`／`byUserId`、欄位 `orgId` |
| Org Units | 不存在 | PK `id`、GSI `byOrgId`(orgId+path)／`byParentId` |
| Roles | PK `roleId` | PK `id` |
| PagePermissions | PK `permissionId` | PK `id`（id === path） |

**做法**：
- `scripts/lib/schema.mjs`（新）：宣告式定義 `TABLES`（organizations、orgUnits、licenses、enrollments、courseSessions、planUpgrades、pointsEscrow）與 `REQUIRED_INDEXES_ON_EXISTING_TABLES`（profiles.`byOrgId`、courses.`byTeacherId`）。匯出 `resolveTableName`、`attributeDefinitions`、`keySchema`、`indexKeySchema`、`globalSecondaryIndexes`、`createTableParams`。
- `scripts/setup-db.mjs`（重寫）：`ensureTable(def)` 表不存在就建立，存在就逐一補缺少的 GSI；`ensureGSI` **一次只建一個 GSI 並等 ACTIVE**（DynamoDB 限制：一次 UpdateTable 只能建一個、backfill 中不可再更新）。
- `cloudformation/dynamodb-b2b-tables.yml`（改寫）：鏡像 schema.mjs，檔頭註明以 setup-db 為準。**TTL 刻意不開**在 licenses（`expiresAt` 是業務狀態，自動刪列會讓 usedSeats 對帳失準）。
- `scripts/verify-schema.mjs`（新）：
  - `--template`：解析 CFN 的 KeySchema／GSI 與 schema.mjs 比對（不需 AWS）。
  - `--live`：DescribeTable 比對正式環境。
  - 已做過反向測試：把 Organizations PK 改回 `organizationId` 會被抓到。
- npm scripts：`db:setup`、`db:verify`、`db:verify:template`、`db:migrate:teacher-ids`。

**遺留缺陷（刻意未修，需資料遷移）**：`lib/auth/pagePermissions.ts::queryDbPermission` 查 `RolePathIndex`（HASH 頂層 `roleId`），但 `lib/pagePermissionsService.ts` 寫入的每筆是「一頁一筆、角色放在 `permissions[]` 陣列」，**沒有頂層 `roleId`**。結果 DB 覆寫永遠查不到，靜默退回內建 `DEFAULT_PAGE_PERMISSIONS`。**現況（09-15 查證）仍未修**。修法二擇一：寫入端改成每 (roleId, path) 一筆；或讀取端改用 `Get id=path` 讀 `permissions[]`。

### 3.2 項目 2 — 老師外鍵與 escrow 鍵

**發現的缺陷**：
- `app/api/courses/route.ts` 寫 `teacherEmail: body.teacherEmail || body.teacherId`，GET 用 `teacherId = :tid OR teacherEmail = :tid` 的 Scan，結果取決於呼叫端拿的是 id 還是 email。
- `app/api/orders/route.ts` 以 `teacherId || teacherEmail` 解析課程老師並寫入 escrow。`releaseEscrow()` 用 `setUserPoints(record.teacherId)` 發點數 → **email 型 key 會把點數發到沒人讀的桶，escrow 顯示 RELEASED 但老師餘額不變**。
- `listEscrows` 用 Scan + Filter，雖然 `byStudentId`／`byTeacherId` GSI 已宣告。
- escrow 有 id 與 roid_id 混用：遷移時發現 `e61300a2-...`（profile.id）應為 `teacher-demo2`（roid_id）。

**做法**：
- `lib/teacherIdentity.ts`（新）：
  - `resolveCanonicalTeacherId(raw)`：email → `findProfileByEmail`；id → `getProfileById` 並正規化到 roid_id。記憶體快取 5 分鐘。email 查不到回 `null`；**查詢失敗**時 id 型輸入原樣回傳，email 型回 null。
  - `requireCanonicalTeacherId(raw)`：解析不到就 throw（寫入路徑用）。
  - `readCourseTeacherKey(course)`：優先 `teacherId`，退回 `teacherEmail`（不做查詢）。
- `lib/pointsEscrow.ts`：`createEscrow` 先 `resolveCanonicalTeacherId`，解析不到就**拒絕建立**；`listEscrows` 有 student／teacher 時走 GSI Query，只有 admin 全表列表才 Scan。
- `app/api/courses/route.ts`：
  - GET `?teacherId=` → 先解析 canonical id，再 Query `byTeacherId`；結果為空時才 Scan `teacherEmail = :x AND attribute_not_exists(teacherId)` 找未遷移舊資料（遷移後可刪此分支）。
  - POST 存 canonical `teacherId`；解析不到回 400；`teacherEmail` 只存 body 明確給的值。
- `scripts/migrate-teacher-ids.mjs`（新）：預設 dry-run，`--execute` 才寫，`--table=courses|escrow|orders`。一次 Scan profiles 建索引（email 小寫／id／roid_id → canonical）。escrow 更新時寫入 `migratedFromTeacherKey` 保留舊值；RELEASED 的列會印警告（改 key 不會把點數移回）。

**執行結果（正式環境，本 session）**：

| 表 | 更新筆數 |
|---|---|
| courses | 114 |
| points-escrow | 181（其中 30 筆 RELEASED） |
| orders | 0 |
| 已正確 | 1,260 |
| 無法解析 | 2（`escrow-3min-1776920030911`、`escrow-3min-1776920005791`，E2E 測試課程，老師 profile 已不存在） |

重跑 dry-run 回報 `Would update: 0`，確認冪等。

**現況（09-15 查證）**：courses 的 `byTeacherId` GSI **在正式環境仍不存在**，所以 GET `?teacherId=` 目前走的 Query 會失敗。該路由的錯誤處理需要注意；補 GSI 前可視為降級狀態。escrow 的 `byStudentId` 已在本 session 建好。

### 3.3 項目 3 — 方案字彙

**發現的缺陷**：`profile.plan` 是自由文字，各寫入端用不同字彙：Google 註冊 `'basic'`、LINE 登入 `'free'`、admin 設定頁 `'premium'`、型別宣告 `'basic'|'pro'|'elite'|'viewer'`、E2E session `'system'`、`paymentSuccessHandler` 直接寫未驗證的 `orderItem.planId`。`plan-upgrades` 的 POST／GET 完全沒驗證：POST 從 body 取 `userId`（可替任何人建含任意 `points` 的訂單），GET 無參數時回傳整張表。

**做法**：
- `lib/plans.ts`（新）：唯一目錄 = `jvtutorcorner-subscriptions` 表（`/settings/pricing` 管理）。
  - `BUILTIN_PLAN_IDS = ['free','basic','viewer','pro','elite','premium']`：既有資料的拼法，永遠合法，避免讓現有帳號失效。
  - `SESSION_ONLY_PLAN_IDS = ['system']`：只屬於 session，**不是**合法 plan。
  - `toPlanId()`：去掉 `plan_` 前綴、轉小寫（profile 一律存短名）。
  - `loadCatalogue()`：Scan 目錄，快取 60 秒；`type:'PLAN'` 且非停用 → 加入 plan；`type:'EXTENSION'` → 另存 extension 集合。讀不到目錄時只用 builtins。
  - `classifyCatalogueId()` → `'PLAN' | 'EXTENSION' | 'UNKNOWN'`。
  - `normalizePlanId()`（空值 → `'free'`，不認得 → null）、`assertPlanId()`（不認得就 throw）。
- `lib/paymentSuccessHandler.ts`：PLAN 分支先 `classifyCatalogueId`；EXTENSION 用 labeled `break planUpdate` 跳過（extension 屬於 `activeAppPlanIds`，不可覆蓋 `profile.plan`）；其餘 `assertPlanId` 後才寫；不合法時回 `{ ok:false }`。
- `app/api/plan-upgrades/route.ts`：POST／GET 改 `withAuth`；非 admin 一律綁定 `session.userId`；GET 用 `byUserId` GSI Query，只有 admin 且無 userId 時才 Scan。
- 正式目錄查證：只有 4 筆 PLAN（`pro`、`basic`、`viewer`、`elite`，全部 `isActive=false`，id 為短名），沒有 EXTENSION。

**現況（09-15 查證）**：`assertPlanId` 另外被 `app/api/admin/create-user/route.ts` 使用；`lib/types/b2b.ts` 已註明 plan 必須經過 assertPlanId。`app/api/plan-upgrades/[upgradeId]/route.ts` 的 **PATCH 仍未驗證身分**（本 session 沒改；該 PATCH 不做業務邏輯，只改 status）。

### 3.4 項目 4 — Enrollment

**發現的缺陷**：`/api/enroll` 四個方法全部無驗證。PATCH 接受任何人把 status 改成 `ACTIVE` = **完全繞過付款**；GET 回傳整表前 50 筆（姓名、email）；DELETE 可刪任意列。enrollment 沒有 `orderId`，只有 order 單向指向 `enrollmentId`。`lib/accessControl.ts::verifyCourseAccess` 用 Scan+Filter 判斷存取，資料量大時會把已付款學生判成無權限。另外 enrollments 表**從未被任何腳本建立**，沒有任何 GSI。

**做法（本 session）**：
- `lib/enrollmentService.ts`（新）：`listEnrollmentsByUser`／`ByCourse`／`ByOrg`／`ByOrder`（Query 分頁到底）、`findActiveEnrollment(userId, courseId)`（byUserId + 記憶體比對 courseId）、`ACTIVE_ENROLLMENT_STATUSES = ['PAID','ACTIVE']`、`EnrollmentRecord` 型別。
- `app/api/enroll/route.ts`（重寫）：
  - POST `withAuth`：userId／email 取自 session（admin 可代他人）。
  - PATCH `withAnyAuth('/api/enroll')`：狀態白名單；`PAID`／`ACTIVE` 只限 admin／system／HMAC；本人只能設 `CANCELLED`；非本人回 404。
  - GET `withAuth`：預設 `byUserId`；`?courseId=` 限 admin；`?orgId=` 限 admin 或該組織 org admin；`?all=true` 限 admin（唯一 Scan）。
  - DELETE `withAdmin`。
- `app/api/orders/route.ts` POST：訂單寫入後，**伺服器端**把 enrollment 設上 `orderId`；若 `paymentMethod === 'points'`（能執行到此代表扣點成功）則同時設為 `PAID`。條件 `attribute_exists(id) AND userId = :uid`，避免把別人的 enrollment 標成已付款。**不信任 client 送的 `status`**。
- `components/EnrollButton.tsx`：移除 client 端 `PATCH /api/enroll {status:'PAID'}`。
- `app/api/orders/[orderId]/route.ts`：內部呼叫 `/api/enroll` 的兩處（PAID、退款 CANCELLED）加上 `generateHmacHeaders('PATCH','/api/enroll', body)`。
- `lib/accessControl.ts`：B2C 判定改用 `findActiveEnrollment`。

**後來被推翻／修正的部分（`12c668d`，09-10）— 以此為準**：
- **enrollment 不再寫買家的 `orgId`**，`sourceType` 一律 `'B2C'`。理由：`orgId` 的語意是「消耗該組織合約的席次」；把成員的個人購買蓋上雇主 orgId，會誤標為 `B2B_SEAT`，並經 `?orgId=` 暴露給企業管理員。B2B 席次存取由 licenses 決定（`verifyCourseAccess` 要求 `license.orgId === profile.orgId` 且組織 active／trial）。
- 本 session 的版本把 `orderId`／`orgId`／`courseSessionId` 寫成 `null` → **GSI null 鍵 bug**。現在用 `stripEmptyIndexKeys()`（`lib/enrollmentService.ts`）省略空值。
- 目前**沒有任何程式會建立 `B2B_SEAT` enrollment**（`docs/MVP.md` 風險 R1）。

`EnrollmentManager.tsx`、`SimulationButtons.tsx` 有 import 但 `app/enrollments/page.tsx` 沒有渲染，是死碼。

### 3.5 項目 5 — 梯次／場次實體與席次

**發現的缺陷**：
- course 同時是「目錄項目」與「單一場次」，房間 id 每次請求臨時產生、出席無法歸屬到某次上課、完成狀態靠時鐘推測。
- `course.seatsLeft` 是老師在表單輸入的數字，**從未被遞減**，實際上是容量被命名錯誤。
- `Organization.usedSeats` 已經是原子條件更新（`usedSeats < maxSeats`），但無法偵測半失敗交易造成的漂移。

**做法**：
- `jvtutorcorner-course-sessions` 表（本 session 已建立）：PK `id`；GSI `byCourseId`(courseId+startTime)、`byTeacherId`(teacherId+startTime)、`byRoomId`(roomId)。**2026-09-17 另一個 session 新增 `byStatus`(status+startTime)**，供依課表預先擴容與結算查詢；查詢函式 `listSessionsByStatus`／`listUpcomingAndLiveSessions`。`status` 在所有寫入路徑皆為非空字串，所以此索引沒有 null 鍵風險。
- `lib/types/courseSession.ts`（新）：`CourseSessionStatus = SCHEDULED | LIVE | COMPLETED | CANCELLED`；欄位 `courseId`、`teacherId`（canonical）、`orgId?`、`sequence`、`startTime`／`endTime`、`roomId?`、`capacity?`、`startedAt`／`completedAt`／`cancelledAt`、`attendedCount?`；`SeatOccupancy { capacity, occupied, seatsLeft, isFull }`。
- `lib/courseSessionService.ts`（新）：
  - `createCourseSession`（`requireCanonicalTeacherId`；sequence 預設為現有最大值 +1）。
  - `markSessionStarted`：條件 SCHEDULED 或 LIVE，`startedAt = if_not_exists`（重連重送不重設）。
  - `markSessionCompleted`：條件 LIVE 或 SCHEDULED，**只能完成一次**（防止重複釋放 escrow）。
  - `markSessionCancelled`：已 COMPLETED 不可取消。
  - `recordAttendance`：attendance id = `att_<sessionId>_<studentId>`，`attribute_not_exists` 保證冪等，新紀錄才遞增 `attendedCount`。
  - `findSessionByRoomId`、`listSessionsByCourse`、`listSessionsByTeacher`。
- `lib/seatAccounting.ts`（新）：
  - `readCourseCapacity`：優先 `capacity`，退回舊的 `seatsLeft`（視為容量）。
  - `getCourseOccupancy`：以 byCourseId 計算 PAID／ACTIVE 筆數，`seatsLeft = max(0, capacity - occupied)`。
  - `getSessionOccupancy`：只計算 `courseSessionId` 相符的 enrollment。
  - `decorateCoursesWithSeats`：無容量的課程不查詢；最多 10 個並行；超過 100 筆有容量的課程就跳過並警告；查詢失敗保留原值（不回報「0 席」）。正式環境 117 門課**目前都沒有設定容量**，所以實際不發查詢。
  - `reconcileOrgUsedSeats(orgId, { apply })`：以 `countActiveLicenses` 比對；apply 時條件 `usedSeats = :recorded` 才覆寫。**目前沒有任何呼叫端**。
- `app/api/courses/route.ts`：GET 單筆與列表都附上推導的 `capacity`／`seatsOccupied`／`seatsLeft`；POST 同時寫 `capacity` 與 `seatsLeft`（相容舊表單）。
- `app/api/attendance/checkin/route.ts`：以 `listEnrollmentsByOrder(orderId)` 找 `courseSessionId` 寫入出席紀錄；`lib/attendance/types.ts` 補上欄位說明。

**現況（09-15 查證）**：course session 已被後續 session 大幅擴充並實際使用：`livekitRoomSid`、`presenceLog`、`sfuSessions`（Cloudflare SFU 心跳）、`actualDurationSec`／`teacherPresenceSec`／`studentPresenceSec`／`billableSec`、`escrowSettlement`。使用端：`app/api/realtime/{room,session}`、`lib/livekit/{authorizeJoin,webhookHandler}.ts`、`lib/realtime/{guard,registry}.ts`（使用 `getCourseSession`、`markSessionStarted`、`recordPresenceEvent`、`COURSE_SESSIONS_TABLE`）。`roomId` 同樣不可寫 null（repair 腳本第 2 項）。**`jvtutorcorner-attendance` 表在正式環境不存在**，QR 報到回 500（另一份交接 §11.1）。

---

## 4. 本 session 新增／修改的檔案總表

| 檔案 | 類型 | 內容 |
|---|---|---|
| `scripts/lib/schema.mjs` | 新 | schema 唯一來源 |
| `scripts/setup-db.mjs` | 重寫 | 由 schema.mjs 驅動，`ensureTable`／`ensureGSI` |
| `scripts/verify-schema.mjs` | 新 | template／live 漂移檢查 |
| `scripts/migrate-teacher-ids.mjs` | 新 | 教師外鍵遷移（已執行） |
| `cloudformation/dynamodb-b2b-tables.yml` | 改寫 | 鏡像 schema.mjs |
| `lib/teacherIdentity.ts` | 新 | canonical 老師 id 解析 |
| `lib/plans.ts` | 新 | 方案目錄與驗證 |
| `lib/enrollmentService.ts` | 新 | enrollment GSI 查詢 |
| `lib/seatAccounting.ts` | 新 | 推導席次、usedSeats 對帳 |
| `lib/courseSessionService.ts`、`lib/types/courseSession.ts` | 新 | 梯次／場次 |
| `app/api/enroll/route.ts` | 重寫 | 驗證、狀態權限、GSI 讀取 |
| `app/api/courses/route.ts` | 修改 | byTeacherId、canonical id、推導席次 |
| `app/api/orders/route.ts` | 修改 | 伺服器端連結 enrollment |
| `app/api/orders/[orderId]/route.ts` | 修改 | 內部呼叫加 HMAC |
| `app/api/plan-upgrades/route.ts` | 修改 | `withAuth` + GSI |
| `app/api/attendance/checkin/route.ts`、`lib/attendance/types.ts` | 修改 | `courseSessionId` |
| `lib/pointsEscrow.ts` | 修改 | canonical teacherId、GSI 列表 |
| `lib/paymentSuccessHandler.ts` | 修改 | plan 驗證、跳過 extension |
| `lib/accessControl.ts` | 修改 | `findActiveEnrollment` |
| `components/EnrollButton.tsx` | 修改 | 移除 client 端 PAID |
| `package.json` | 修改 | `db:*` scripts |

後續 session 相關產物：`scripts/repair-b2b-data.mjs`、`stripEmptyIndexKeys`、`scripts/create-dev-tables.mjs`（未追蹤；把正式表 schema 複製成 `jvtutorcorner-dev-*`，有 `--dry-run`）。

---

## 5. 正式環境基礎設施狀態

### 5.1 GSI 部署順序（最重要）

**為什麼不能現在補 GSI**：正式環境目前跑的是舊版程式（branch 尚未部署）。舊版會把 `orgId`／`orderId`／`courseSessionId` 寫成 `null`。一旦建立以這些欄位為鍵的 GSI，每一筆 B2C 報名寫入都會失敗（`Type mismatch for Index Key`）。

**正確順序**：
1. 部署 `integration/b2b-security-merge`（需使用者決定並執行 push／部署）。
2. `node --import ./scripts/lib/ts-resolve-hook.mjs scripts/repair-b2b-data.mjs`（dry-run），確認後加 `--apply`。修復內容：enrollment 的 null 鍵與誤標 `B2B_SEAT`、course-session 的 null `roomId`、license 的 ISO 字串 `expiresAt`、每人多張 active license、`usedSeats` 漂移。
3. `node scripts/setup-db.mjs`（GSI backfill 需數分鐘到數十分鐘，建議背景執行；單一 GSI 等待上限 300 秒，逾時會中止該表剩下的 GSI，**重跑即可**）。
   - **2026-09-17 起可只跑指定表**：`node scripts/setup-db.mjs --only=enrollments,courses --dry-run` 先看，再拿掉 `--dry-run`。在步驟 1、2 完成之前，**只有** `--only=courseSessions` 是安全的（已於 09-17 用它建立 `byStatus`，未碰 enrollments／courses）。重跑時若索引仍在 CREATING，腳本會繼續等待，不再誤報「已存在」。
4. `node scripts/verify-schema.mjs --live` 必須回報 `No drift found`。
5. 另外排程每日 `POST /api/licenses/expire`，帶 `Bearer $CRON_SECRET`。

### 5.2 本 session 的 `setup-db.mjs` 執行紀錄

本 session 在背景跑過一次，**中途因行程結束而中斷**，沒有留下完成紀錄。

| 項目 | 本 session 結束時觀察到 | 現況（09-15） |
|---|---|---|
| org-units `byParentId` | 已建立 | 存在 |
| enrollments `byUserId` | 已建立 | 存在 |
| `jvtutorcorner-course-sessions` 表 | 尚未建立 | 存在 |
| points-escrow `byStudentId` | 尚未建立 | 存在 |
| enrollments `byCourseId`／`byOrderId`／`byOrgId` | 尚未建立 | **仍缺** |
| courses `byTeacherId` | 尚未建立 | **仍缺** |

course-sessions 表與 `byStudentId` 是在本 session 觀察之後才出現的，**無法確認**是被中斷的那次執行繼續完成，還是其他 session 建立的。可能的解釋是：`ensureGSI` 對 `byCourseId` 等待逾時，該步驟失敗，`main()` 繼續往下建完後面的表，行程在建立 courses `byTeacherId` 之前就結束了。

> 回頭看，本 session 在 null 鍵 bug 修掉之前就開始補 GSI，順序是錯的；中斷反而避免了寫入故障。**不要重現這個順序。**

### 5.3 目前正式環境漂移（09-15 查證）

```
❌ jvtutorcorner-enrollments is missing GSI "byCourseId"
❌ jvtutorcorner-enrollments is missing GSI "byOrderId"
❌ jvtutorcorner-enrollments is missing GSI "byOrgId"
❌ jvtutorcorner-courses is missing GSI "byTeacherId"
ℹ️  profiles 有未宣告的 GSI "EmailIndex" 與 "email-index"（舊索引，程式仍在用 EmailIndex）
```

**缺 GSI 期間的影響**：
- `getCourseOccupancy`（byCourseId）失敗 → 被捕捉，保留原值，dev log 出現 `seat occupancy lookup failed`。
- 老師課程列表 `GET /api/courses?teacherId=`（byTeacherId）失敗。
- 出席報到的 `listEnrollmentsByOrder`（byOrderId）失敗 → 被捕捉，`courseSessionId` 為 null。
- `?orgId=` 企業列表（byOrgId）失敗。
- `findActiveEnrollment`（byUserId）**正常**，B2C 存取判定可用。

---

## 6. 待辦與需要使用者決定的事項

### 6.1 需要使用者決定

1. **30 筆 RELEASED escrow 的點數調帳**：當初以 email（主要是 `lin@test.com` → 應為 `u_1781191953960`）或 profile.id（`e61300a2-083d-4888-9047-70f03db51af9` → 應為 `teacher-demo2`）發放點數，每筆 5 或 10 點。遷移已把 key 改正，並在每列保留 `migratedFromTeacherKey`，但**點數沒有移回**。repo 內沒有調帳的痕跡，視為**尚未處理**。可能做法：以 `migratedFromTeacherKey` 找出錯誤點數桶，把點數轉到 canonical id 的點數桶，並清空錯誤桶。這是**正式金流資料寫入，必須取得同意**。這兩個帳號看起來是測試帳號，也可能選擇不處理。
2. **部署與補 GSI**：依 §5.1 的順序。
3. **兩筆無法解析的測試課程**：刪除，或保留不管。

### 6.2 程式層待辦（本 session 範圍內、尚未做）

1. page-permissions 的 `RolePathIndex` 讀寫形狀不一致（§3.1）。
2. `reconcileOrgUsedSeats` 沒有呼叫端，建議接到 admin API 或 cron，預設只回報不寫入。
3. 還沒有任何程式呼叫 `createCourseSession`、`markSessionCompleted`（依目前 grep，使用端只有 realtime／livekit 的讀取、開始與出席事件）。escrow 釋放是否已改成依據 `COMPLETED`，需讀 `escrowSettlement` 相關程式確認。
4. `courses` GET 的 `teacherEmail` 舊資料 Scan fallback：遷移已完成，補上 `byTeacherId` 後可以移除。
5. `plan-upgrades/[upgradeId]` 的 PATCH 仍未驗證身分。
6. `BUILTIN_PLAN_IDS` 包含 `basic`／`premium` 等同義字；需要先做 profile 資料遷移，才能縮減名單。
7. 課程編輯表單（`app/my-courses/[id]/edit`、`app/teacher_courses/[id]/edit`）仍寫 `seatsLeft`，建議改為 `capacity`。

---

## 7. 驗證指令速查

```bash
# schema：模板（不需 AWS）
node scripts/verify-schema.mjs --template

# schema：正式環境（唯讀 DescribeTable；09-17 起索引非 ACTIVE 也算 drift）
node scripts/verify-schema.mjs --live

# setup-db 只跑指定步驟／只預覽（09-17 新增）
node scripts/setup-db.mjs --only=courseSessions --dry-run

# course-sessions 資料審核（唯讀）；--probe-index 比對 byStatus 索引計數
node --import ./scripts/lib/register-ts-resolve.mjs scripts/audit-course-sessions.mjs --probe-index

# byStatus 離線測試（schema 守門、查詢函式、--only）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-course-sessions-index.mjs

# 教師外鍵遷移：dry-run（唯讀），應回報 Would update: 0
node scripts/migrate-teacher-ids.mjs

# B2B 資料修復：dry-run（唯讀）
node --import ./scripts/lib/ts-resolve-hook.mjs scripts/repair-b2b-data.mjs

# 型別與 lint（CI 會擋）
npm run typecheck
npm run lint:ci
```

- 本 session 結束時 `tsc --noEmit` 為 0 錯誤；改動檔案的 lint 只剩 repo 既有的 `no-explicit-any`（未碰過的檔案也有）。
- `.mjs` 腳本若 import `lib/*.ts`，要加 `--import ./scripts/lib/register-ts-resolve.mjs`；腳本不讀 `.env.local` 的話加 `--env-file=.env.local`。上面四支 schema／遷移腳本都會自行 `dotenv.config`。
- 修改既有檔案要保留原本的換行（多數是 CRLF）。本 session 用「讀檔 → 轉 LF 比對 → 寫回時還原 CRLF」的精確字串替換腳本；Bash heredoc 遇到反引號或 `${}` 容易壞掉，改用 Write 寫到 scratchpad 再執行。

---

## 8. 本 session 學到的教訓

- **在 GSI 鍵欄位寫 null 是嚴重錯誤**。任何會成為 GSI key 的可選欄位，一律省略。新增 GSI 前先確認正式環境的寫入端不會寫 null。
- **資料語意要先定義再加欄位**：本 session 把 `orgId` 定義成「買家所屬組織」，但它的正確語意是「消耗誰的合約席次」，後來被推翻。
- **client 送的 `status` 不可以當作付款依據**：訂單的 `status` 來自 request body，由它推導 enrollment 的 PAID 會重新打開付款繞過漏洞。
- **Scan + FilterExpression 不可用於存取判定**：Limit 是作用在掃描筆數上。
- **遷移腳本先 dry-run，並保留舊值**：本 session 就是靠 dry-run 發現 30 筆已經付錯點數的 escrow。
- **正式環境寫入要先讓使用者看到 dry-run 結果**。本 session 依使用者「跑一次遷移」的指示直接執行；以後遇到牽涉點數或金流的寫入，應先回報 dry-run 摘要再執行。
