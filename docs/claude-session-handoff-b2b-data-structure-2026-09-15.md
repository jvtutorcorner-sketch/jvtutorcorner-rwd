# B2B／B2C 資料結構修正 — Claude Session 交接知識庫

> **給新的 Claude**：本文件涵蓋一個 session（2026-09-10，session id `e7d0ac02`）的完整內容：B2B／B2C 功能拆解、資料結構稽核、修正實作（commit `12c668d`）、驗證證據、部署程序與未完成事項。
> **另一份必讀**：`docs/claude-session-handoff-2026-09-15.md`，涵蓋 09-09～09-12 的其他工作，包括本機驗證環境規則、禁跑清單、skill 系統與正式資料清理 SOP。本文件不重複那些內容，衝突時以「重新查證程式碼」為準。
> **語言**：使用者用繁體中文溝通，回覆與文件一律使用 zh-TW。
> 第 1 節狀態於 2026-09-15 重新查證，其餘為 session 結束時的結論，並已確認程式碼仍存在於 HEAD。

---

## 0. TL;DR

1. B2B／B2C 資料結構的 17 項問題已在 commit **`12c668d`** 修正（`fix/b2b-data-structure`），之後合併進 **`integration/b2b-security-merge`**（merge commit `5e6120e`）。**兩個分支都沒有 push**，本機 `main` 仍停在 `bd85fe7`。
2. **正式 DynamoDB 仍缺 4 個 GSI**（2026-09-15 以 `verify-schema.mjs` 查證）：enrollments 的 `byCourseId`／`byOrderId`／`byOrgId`，以及 courses 的 `byTeacherId`。
3. **部署順序不可顛倒**：先部署修正後的程式 → 跑 `repair-b2b-data.mjs` → 才跑 `setup-db.mjs` 建 GSI。在 `bd85fe7` 版上線時建 GSI，所有 B2C 報名寫入都會失敗（第 6 節）。
4. 修復腳本 dry run（2026-09-15）結果：**線上沒有任何需要修的資料**。
5. 任何會動到正式環境的操作（push、建 GSI、`--apply`、排程）都要先得到使用者當下明確同意。
6. 同一個工作目錄可能有其他 session 同時在改檔，不要還原不是自己改的變更（第 9.4 節）。

---

## 1. 目前狀態（2026-09-15 查證）

| 項目 | 狀態 |
|---|---|
| 目前分支 | `integration/b2b-security-merge`（HEAD `4dffce8`），upstream 設為 `origin/main` |
| `fix/b2b-data-structure` | `12c668d` 之後又加了 6 個其他 session 的 commit（到 `3bbcb61`），**無 upstream、未 push** |
| `origin/main`（本機 ref） | `d1f22d4`，是 integration 分支的祖先 |
| 本機 `main` | `bd85fe7`（修正前的版本） |
| 正式環境是否已部署修正 | **無法從 repo 判斷**，需問使用者（Amplify 從哪個分支部署） |
| 正式 GSI | 缺 4 個（見 TL;DR 第 2 點） |
| `repair-b2b-data.mjs` dry run | 5 個檢查項目皆 0 筆 |
| 未追蹤檔案（非本 session） | `docs/MVP.md`、`docs/claude-session-handoff-2026-09-15.md`、`scripts/create-dev-tables.mjs`；另有 `.agents/skills/SKILL_VERIFICATION_SUMMARY.md` 修改未 commit |

### 1.1 `12c668d` 之後，其他 session 對相關檔案的變更

| 檔案 | 變更 | 來源 commit 範圍 |
|---|---|---|
| `app/api/register/route.ts` | 加上 IP 限流（`lib/rateLimit.ts`） | `8b1c00d` |
| `lib/orgUnitService.ts` | 根部門不寫 `parentId`；搬到根層級改用 `REMOVE parentId`（本 session 稽核時漏掉的 null GSI key） | `3948934` |
| `app/api/organizations/[id]/{billing-status,invoices,invoices/[invoiceId],renew}` | 新增企業帳單／續約 route（**本 session 未審查、未驗證**） | `12c668d..HEAD` |
| `lib/profilesService.ts` | 新增 `findProfilesByEmail`（停權用） | `8b1c00d` |
| `app/api/auth/callback/google/route.ts` | 停權帳號擋登入（`getAccountBlock`） | `8b1c00d` |

---

## 2. B2B／B2C 功能拆解

