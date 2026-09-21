# JV Tutor Corner — 濫用防護（Abuse Prevention）工作交接

> **給新的 Claude**：這份文件交接的是「註冊即可使用平台，惡意使用者亂搞時無法阻止」這條工作線。讀完即可接手，從第 9 節「下一步」開始。
>
> - **語言**：使用者用繁體中文溝通，回覆一律 zh-TW；程式識別字維持英文。
> - **原始 session 日期**：2026-09-10 實作，2026-09-15 整理本文件時重新核對過 git 與 AWS 狀態。
> - **姊妹文件**：
>   - `docs/claude-session-handoff-2026-09-15-production-readiness.md`：上線前安全修補總清單。本工作線的待修項目 **S2、S5** 定義在那裡。
>   - `docs/claude-session-handoff-2026-09-15.md`：本機驗證環境規則、禁跑清單、e2e helper。
> - **設計文件**：`docs/abuse-prevention.md`。**Skill**：`.agents/skills/abuse-prevention/SKILL.md`（狀態 `❌ UNVERIFIED`）。

---

## 0. TL;DR

| 項目 | 狀態 |
|---|---|
| 帳號停權／封鎖（後台 + API + 三種登入入口阻擋） | ✅ 已實作、本機實測通過、已 commit |
| 限流（login / register / forgot-password / resend-verification） | ✅ 已實作、已 commit；⚠️ **IP 規則可被偽造 header 繞過（S2，未修）** |
| Email 驗證強制（`REQUIRE_EMAIL_VERIFICATION`） | ✅ 已實作，預設**關閉** |
| 正式 AWS 上的計數表 `jvtutorcorner-rate-limits` | ❌ **不存在**（2026-09-15 以 DescribeTable 確認 `ResourceNotFoundException`） |
| `/admin/users` 導覽連結 | ❌ 沒有，只能手打網址 |
| 自動化測試 | ❌ 沒有 |
| 相關 commit | `8b1c00d`（限流 + 帳號狀態）、`25f411b`（後台 UI + API），另有部分接線落在 `3948934` |
| 所在分支 | `integration/b2b-security-merge`，**領先 origin/main 11 個 commit，未 push** |
| ⚠️ 部署提醒 | `main` 一 push 就會自動部署到 Amplify 正式環境。push／PR／merge 必須等使用者決定 |

---

## 1. 問題與決策脈絡

使用者原話：「現在登入只要註冊就能開始使用平台，但如果有人惡意亂搞無法阻止，要有方法來避免」。

實作前盤點到的缺口：

1. 登入與註冊 API 完全沒有次數限制，腳本可以無限撞庫、灌假帳號。
2. 沒有任何帳號停權機制，管理員發現惡意使用者也擋不了。
3. 註冊會寄驗證信，但未驗證一樣能登入。
4. `/api/forgot-password` 每次呼叫都**直接重設密碼並寄信**，可被拿來反覆改掉別人的密碼。

採取的三層防護：

| 層 | 性質 | 為什麼這樣設計 |
|---|---|---|
| 帳號停權／封鎖 | 管理員手動 | 最直接的「發現就擋」手段；停權時必須同步踢掉 session，否則已登入者還能用 24 小時 |
| 限流 | 自動 | 擋腳本化攻擊；計數放 DynamoDB，因為 Amplify serverless 多實例各自的記憶體計數等於沒擋 |
| Email 驗證強制 | 可選開關 | 預設關閉，因為部分環境 SMTP 未設定，開了會把新用戶全鎖在門外 |

---

## 2. 檔案地圖

### 新增

| 檔案 | 用途 |
|---|---|
| `lib/rateLimit.ts` | 固定時間窗限流器、`getClientIp`、429 回應、全站規則 `RATE_LIMIT_RULES` |
| `lib/auth/accountStatus.ts` | `getAccountBlock()` 判斷是否可登入；`setAccountStatus()` 變更狀態、踢 session、寫稽核 |
| `app/api/admin/users/route.ts` | `GET` 使用者清單（`withAdmin`），支援 `?q=` 與 `?status=` |
| `app/api/admin/users/[id]/status/route.ts` | `POST` 變更帳號狀態（`withAdmin`） |
| `app/admin/users/page.tsx` | 後台頁面殼 |
| `components/AdminUserManager.tsx` | 後台 UI：搜尋、篩選、停權對話框、恢復 |
| `scripts/create-rate-limit-table.mjs` | 冪等建表腳本（含 TTL） |
| `docs/abuse-prevention.md` | 設計文件 |

