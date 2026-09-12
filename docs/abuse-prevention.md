# 濫用防護（Abuse Prevention）

> 對應問題：註冊即可使用平台，惡意使用者亂搞時沒有手段阻止。
> 本文件說明三層防護的設計、開關與操作方式。

## 1. 帳號停權 / 封鎖（管理員手動）

| 項目 | 說明 |
| :--- | :--- |
| 後台頁面 | `/admin/users` — 搜尋帳號、停權／封鎖／恢復 |
| API | `GET /api/admin/users`、`POST /api/admin/users/[id]/status`（皆需 admin session） |
| 核心程式 | `lib/auth/accountStatus.ts` |
| Profile 欄位 | `accountStatus`（`active` / `suspended` / `banned`，缺欄位視為 active）、`suspendedReason`、`suspendedAt`、`suspendedBy`、`suspendedUntil` |

**行為**

- `suspended`：暫時停權，可選 1 / 3 / 7 / 30 天或直到手動恢復；`suspendedUntil` 到期後自動視為 active。
- `banned`：永久封鎖，只能由管理員手動恢復。
- 停權／封鎖當下會 **刪除該使用者所有 session**（`deleteSessionsForUser`），已登入的裝置下一個請求就會拿到 401 被登出，不用等 24 小時 session 過期。
- 同一個 email 若有多筆 profile（資料裡確實有這種舊帳號，例如 `lin@test.com` 有 3 筆），停權／恢復會 **一次套用到全部**，否則登入用 email 查到另一筆就繞過去了。回應與稽核紀錄的 `affectedProfileIds` 會列出實際處理的 id。
- 三種登入方式都會擋：`/api/login`（密碼）、Google callback、LINE callback。密碼登入時「先驗密碼、再回停權訊息」，避免有人用停權訊息探測帳號是否存在。
- 所有異動寫入稽核紀錄（action = `account.status.suspended` / `.banned` / `.active`），可在 `/admin/audit-logs` 查。

**安全限制**

- 管理員不能停權自己的帳號（避免把最後一個 admin 鎖在外面）。
- 停權 `admin` / `system` 角色的帳號需要 `system` 權限，避免一個被盜的 admin 帳號癱瘓整個後台。

**前端訊息**

登入頁會顯示 `login_account_suspended` / `login_account_banned`，並附上管理員填寫的原因與到期時間（i18n key 在 `locales/*/common.json`）。

## 2. 限流（自動）

核心程式：`lib/rateLimit.ts`。計數存在 DynamoDB（`DYNAMODB_TABLE_RATE_LIMITS`，預設 `jvtutorcorner-rate-limits`），讓 serverless 多個執行實例共用同一份計數；表不存在時退回記憶體計數並印 warning（只在同一實例內有效，正式環境務必建表）。

建表：

```bash
node scripts/create-rate-limit-table.mjs
```

| 入口 | 規則 | 回應 |
| :--- | :--- | :--- |
| `POST /api/login` | 同一 IP 15 分鐘 30 次（成功失敗都算） | 429 `login_too_many_attempts` |
| `POST /api/login` | 同一 Email 15 分鐘內密碼錯 8 次 → 暫時鎖定 | 429 `login_account_locked` |
| `POST /api/register` | 同一 IP 1 小時 5 次 | 429 `register_too_many_attempts` |
| `POST /api/forgot-password` | 同一 IP 1 小時 5 次；同一 Email 1 小時 3 次 | 429 `too_many_requests` |
| `POST /api/auth/resend-verification` | 同一 IP 1 小時 10 次（原有的 per-account 5 分鐘冷卻保留） | 429 `too_many_requests` |

規則全部集中在 `RATE_LIMIT_RULES`，要調整數字改那裡即可。429 回應帶 `Retry-After` header 與 `retryAfterSeconds`。

本地 / e2e 測試可設 `DISABLE_RATE_LIMIT=true` 整體關閉；正式環境（`NODE_ENV=production`）此設定無效。

## 3. Email 驗證強制（可選開關）

`REQUIRE_EMAIL_VERIFICATION=true` 時，`emailVerified === false` 的密碼帳號登入會被拒（403 `login_email_not_verified`）。Google / LINE 帳號不受影響；沒有 `emailVerified` 欄位的舊帳號也不受影響。

預設 **關閉**：部分環境 SMTP 未設定，貿然開啟會把新註冊的使用者全部鎖在門外。確認驗證信可正常寄出後再開。

## 4. 建議的後續強化（尚未實作）

- **檢舉機制**：讓老師／學生在課程或聊天中檢舉，管理員在 `/admin/users` 看到檢舉數後決定是否停權。
- **自動停權**：例如短時間內被多人檢舉、或聊天觸發內容審核，自動改為 `suspended` 並通知管理員。
- **註冊 Email 網域黑名單**：擋一次性信箱（10minutemail 等）。
- **IP 黑名單**：對特定 IP 直接拒絕註冊／登入，可加在 `lib/rateLimit.ts` 旁邊。
- **sessions 表加 userId GSI**：目前 `deleteSessionsForUser` 用 Scan，使用者量大時可改 Query。