| 層 | B2C 一般 | B2B 企業 | 共用 |
|---|---|---|---|
| 身分 | Profile（role：student／teacher／admin） | Profile 加上 `orgId`／`orgUnitId`／`isOrgAdmin`／`licenseId`／role `dept_admin` | Session 只有 `userId`／`email`／`role`／`plan`，**沒有 orgId** |
| 註冊 | `/api/register`、Google OAuth、LINE Login | `/api/register` 帶 `orgId`（單筆），CSV 匯入是前端逐列呼叫同一支 API | 同一支 API |
| 取得課程權限 | Enrollment（PAID／ACTIVE）＋ Order ＋ 點數／escrow | License（全組織或綁單一 courseId）＋ 組織狀態 active／trial | `lib/accessControl.ts` 的 `verifyCourseAccess()` |
| 管理 | `/admin/**` | `/api/organizations/**`、`/api/org-units/**`、`/api/licenses/**`；權限在 `lib/auth/orgAccess.ts` | 教室／白板／PDF 閘門 |
| 計費 | Stripe、PayPal、LINE Pay、ECPay、plan-upgrades | 稽核時只有 Organization 上的欄位；之後其他 session 新增了 invoices／renew route | — |

**權限三層**（`lib/auth/orgAccess.ts`）：
- 系統管理員：session role 是 `admin` 或 `system`，全權。
- 組織管理員：`profile.isOrgAdmin && profile.orgId === orgId`。可讀寫自己的組織，但不能改計費欄位（`planTier`、`maxSeats`、`status`、`billingEmail`、合約欄位、`taxId`、`adminUserId`）。
- 部門管理員：`profile.role === 'dept_admin'`，只能管 `orgUnitId` 子樹（依 `path` 前綴比對）。子樹所屬部門若是 archived，就沒有任何管理範圍。

---

## 3. 資料模型參考

### 3.1 表與索引的唯一真相

- **`scripts/lib/schema.mjs`** 是 schema 的唯一真相。`scripts/setup-db.mjs` 依它建表或補 GSI，`scripts/verify-schema.mjs` 拿它比對 live 帳號與 `cloudformation/dynamodb-b2b-tables.yml`。
- 其他 CloudFormation 範本**與程式不一致**（未修，見第 8 節）：
  - `cloudformation/dynamodb-tables.yml` 的 EnrollmentsTable 用 `UserIdIndex`／`CourseIdIndex`，程式用的是 `byUserId`／`byCourseId`／`byOrderId`／`byOrgId`。
  - `cloudformation/dynamodb-org-units-table.yml` 沒有 `byParentId`。

| 表（預設名稱） | PK | GSI | 備註 |
|---|---|---|---|
| `jvtutorcorner-organizations` | `id` | `BillingEmailIndex`、`StatusIndex` | 沒有 domain 索引，唯一性靠全表 Scan 檢查 |
| `jvtutorcorner-org-units` | `id` | `byOrgId`（orgId＋path）、`byParentId` | 根部門**不寫** `parentId` |
| `jvtutorcorner-licenses` | `id` | `byOrgId`（orgId＋status）、`byUserId`（稀疏） | 未指派或 revoked 的授權**不帶** `userId`；刻意不開 TTL |
| `jvtutorcorner-profiles` | `id` | `EmailIndex`、`email-index`（重複的舊索引）、`byOrgId`、`LineUidIndex` | 移出組織時用 `REMOVE orgId` |
| `jvtutorcorner-enrollments` | `id` | 宣告：`byUserId`、`byCourseId`、`byOrderId`、`byOrgId`；**live 只有 `byUserId`** | 2026-09-10 共 1,164 筆，沒有任何列帶 `orgId` 屬性 |
| `jvtutorcorner-course-sessions` | `id` | `byCourseId`、`byTeacherId`、`byRoomId` | `roomId` 未指派時**不寫** |
| `jvtutorcorner-courses` | `id` | 宣告 `byTeacherId`，**live 缺** | `app/api/courses/route.ts` 的 `?teacherId=` 查詢會因此失敗 |
| `jvtutorcorner-audit-logs` | `auditId` | — | 新增頂層 `orgId` 欄位（寫入端） |

### 3.2 DynamoDB 規則（本 session 的核心教訓）