### 修改

| 檔案 | 改了什麼 |
|---|---|
| `app/api/login/route.ts` | IP 限流、帳號失敗鎖定、停權檢查、可選 Email 驗證檢查 |
| `app/api/register/route.ts` | IP 限流（放在驗證碼比對之前） |
| `app/api/forgot-password/route.ts` | IP 與 Email 雙重限流 |
| `app/api/auth/resend-verification/route.ts` | IP 限流（原有 per-account 5 分鐘冷卻保留） |
| `app/api/auth/callback/google/route.ts` | 停權檢查，導向 `/login?error=account_suspended\|account_banned` |
| `app/api/auth/line-login/callback/route.ts` | 同上 |
| `lib/auth/sessionManager.ts` | 新增 `deleteSessionsForUser(userId)` |
| `lib/profilesService.ts` | 新增 `findProfilesByEmail(email)`，回傳同 email 的**全部** profile |
| `app/login/page.tsx` | 顯示停權原因與到期時間；處理 `account_suspended`／`account_banned` query |
| `locales/{en,zh-TW,zh-CN}/common.json` | 7 個新 key，見第 6 節 |
| `docs/api_registry.md` | 登記兩支新 API |
| `.env.local.example` | `DYNAMODB_TABLE_RATE_LIMITS`、`DISABLE_RATE_LIMIT`、`REQUIRE_EMAIL_VERIFICATION` |

---

## 3. 帳號停權／封鎖

### 3.1 資料模型（存在 profiles 表上，不另開表）

| 欄位 | 值 |
|---|---|
| `accountStatus` | `active` / `suspended` / `banned`。**缺欄位視為 active**，舊資料不用回填 |
| `suspendedReason` | 管理員填的原因，最多 500 字 |
| `suspendedAt` | ISO 時間 |
| `suspendedBy` | 操作者的 `session.userId` |
| `suspendedUntil` | ISO 時間，只對 `suspended` 有意義；缺欄位代表直到手動恢復 |

- `suspended`：暫時停權。`suspendedUntil` 過期後 `getAccountBlock()` 直接視為 active，**不回寫資料庫**。
- `banned`：永久封鎖，只能手動恢復。
- 恢復為 `active` 時會 `REMOVE` 所有 suspended* 欄位。

### 3.2 `getAccountBlock(profile)`

回傳 `null` 代表可登入，否則回 `{ status, reason?, until? }`。三個登入入口都呼叫它：

| 入口 | 被擋時的行為 |
|---|---|
| `POST /api/login` | 403，`message` 為 `login_account_suspended` 或 `login_account_banned`，附 `reason`、`until` |
| Google callback | redirect `/login?error=account_suspended` 或 `account_banned` |
| LINE callback | 同上 |

**密碼登入的順序是先驗密碼、再回停權訊息**。這樣攻擊者無法用停權訊息探測某個 email 是否已註冊。

### 3.3 `setAccountStatus({ profileId, status, reason, until, actorId })`

1. `getProfileById(profileId)` 取得目標。
2. **用 `findProfilesByEmail(profile.email)` 找出同 email 的所有 profile，一併更新**。
3. 非 active 時，對所有目標的 `id` 與 `roid_id` 呼叫 `deleteSessionsForUser()`。
4. 寫稽核紀錄：`action = account.status.<status>`，`targetType = profile`，metadata 含 `email`、`reason`、`until`、`revokedSessions`、`affectedProfileIds`。
5. 回傳 `{ profileId, status, revokedSessions, affectedProfileIds }`。

> **為什麼要處理同 email 的所有 profile**：正式資料裡確實有重複 email 的舊帳號，例如 `lin@test.com` 有 3 筆。登入用 `findProfileByEmail` 只取 GSI 查到的**第一筆**。第一版只停權管理員點到的那筆，實測時登入撿到另一筆就繞過去了。LINE 帳號的 email 是 `line_<uid>@line.local` 佔位值，每個 uid 唯一，不會誤傷。

> **session.userId 可能是 `id` 也可能是 `roid_id`**：例如 `lin@test.com` 其中一筆 `id=e61300a2-…`、`roid_id=teacher-demo2`，而 session 裡存的是 `teacher-demo2`。所以兩者都要清。

### 3.4 `deleteSessionsForUser(userId)`

