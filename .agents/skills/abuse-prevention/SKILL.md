---
name: abuse-prevention
description: '濫用防護：管理員停權／封鎖帳號、登入與註冊等端點的 DynamoDB 速率限制、Email 驗證強制。Use when: changing login/register/forgot-password flows, account status, rate limits, or the admin user management page.'
argument-hint: '描述要調整的防護，例如：放寬登入限流、新增停權原因'
metadata:
  verified-status: '❌ UNVERIFIED'
  last-verified-date: '-'
  architecture-aligned: true
  related-skills: [server-auth-guards, auth-sso, db-ops-migrations]
---

# 濫用防護 (Abuse Prevention)

完整設計說明在 [docs/abuse-prevention.md](../../../docs/abuse-prevention.md)；本技能整理程式入口與驗證方式。

## 機制

1. **帳號狀態**（[lib/auth/accountStatus.ts](../../../lib/auth/accountStatus.ts)）：`active`／`suspended`／`banned`。`getAccountBlock(profile)` 回傳阻擋原因；登入（[app/api/login/route.ts](../../../app/api/login/route.ts)）、Google 與 LINE 回調都會檢查。管理員在 `/admin/users` 以 `setAccountStatus()` 變更，並撤銷該使用者既有的 session。
2. **速率限制**（[lib/rateLimit.ts](../../../lib/rateLimit.ts)）：固定時間窗計數，存在 DynamoDB（PK `rlKey` = `<scope>:<identifier>:<windowStart>`，TTL 自動清除）。例如登入每 IP 每 15 分鐘 30 次。login、register、forgot-password、resend-verification 會呼叫。
3. **Email 驗證強制**：可選開關，細節見文件第 3 節。

## 相關檔案

- [lib/auth/accountStatus.ts](../../../lib/auth/accountStatus.ts)、[lib/rateLimit.ts](../../../lib/rateLimit.ts)
- [app/api/admin/users/](../../../app/api/admin/users/)、[app/admin/users/](../../../app/admin/users/)、[components/AdminUserManager.tsx](../../../components/AdminUserManager.tsx)
- [scripts/create-rate-limit-table.mjs](../../../scripts/create-rate-limit-table.mjs)
- [docs/abuse-prevention.md](../../../docs/abuse-prevention.md)

## 測試指令

```bash
# 建立速率限制表（冪等）
node scripts/create-rate-limit-table.mjs
```

目前沒有自動化測試。其他 spec 大量登入時，請加 `DISABLE_RATE_LIMIT=true`（只在非 production 生效）避免被自己的限流擋下。

## 環境驗證 (Environment Validation)

- `DISABLE_RATE_LIMIT`：非 production 時設為 `true` 可停用限流。
- 速率限制表名稱與 AWS 憑證：見 [scripts/create-rate-limit-table.mjs](../../../scripts/create-rate-limit-table.mjs) 開頭註解。

## 故障排除

- **限流好像沒作用**：表不存在時 `checkRateLimit` 會 catch 並 warn 後放行（fail-open）。先跑建表腳本，再看伺服器日誌。
- **e2e 批次跑到一半開始登入失敗**：被登入限流擋下，加 `DISABLE_RATE_LIMIT=true` 重跑。
- **停權後使用者仍在線上**：確認 `setAccountStatus()` 有撤銷 session；已發出的 session cookie 在下一次請求時才會被拒。
- **已知缺口**：`/api/forgot-password` 對不存在的帳號回 404（可列舉帳號），且先重設密碼再寄信——寄信失敗時使用者會被鎖在外面。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)、[auth-sso](../auth-sso/SKILL.md)
- [db-ops-migrations](../db-ops-migrations/SKILL.md)：建表腳本的慣例。