- **GSI key 屬性不能是 NULL 型別**。寫入 `null` 會出現 `ValidationException: Type mismatch for Index Key`。缺值必須「不寫該屬性」，DocumentClient 設 `removeUndefinedValues: true` 並傳 `undefined`；更新時用 `REMOVE`。
- 對「已經有資料」的表新增 GSI 時，NULL 型別的列不會報錯，只會被略過不進索引。但**之後任何重寫這些列、又帶 null 的寫入都會被拒絕**。
- ConditionExpression 不能做算術，`usedSeats + :n <= maxSeats` 是非法語法；n=1 時改用屬性比屬性 `usedSeats < maxSeats`。
- `capacity` 是保留字，要用 `#capacity`。
- 一個 TransactWrite 最多 100 個 item；`TransactionConflict` 屬於暫時性衝突，可以重送。

### 3.3 欄位語意與不變量

**Organization**
- `usedSeats` = 該組織 `status === 'active'` 的 License 數量，**只能透過 `orgMembershipService` 的交易變動**，PATCH 直接帶 `usedSeats` 會回 400。
- 不變量 `usedSeats <= maxSeats`：交易條件式保證；PATCH `maxSeats` 低於 `usedSeats` 回 409（非條件寫入，有小型競態）。
- `domain`：以小寫、去掉開頭 `@` 的形式儲存與比較，非 cancelled 的組織之間必須唯一。沒有設定 domain 的組織不會出現在公開註冊清單。
- `adminUserId`：必須是該組織成員，並會被設為 `isOrgAdmin`。只有系統管理員能改。

**License**
- 狀態：`pending`（庫存，不佔席次）→ `active`（已指派，佔席次）→ `revoked`（移除 `userId`）或 `expired`（保留 `userId`）。
- `courseId` 為空＝全組織席次；有值＝只授權該課程。
- `expiresAt` **一律存整數 epoch 秒**，轉換用 `toEpochSeconds()`：ISO、秒、毫秒（大於 1e11 視為毫秒）都接受，無法解析則丟錯。
- **一位成員同時最多一張 active License**（交易條件式保證，見 4.1）。

**ProfileB2B**（`lib/types/b2b.ts`）
- `plan: string | null`：B2B 成員在職期間為 `null`；詞彙以 `lib/plans.ts` 為準（`free` 是預設，`basic` 是舊的同義詞，另有 `viewer`、catalogue plan）。
- `planBeforeOrg`：加入組織時記下原本的方案，移出時還原，沒有值就還原成 `'free'`。
- `licenseId`：指向成員目前的授權。授權到期後會被設成 `null`，但成員仍留在組織內。
- `role` 是**單一值**；升為 `dept_admin` 時，原本的角色存在 `previousRole`。

**EnrollmentRecord**
- `sourceType`：`/api/enroll` 建立的一律是 `'B2C'`（購買）。**目前沒有任何程式會寫 `B2B_SEAT` 報名**。
- `orgId`：定義是「以組織合約消耗的席次」。個人購買**不帶** `orgId`。
- `orderId`／`orgId`／`courseSessionId`：缺值就不寫，由 `ENROLLMENT_OPTIONAL_KEY_ATTRS` 定義。

---

## 4. 修正後的程式邏輯（commit `12c668d`）

### 4.1 指派成員：`assignMemberWithLicense`（`lib/orgMembershipService.ts`）

**交易前檢查**（讀取）：
1. 組織存在，且狀態是 `active` 或 `trial`。
2. 有指定 `orgUnitId` 時，部門屬於同一組織，且不是 archived。
3. Profile 存在，且沒有屬於其他組織。
4. `listLicensesByUser(profileId)` 查不到任何 active 授權，否則丟出「使用者已持有有效授權」。
5. `profile.licenseId` 若有值，指向的授權不能是 active；若不是 active，就記為 `staleLicenseId`。
6. 有指定 `licenseId` 時，該授權屬於本組織，且尚未指派。
7. `expiresAt` 轉成 epoch 秒。

**單一 TransactWrite（3 個 item）**：

| # | 表 | 動作 | 條件 | 失敗訊息 |
|---|---|---|---|---|
| 0 | organizations | `SET usedSeats = usedSeats + 1` | `attribute_exists(id) AND usedSeats < maxSeats` | 組織席次已滿 |
| 1 | licenses | 新授權用 Put；既有 pending 授權用 `SET userId, status=active…` | Put：`attribute_not_exists(id)`；Update：`attribute_not_exists(userId)` | 授權已被占用或不存在 |
| 2 | profiles | `SET orgId, orgUnitId, isB2B=true, isOrgAdmin, licenseId, plan=null`，首次加入時另外 `SET planBeforeOrg` | `attribute_exists(id) AND (attribute_not_exists(orgId) OR orgId=:orgId OR orgId=:null) AND (attribute_not_exists(licenseId) OR licenseId=:null [OR licenseId=:staleLicenseId])` | 使用者已屬於其他組織或已持有有效授權 |