sessions 表（PK `sessionId`，24 小時 TTL）沒有 userId GSI，所以用 **Scan + FilterExpression + 逐筆 Delete**，有分頁。管理員手動觸發的低頻操作，目前可接受。實測一次清掉 668 筆（測試帳號歷年累積）。使用者量大時應加 userId GSI 改 Query。

### 3.5 API 權限規則（`POST /api/admin/users/[id]/status`）

- `withAdmin` 只接受 `role === 'admin'`。E2E bypass header 會得到 `role: 'system'`，且只在非 production 生效。
- 不能停權自己（避免把最後一個 admin 鎖在外面）。
- 停權 `admin`／`system` 角色的帳號，操作者必須是 `system`。實務上這代表只有 bypass session 或真正的 system 帳號能停權管理員。
- `until` 必須是未來時間，否則 400。

### 3.6 後台 UI（`/admin/users`）

- 欄位：Email＋id、名稱、角色／方案、登入方式、Email 驗證、狀態、停權資訊、註冊時間、操作。
- 停權對話框可選 1 / 3 / 7 / 30 天或「直到手動恢復」，封鎖沒有期限選項。
- 恢復使用 `window.confirm`。
- `GET /api/admin/users` 回傳的 `accountStatus` 是**有效狀態**，過期的暫停會顯示為正常。
- 清單 API 是整表 Scan 後在記憶體過濾，使用者量大時需要改。

---

## 4. 限流

### 4.1 演算法

- 固定時間窗。key 為 `<scope>:<identifier>:<windowStart>`。
- DynamoDB `UpdateCommand`：`ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)`，原子累加，TTL 為窗結束加 60 秒。
- **被擋的那次也計數**，持續打只會延長被擋狀態。
- `checkRateLimit(rule, id)` 會累加；`getRateLimitCount(rule, id)` 只讀不加，用 `ConsistentRead`。
- **Fail-open**：DynamoDB 出錯（含表不存在）時退回同實例的記憶體 Map，每分鐘最多 warn 一次。在 serverless 上等於限流近乎無效。
- `DISABLE_RATE_LIMIT=true` 可關閉，只在 `NODE_ENV !== 'production'` 時有效。

### 4.2 規則（全部在 `lib/rateLimit.ts` 的 `RATE_LIMIT_RULES`）

| 規則 | scope | 上限 | 時間窗 | 用在 | 回應 message |
|---|---|---|---|---|---|
| `loginPerIp` | `login:ip` | 30 | 15 分鐘 | login，成功失敗都算 | `login_too_many_attempts` |
| `loginFailPerEmail` | `login:fail:email` | 8 | 15 分鐘 | login，只在密碼錯時累加 | `login_account_locked` |
| `registerPerIp` | `register:ip` | 5 | 1 小時 | register | `register_too_many_attempts` |
| `forgotPasswordPerIp` | `forgot:ip` | 5 | 1 小時 | forgot-password | `too_many_requests` |
| `forgotPasswordPerEmail` | `forgot:email` | 3 | 1 小時 | forgot-password | `too_many_requests` |
| `resendVerificationPerIp` | `resend:ip` | 10 | 1 小時 | resend-verification | `too_many_requests` |

429 回應格式：`{ ok:false, message, retryAfterSeconds }`，並帶 `Retry-After` header。

### 4.3 `/api/login` 的完整流程

```
1. email/password 缺 → 400
2. checkRateLimit(loginPerIp, ip)            超過 → 429 login_too_many_attempts
3. getRateLimitCount(loginFailPerEmail, email) 已達上限 → 429 login_account_locked（不驗密碼）
4. captcha（可被 LOGIN_BYPASS_SECRET 略過）  錯 → 400 captcha_incorrect
5. findProfileByEmail
   ├─ 密碼正確
   │   ├─ getAccountBlock 有值 → 403 login_account_suspended / banned（附 reason, until）
   │   ├─ REQUIRE_EMAIL_VERIFICATION=true 且 emailVerified===false
   │   │   且非 google、非 LINE → 403 login_email_not_verified
   │   └─ 建 session，200
   ├─ 密碼錯誤 → checkRateLimit(loginFailPerEmail)
   │   ├─ 超過 → 429 login_account_locked
   │   └─ 401 login_password_wrong，附 attemptsLeft
   └─ 查無帳號 → 401 login_account_not_found
```

---

## 5. Email 驗證強制