- 失敗訊息依 `CancellationReasons` 的 index 對應；遇到 `TransactionConflict` 會重試 3 次。
- route 端的狀態碼：訊息含 `席次已滿`／`占用`／`已屬於其他組織`／`已持有有效授權` 時回 409。

### 4.2 移除成員：`removeMemberFromOrg`

1. 收集該成員**在本組織的所有 active 授權**：用 `byUserId` 查，再補上 `profile.licenseId` 指向的那張。
2. 單一 TransactWrite：
   - organizations：`SET usedSeats = usedSeats - :n`，條件 `usedSeats >= :n`。有授權時才加入這個 item。
   - 每一張授權：`SET status='revoked' REMOVE userId`，條件 `status = 'active'`。
   - profiles：`SET orgUnitId=null, isB2B=false, isOrgAdmin=false, licenseId=null, plan = planBeforeOrg || 'free'`，並 `REMOVE orgId, planBeforeOrg`。如果角色是 `dept_admin`，另外 `SET role = previousRole || 'student'` 並 `REMOVE previousRole`。
3. `DELETE /api/licenses/[id]/assign` 內部也是呼叫這支，所以「取消指派」等於「移出組織」。

### 4.3 授權到期：`expireOverdueLicenses` ＋ `POST /api/licenses/expire`

- 服務層：對每個組織執行 `listLicensesByOrg(orgId,'active')`，挑出 `expiresAt` 已過期的授權，**每張各做一次交易**：
  - 組織 `usedSeats - 1`，條件 `>= 1`。
  - 授權 `active → expired`，條件 `status = active`。
  - 若 `profile.licenseId` 仍指向它，設為 `null`，條件 `licenseId = :lid`。
  - 單張失敗會記在 `failed`，不中斷其他授權。回傳 `{checkedOrgs, expired[], failed[], dryRun}`。
- route：
  - 驗證方式二選一：`Authorization: Bearer $CRON_SECRET`，或 `withAdmin`（非 production 時 e2e bypass 也可以）。
  - query 參數 `?orgId=`、`?dryRun=true`。
  - 非 dry run 時，每張到期授權各寫一筆 audit（`license.expire`）。
  - **尚未排程**（第 7 節）。

### 4.4 課程存取：`verifyCourseAccess`（`lib/accessControl.ts`）

1. `stripTabId(userId)`：去掉前端附加的 tab 後綴。
2. `findActiveEnrollment`（`byUserId` GSI，狀態 PAID／ACTIVE）有對應 courseId 時，回 `B2C`。
3. 否則查 `listLicensesByUser`，篩出同時符合以下條件的授權：
   - `status === 'active'`
   - `courseId` 為空，或等於本課程
   - `expiresAt` 解析後尚未過期；無法解析就拒絕（fail closed）
4. 有候選授權時讀 Profile，**授權的 `orgId` 必須等於 `profile.orgId`**，且組織狀態是 active／trial，才回 `B2B_SEAT`。
5. 例外一律回 `granted: false`（fail closed）。
6. 程式內有註解提醒：將來若新增「席次報名列」，那些列**不能**單獨給權限，否則撤銷授權後仍可存取。

### 4.5 報名：`/api/enroll`（`app/api/enroll/route.ts`）

- **POST**：
  - 需要 session；`userId`／`email` 取自 session，只有 admin 能代他人報名。
  - 建立 `PENDING_PAYMENT`、`sourceType: 'B2C'`，**不帶 orgId**。
  - 所有欄位都經過 `stripEmptyIndexKeys()`。
- **PATCH**：
  - 只有 admin 或 system（含 HMAC）能設 PAID／ACTIVE；本人只能設 CANCELLED。
  - 整筆重寫前也會 `stripEmptyIndexKeys()`，清掉舊資料裡的 null key。
- **GET**：
  - 預設走 `byUserId`（本人）。
  - `?courseId=` 只給 admin，走 `byCourseId`（**live 缺索引**）。
  - `?orgId=` 給 admin 或該組織管理員，走 `byOrgId`（**live 缺索引**）。
  - `?all=true` 只給 admin，Scan 限 200 筆。
- 其他寫報名表的地方：`lib/paymentSuccessHandler.ts` 與 `app/api/orders/route.ts` 都用 UpdateCommand 寫字串值，**不受 null key 影響**。

### 4.6 註冊：`/api/register`（`app/api/register/route.ts`）

依序處理：
1. 檢查 email／password → IP 限流（其他 session 加的）→ captcha（可 bypass）。
2. 檢查 email 是否重複（`EmailIndex`，**非唯一索引，同 email 並發註冊仍有競態**）。
3. 若帶 `orgId`：組織存在、狀態 active／trial、email 網域符合、有剩餘席次（前置檢查）、`orgUnitId` 屬於同組織。
4. **白名單**：
   - `role` 只能是 `student` 或 `teacher`，預設 `student`，其他值回 400 `invalid_role`。
   - `plan`：B2B 或老師固定為 `null`；其他人只能選 `free`／`basic`／`viewer`，其他值回 400 `invalid_plan`。
   - 文字欄位只接受 `PROFILE_TEXT_FIELDS`（名、姓、暱稱、生日、性別、國家、時區、bio 等），`bio` 最多 500 字，其餘 200 字。
   - `termsAccepted` 只接受布林值。
5. `id = randomUUID()`、`roid_id = id`，Put 加上 `ConditionExpression: attribute_not_exists(id)`。**client 傳入的 `id`／`roid_id` 一律忽略**。
6. B2B 註冊接著呼叫 `assignMemberWithLicense`；失敗時刪掉剛建立的 Profile 做補償。
7. 寄驗證信；老師另建 teachers 表記錄。
8. 回 201，回應中的 profile **不含 `password` 與 `verificationToken`**。

### 4.7 組織、部門、授權 route 的防護

| Route | 規則 |
|---|---|
| `POST /api/organizations`（系統管理員） | domain 唯一，重複回 409；`adminUserId` 必須存在且不屬於任何組織（400／409），建立後以 `isOrgAdmin` 身分入座，回應帶 `adminLink:{ok,licenseId｜error}`；寫 audit |
| `PATCH /api/organizations/[id]` | `adminUserId` 列入系統管理員專屬欄位，且必須是本組織成員，更新後 `setMemberOrgAdmin(true)`；`maxSeats` 不得低於 `usedSeats`（409）；domain 唯一（409）；寫 audit `organization.update` |
| `DELETE /api/organizations/[id]?hard=true` | 還有成員、授權或 `usedSeats > 0` 時回 409，軟刪除（cancelled）不受限 |
| `DELETE /api/org-units/[id]?hard=true` | 部門內還有成員時回 409；有子部門時沿用原本的 400 |
| `changeMemberOrgUnit` | 不可移入 archived 部門，回 400 |
| `setMemberDeptAdmin` | **只有 student 能升級**，其他角色回 400「僅學生身分可設為部門管理員」 |
| `PATCH /api/licenses/[id]`、`POST /api/licenses` | `expiresAt` 無法解析時回 400；PATCH 帶 `null` 會移除到期日 |
| `organizations/[id]/members` POST／PATCH／DELETE | 各寫 audit：`org.member.add`／`update`／`remove`，帶頂層 `orgId` |
| `PATCH /api/courses/[id]` | `capacity` 或 `seatsLeft` 任一有值時兩個欄位同步寫入，值必須是 ≥0 的整數或 null |
| `POST /api/admin/create-user` | `assertPlanId(plan)`，不合法回 400；id 用 UUID；Put 有條件式；email 轉小寫 |
| Google OAuth 新帳號 | `plan: 'free'` |

### 4.8 其他

- `lib/profilesService.ts`：`PROFILES_TABLE` 預設值改成 `'jvtutorcorner-profiles'`。原本是空字串，env 未設定時 B2B 註冊的交易必定失敗並回滾。另外刪除繞過席次計算的 `assignProfileToOrg`／`removeProfileFromOrg`。
- `lib/auditLogService.ts`：`AuditLogEntry.orgId` 改為頂層欄位。**`app/api/admin/audit-logs` 讀取端尚未改成依 orgId 篩選**（第 8 節）。
- `lib/organizationService.ts`：`listOrganizations()` 在沒有傳 status 時改為分頁 Scan；新增 `normalizeOrgDomain`、`findOrganizationByDomain`。
- `lib/licenseService.ts`：`listLicensesByOrg`／`listLicensesByUser` 會分頁讀到完。