- 開關：`REQUIRE_EMAIL_VERIFICATION=true`，只影響 `/api/login` 密碼登入。
- 只擋 `emailVerified === false`。註冊流程會明確寫入 `false`；缺欄位的舊帳號不受影響。
- Google（`authProvider === 'google'`）與 LINE（有 `lineUid`）帳號不受影響。
- 前端目前只顯示錯誤訊息，沒有「重寄驗證信」按鈕接在這個錯誤上。

---

## 6. i18n key（三種語言都已加）

`login_account_suspended`、`login_account_banned`、`login_account_locked`、`login_too_many_attempts`、`login_email_not_verified`、`register_too_many_attempts`、`too_many_requests`。

登入頁用 `t(data.message)` 顯示，停權時再接上 `（原因）` 與本地化的到期時間。

---

## 7. 已驗證的事實（2026-09-10 本機 dev server + curl）

| 測試 | 結果 |
|---|---|
| 同一帳號連續 9 次錯密碼 | 前 8 次 401，`attemptsLeft` 7→0；第 9 次 429 `login_account_locked` |
| 停權測試教師帳號後，用舊 cookie 打 `/api/auth/me` | 401 |
| 停權中重新登入 | 403 `login_account_suspended`，附原因與到期時間 |
| 恢復後登入 | 200 |
| `/admin/users` 以 admin session 取頁面 | 200，內容正確渲染 |
| 稽核紀錄 | `account.status.suspended` 與 `account.status.active` 皆有寫入 |
| `npx tsc --noEmit` | 通過 |

> ⚠️ **測試留下的正式資料痕跡**（`.env.local` 指向正式 AWS）：
> - `lin@test.com` 的 3 筆 profile 現在都有 `accountStatus: 'active'` 欄位與新的 `updatedAtUtc`。
> - 這 3 筆 profile 對應的 668 筆 session 被刪除。
> - 稽核表多了數筆 `actorId: system` 的 `account.status.*` 紀錄。
> - 這些都無害，但不要誤以為是真實管理員操作。

---

## 8. 已知缺口與風險

| # | 缺口 | 嚴重度 | 說明 |
|---|---|---|---|
| G1 | **IP 取值可偽造（production-readiness 文件 S2）** | 🔴 上線阻斷 | `getClientIp` 取 `x-forwarded-for` 的**第一段**，但 CloudFront／Amplify 是把真實 IP 附加在**後面**。攻擊者自填 XFF 就能讓所有 IP 規則失效，只剩 `loginFailPerEmail` 有效 |
| G2 | **正式環境計數表不存在** | 🔴 上線阻斷 | 目前 fail-open 到記憶體，限流在 serverless 上近乎無效 |
| G3 | 計數表沒進 `scripts/lib/schema.mjs` | 🟠 | `npm run db:setup` 不會建它 |
| G4 | `/admin/users` 沒有導覽連結 | 🟡 | 沒有接到 `components/MenuBar.tsx`、`app/dashboard/page.tsx`、`lib/adminRoutes.ts` |
| G5 | forgot-password 設計問題 | 🟠 | 查無帳號回 404 可列舉帳號；先重設密碼再寄信，寄信失敗會把使用者鎖在外面 |
| G6 | 沒有自動化測試 | 🟠 | 單元測試規劃在 production-readiness 文件 Tier 2 |
| G7 | `deleteSessionsForUser` 用 Scan | 🟡 | 量大時改 userId GSI |
| G8 | `GET /api/admin/users` 整表 Scan | 🟡 | 量大時改分頁 |
| G9 | 匿名寫入端點沒限流（production-readiness 文件 S5） | 🟠 | 規劃新增 `lib/api/withRateLimit.ts` 與 `anonWritePerIp` 規則，**必須在 G1 之後** |
| G10 | 重複 email 的舊 profile | 🟡 | 已靠「同 email 一起停權」繞過，但資料本身該清理 |

---

## 9. 下一步（建議順序）

1. **修 G1**：改寫 `lib/rateLimit.ts` 的 `getClientIp`。
   - 優先讀 `cloudfront-viewer-address`，去掉 port，注意 IPv6 格式。
   - 否則從 XFF **右邊**往回數 `TRUSTED_PROXY_HOPS`（預設 1）。
   - 最後才退回 `x-real-ip`，再不行回 `'unknown'`。
   - 單元測試：`x-forwarded-for: 1.2.3.4, 9.9.9.9` 要解析為 `9.9.9.9`。