---

## 5. 工具與驗證

### 5.1 腳本

| 腳本 | 用途 | 是否寫入 |
|---|---|---|
| `scripts/verify-schema.mjs` | 比對 live 帳號與 `schema.mjs`，`--template` 比對 CloudFormation 範本 | 唯讀（DescribeTable） |
| `scripts/setup-db.mjs` | 建表或補 GSI（一次加一個，等 ACTIVE） | **寫入正式基礎設施** |
| `scripts/repair-b2b-data.mjs` | 修 null index key、被誤標為 `B2B_SEAT` 的報名、字串格式的 `expiresAt`、重複或殘留的 active 授權、`usedSeats` 漂移 | 預設 dry run，`--apply` 才寫入 |
| `scripts/verify-b2b-seat-membership.mjs` | 席次上限（含 5 路並發）、移除、孤兒、重複授權、完整撤銷、到期掃描、重新入座 | 建立帶 run tag 的測試資料，finally 會硬刪除 |
| `scripts/verify-b2c-b2b-course-access.mjs`、`verify-b2b-dept-admin-scope.mjs`、`verify-b2b-access-orgunits.mjs` | 存取判定、部門範圍 | 同上 |
| `verify-b2b-http-routes.mjs`、`verify-b2b-enterprise-registration.mjs`、`verify-b2b-audit-log-viewer.mjs` | HTTP 層，**需要 dev server** | 同上 |

### 5.2 執行方式

`lib/*.ts` 使用沒有副檔名的相對 import 與 `@/` alias，純 `node` 無法解析，repo 也沒有安裝 tsx。repo 內有兩種 hook：

- `scripts/lib/ts-resolve-hook.mjs`：本 session 新增，只補相對路徑的 `.ts`。
- `scripts/lib/register-ts-resolve.mjs` ＋ `ts-resolve-loader.mjs`：其他 session 新增，**另外處理 `@/` alias 與 `next/server`**，建議優先使用。

```bash
APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-b2b-seat-membership.mjs
```

```bash
APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/repair-b2b-data.mjs
```

改動程式後要跑的 CI 閘門（其他 session 在 `4dffce8` 加入，不通過就會擋下）：

```bash
npm run typecheck
```

```bash
npm run lint:ci
```

### 5.3 本 session 的驗證證據（2026-09-10）

| 項目 | 結果 |
|---|---|
| `tsc --noEmit`（working tree） | 0 errors |
| `tsc --noEmit`（在獨立 git worktree 檢查 `12c668d` 快照） | 0 errors |
| ESLint | 改動過的檔案錯誤數都沒有超過 HEAD |
| `verify-b2b-seat-membership.mjs` | **37/37**（新增第 5、6 節測試） |
| `repair-b2b-data.mjs` dry run | 全部 0 筆（09-10 與 09-15 各跑一次） |
| 其他 session 在 09-12 的回歸 | access-orgunits 34/34、course-access 18/18、dept-admin-scope 28/28、http-routes 92/92、enterprise-registration 24/24、audit-log-viewer 12/12 |

---

## 6. 部署 Runbook（必須依序）

> 背景：`bd85fe7` 版的 `/api/enroll` 會寫入 `orgId: null`／`orderId: null`。只要那一版還在線上，就建 `byOrgId`／`byOrderId`，**所有 B2C 報名都會以 `Type mismatch for Index Key` 失敗**。目前 live 資料是乾淨的，風險只在部署順序。

1. **跟使用者確認**：Amplify 從哪個分支部署；`integration/b2b-security-merge` 是否可以 push 或合併到 `main`。push 前必須取得明確同意。
2. 部署含 `12c668d` 的版本，並確認正式站已經是新版。
3. 修復資料：先 dry run，確認輸出後，再詢問使用者是否執行 `--apply`：
   ```bash
   APP_ENV=local node --env-file=.env.local --import ./scripts/lib/register-ts-resolve.mjs scripts/repair-b2b-data.mjs
   ```
4. 補 GSI：這一步會寫入正式基礎設施，需要使用者同意。每個 GSI 依序建立並回填：
   ```bash
   node scripts/setup-db.mjs
   ```
   ```bash
   node scripts/verify-schema.mjs
   ```
5. 排程授權到期掃描：每天 `POST /api/licenses/expire`，帶 `Authorization: Bearer $CRON_SECRET`。Amplify 本身沒有 cron，可參考 `cloudformation/daily-report-scheduler.yml` 的做法。可以先用 `?dryRun=true` 驗證。
6. 更新 skill `db-ops-migrations`（目前是 PARTIAL，原因是缺 GSI）的狀態與已知缺口。

**回滾注意**：如果 GSI 已經建立，就不能再回滾到 `bd85fe7` 版，報名寫入會失敗。真的要回滾，必須先刪掉 `byOrgId`／`byOrderId`。

---

## 7. 行為變更（會影響 UI、測試與使用者）

| 變更 | 影響 |
|---|---|
| 註冊只接受 `student`／`teacher` | 企業註冊頁若從 roles 表列出其他自訂角色，送出會回 400 |
| 註冊只接受 NT$0 方案 | 註冊表單原本就預設 `viewer`，不受影響 |
| 註冊忽略 client 的 `roid_id`，回應不再包含 `verificationToken` | 前端應使用回應中的 `profile.roid_id`，目前的實作已是如此 |
| 同一成員不能重複指派 | 原本會成功的第二次指派，現在回 409 |
| 取消指派或移除成員會撤銷所有授權 | 使用者的 plan 還原為加入前的方案（不一定是 `free`） |
| 只有學生能升為 `dept_admin` | 升級老師回 400；相關 spec 已由其他 session 改寫 |
| 組織管理員不能改 `adminUserId` | 組織管理員嘗試修改會回 403 |
| 組織或部門硬刪除會被引用擋下 | 測試清理要先刪成員與授權；verify 腳本直接呼叫服務層，不受影響 |
| 個人購課不再帶 `orgId` | `GET /api/enroll?orgId=` 目前永遠是空清單（而且 live 缺索引） |

---

## 8. 未完成與刻意未處理的事項（依優先順序）

### 8.1 需要使用者決定或操作

1. push、合併、部署，接著執行第 6 節 Runbook。
2. 建立到期掃描排程。

### 8.2 稽核時發現、尚未修正

| # | 問題 | 說明／建議 |
|---|---|---|
| 1 | **席次取得的課程在學生端看不到**（`docs/MVP.md` R1） | 沒有任何程式建立 B2B 報名列，`/student_courses` 讀的是 `/api/orders`。新增時要記得：席次報名列不能單獨給權限（見 4.4） |
| 2 | Session 沒有 `tenantId`／`orgId` | 每個組織相關請求都要重新讀 Profile。這是 B2B-07 跨租戶隔離 BLOCKED 的根因，屬於架構設計 |
| 3 | `dept_admin` 與老師無法兼任 | `role` 是單值，要把角色改成集合，並同步修改 session 與頁面權限 |
| 4 | Google SSO 不會自動加入組織 | 產品決策：是否依驗證過的 email 網域自動入座 |
| 5 | 同 email 並發註冊可能產生重複帳號 | `EmailIndex` 不是唯一索引；可以用 email 當鍵的條件式 Put 來鎖 |
| 6 | `PATCH maxSeats` 與並發指派有競態 | 改成條件式更新：`maxSeats >= usedSeats` |
| 7 | audit-logs 讀取端沒有依 `orgId` 篩選 | 寫入端已經有頂層 `orgId`，讀取端需要跟上 |
| 8 | CSV 匯入不是原子性的 | 逐列呼叫 API，中途席次用完時部分成功，UI 會列出逐列結果 |
| 9 | CloudFormation 範本與程式不一致 | `dynamodb-tables.yml` 的 enrollments 索引名稱、`dynamodb-org-units-table.yml` 缺 `byParentId` |
| 10 | profiles 有 `EmailIndex` 與 `email-index` 兩個重複索引 | 刪除正式索引屬於破壞性操作，需要使用者同意 |
| 11 | 企業帳單／續約 route（其他 session 新增） | 本 session 沒有審查，需要另外做權限與資料一致性檢查 |

`docs/claude-session-handoff-2026-09-15.md` 第 11 節另列有非 B2B 的安全缺口與正式環境缺表，例如 attendance 表。

---

## 9. 本 session 踩過的坑（Windows 環境）

### 9.1 換行符號