2. **修 G3**：把 `jvtutorcorner-rate-limits`（PK `rlKey` S、TTL `ttl`、PAY_PER_REQUEST）加進 `scripts/lib/schema.mjs`。
3. **G2 在正式環境建表**。這是寫入正式 AWS 的動作，**先問使用者**：
   ```bash
   node --env-file=.env.local scripts/create-rate-limit-table.mjs
   ```
4. **修 G4**：把 `/admin/users` 加進 `lib/adminRoutes.ts` 與後台選單。
5. **G6 補測試**：`lib/rateLimit.ts`（窗邊界、fail-open）、`lib/auth/accountStatus.ts`（過期暫停、同 email 多筆）。
6. 之後才做 G9（S5）與 G5。
7. 可選的產品強化，尚未討論是否要做：檢舉機制、依檢舉數自動停權、一次性信箱網域黑名單、IP 黑名單。

---

## 10. 操作守則（接手必讀）

- `.env.local` 是 `APP_ENV=production`，**指向正式 AWS**。本機跑 dev server、e2e 或腳本時，加上 `APP_ENV=local NEXT_PUBLIC_PAYMENT_MOCK_MODE=true DISABLE_RATE_LIMIT=true`。
- 本機大量登入的 e2e 不加 `DISABLE_RATE_LIMIT=true`，會被自己的限流擋下。
- 本機 dev server 設定：`.claude/launch.json` 的 `next-dev`，port 3001（`npm run dev:http`）。
- 測試帳號在 `.env.local` 的 `TEST_TEACHER_*`、`TEST_STUDENT_*`、`QA_ADMIN_*`。用 `X-E2E-Secret: $LOGIN_BYPASS_SECRET` 可略過驗證碼，並在非 production 取得 `role: system` 的 session。
- 工作目錄裡的 `docs/MVP.md`、多份 `docs/claude-session-handoff-*.md`、`scripts/create-dev-tables.mjs`、`.agents/skills/SKILL_VERIFICATION_SUMMARY.md` 不是本工作線產生的，**不要還原、不要順手 commit**。
- commit 結尾加：`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- **不要自行 push 或 merge 到 `main`**，那會直接部署到正式環境。

---

## 11. 關鍵程式片段（供快速對照）

### 限流核心

```ts
// lib/rateLimit.ts
export async function checkRateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const windowEnd = windowStart + rule.windowSeconds;
  // ...
  const key = `${rule.scope}:${identifier || 'unknown'}:${windowStart}`;
  const res = await ddbDocClient.send(new UpdateCommand({
    TableName: RATE_LIMIT_TABLE,
    Key: { rlKey: key },
    UpdateExpression: 'ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)',
    ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':one': 1, ':ttl': windowEnd + 60 },
    ReturnValues: 'UPDATED_NEW',
  }));
  // catch → memoryIncrement(key, windowEnd)
  return { allowed: count <= rule.limit, count, limit: rule.limit, retryAfterSeconds };
}
```

### 目前有漏洞的 IP 取值（G1 要改的地方）

```ts
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();   // ← 第一段是用戶端可自填的
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
```

### 停權判斷

```ts
// lib/auth/accountStatus.ts
export function getAccountBlock(profile: any): AccountBlock | null {
  if (!profile) return null;
  const status = profile.accountStatus as AccountStatus | undefined;
  if (!status || status === 'active') return null;
  if (status === 'suspended' && profile.suspendedUntil) {
    const until = Date.parse(profile.suspendedUntil);
    if (!Number.isNaN(until) && until <= Date.now()) return null;
  }
  return {
    status,
    reason: profile.suspendedReason || undefined,
    until: status === 'suspended' ? profile.suspendedUntil || undefined : undefined,
  };
}
```

### API 呼叫範例

```bash
# 列出停權中的使用者
curl -H "Cookie: session=<admin-session>" "http://localhost:3001/api/admin/users?status=suspended"

# 停權 1 天
curl -X POST -H "Content-Type: application/json" -H "Cookie: session=<admin-session>" \
  -d '{"status":"suspended","reason":"洗版","until":"2026-09-16T00:00:00.000Z"}' \
  "http://localhost:3001/api/admin/users/<profileId>/status"

# 恢復
curl -X POST -H "Content-Type: application/json" -H "Cookie: session=<admin-session>" \
  -d '{"status":"active"}' "http://localhost:3001/api/admin/users/<profileId>/status"
```