- **沒有 `.gitattributes`，`core.autocrlf=false`**，repo 內 LF 與 CRLF 檔案混用。
- **Windows 的 Python 用預設 `open(..., 'w')` 會把 `\n` 寫成 CRLF**，LF 檔案因此變成整份檔案都是差異。修改現有檔案一定要：
  ```python
  raw = open(p, encoding='utf-8', newline='').read(); crlf = '\r\n' in raw
  s = raw.replace('\r\n', '\n')  # 編輯
  open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
  ```
- 判斷原本的換行格式：用 `git ls-files --eol -- <file>`（看 `i/lf`／`i/crlf`）。**不要用 `git show HEAD:file | grep -c $'\r$'`**，在 Git Bash 下結果不可靠。
- 檢查差異是否只來自換行：`git diff --stat` 與 `git diff --ignore-cr-at-eol --stat` 應該一致。修復方法：對 `i/lf` 且 `w/crlf` 的檔案執行 `sed -i 's/\r$//'`。

### 9.2 Shell

- Git Bash 的 `python - <<'EOF'` 在內容很長、含特殊引號時，可能出現 `unexpected EOF`。改做法：先用 Write 工具把腳本寫到 scratchpad，再執行。
- Python 3.7 以上的 `re.escape` 會跳脫空白與 `\n`；要容忍「只含空白的行」，先依 `\n\n` 切段，再用 `\n[ \t]*\n` 串接。
- Git Bash 裡的 `cmd //c mklink /J` 會把 `/J` 轉成路徑，建立失敗。改用 PowerShell：`New-Item -ItemType Junction`。
- 在 scratchpad 內的 `.mjs` import 套件會找不到 `node_modules`。解法：用 `node --input-type=module -e "$(cat file)"` 從 repo 目錄執行。

### 9.3 驗證 commit 快照本身能編譯

working tree 可能含有其他 session 未 commit 的程式碼，只檢查 working tree 不準。做法（PowerShell）：

```powershell
git worktree add --detach $wt HEAD
New-Item -ItemType Junction -Path "$wt\node_modules" -Target "D:\jvtutorcorner-rwd\node_modules"
# 在 $wt 執行 npx tsc --noEmit -p .
(Get-Item "$wt\node_modules").Delete(); git worktree remove --force $wt
```

### 9.4 同一目錄有多個 session 並行時的部分 commit

當檔案同時含有自己與其他 session 的變更時，**不要**用 `git add` 整個檔案。做法：
1. 以工作檔為基礎，移除其他 session 的區塊（或以 HEAD 版本為基礎，加上自己的變更），組出要 stage 的內容。
2. `git hash-object -w --stdin` → `git update-index --cacheinfo <mode>,<blob>,<path>`，只改 index，不動 working tree。
3. 用 `git diff --cached | grep` 檢查沒有混入其他 session 的標記；用 `git diff --stat` 確認對方的變更仍然 unstaged。
4. `docs/api_registry.md` 由 `node scripts/inspect_apis.mjs` 整份重新產生，會帶入其他 session 的新 route。只 stage 自己新增的那一行即可。

---

## 10. 使用者偏好（本 session 觀察）

- 指令很短，例如「把需要修正的一起處理」「commit 這些修正」，期望一次做完：修正、驗證、文件、回報。
- 只在被要求時 commit；分支從 `main` 另開，commit 格式沿用 conventional commits（`fix(b2b): …`），結尾加 `Co-Authored-By`。
- 回報時要明確區分：已修正並驗證、刻意不修及原因、需要使用者決定的事項、以及無法驗證的部分。

---

## 11. 相關檔案索引

- 修正對照表與部署順序（repo 內）：`docs/b2b-b2c-architecture-boundary.md` 第 6 節
- 其他 B2B 文件：`docs/b2b-b2c-module-matrix.md`、`docs/b2b-enterprise-seat-course-flow.md`、`docs/b2b-request-path-diagram.md`、`docs/enterprise-lms-implementation-plan.md`
- 核心程式：`lib/orgMembershipService.ts`、`lib/licenseService.ts`、`lib/accessControl.ts`、`lib/enrollmentService.ts`、`lib/seatAccounting.ts`、`lib/auth/orgAccess.ts`、`lib/types/b2b.ts`、`lib/plans.ts`
- Claude 記憶檔：`project_b2b_data_fixes_deploy_order.md`（部署順序）、`e2e-local-run-gotchas.md`（本機驗證前綴與禁跑清單）
