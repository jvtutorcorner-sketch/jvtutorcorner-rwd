---
name: auth-sso
description: '登入與 SSO：帳密登入、登出、Email 驗證與重寄、忘記密碼、Google SSO、LINE Login，以及 session cookie 的發放。Use when: changing login/logout/verification flows, adding an OAuth provider, or debugging login redirects and missing sessions.'
argument-hint: '描述要處理的登入流程，例如：LINE 登入後沒有 session、Google 網域限制'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-09-11'
  architecture-aligned: true
  related-skills: [server-auth-guards, abuse-prevention, auto-login, email-service-integration]
---

# 登入與 SSO (Auth & SSO)

所有登入方式最後都呼叫 [lib/auth/sessionManager.ts](../../../lib/auth/sessionManager.ts) 建立 session 並發 `session` cookie；登入前會用 [lib/auth/accountStatus.ts](../../../lib/auth/accountStatus.ts) 檢查帳號是否被停權（見 [abuse-prevention](../abuse-prevention/SKILL.md)）。

## 端點

| 流程 | 端點 | 備註 |
|---|---|---|
| 帳密登入 | `POST /api/login` | 需 captcha（`GET /api/captcha`）；缺欄位 400；有速率限制 |
| 目前使用者 | `GET /api/auth/me` | 手寫守衛，不認 e2e bypass |
| 登出 | `POST /api/logout` | 刪除 session；沒有 session 也回 200 |
| Email 驗證 | `GET /api/auth/verify-email` → 3xx 回 `/login` | 缺參數 → `?error=invalid_verification_link` |
| 重寄驗證信 | `POST /api/auth/resend-verification` | |
| 忘記密碼 | `POST /api/forgot-password` | ⚠️ 會重設密碼並寄信 |
| Google SSO | `GET /api/auth/google/start` → `GET /api/auth/callback/google` | [lib/auth/googleSSO.ts](../../../lib/auth/googleSSO.ts)；可限定網域 |
| LINE Login | `GET /api/auth/line-login/start` → `callback`；`GET/DELETE .../session` | [lib/auth/lineLoginConfig.ts](../../../lib/auth/lineLoginConfig.ts)；[components/LineLoginButton.tsx](../../../components/LineLoginButton.tsx) |

OAuth 回調的共同規則：state 以 cookie 比對（防 CSRF），任何錯誤都 3xx 回 `/login?error=<code>`，**且絕不發 session cookie**。LINE 的錯誤碼：`line_denied`、`line_state_mismatch`、`line_no_code`。

## 相關檔案

- [app/api/login/route.ts](../../../app/api/login/route.ts)、[app/api/logout/](../../../app/api/logout/)、[app/api/forgot-password/route.ts](../../../app/api/forgot-password/route.ts)
- [app/api/auth/me/](../../../app/api/auth/me/)、[app/api/auth/verify-email/](../../../app/api/auth/verify-email/)、[app/api/auth/resend-verification/route.ts](../../../app/api/auth/resend-verification/route.ts)
- [app/api/auth/google/start/](../../../app/api/auth/google/start/)、[app/api/auth/callback/google/route.ts](../../../app/api/auth/callback/google/route.ts)
- [app/api/auth/line-login/start/](../../../app/api/auth/line-login/start/)、[app/api/auth/line-login/callback/route.ts](../../../app/api/auth/line-login/callback/route.ts)、[app/api/auth/line-login/session/](../../../app/api/auth/line-login/session/)
- 測試：[e2e/auth_sso_verification.spec.ts](../../../e2e/auth_sso_verification.spec.ts)；Google 偽造回調在 [e2e/enterprise_general_security_contract.spec.ts](../../../e2e/enterprise_general_security_contract.spec.ts)

## 測試指令

```bash
npx playwright test e2e/auth_sso_verification.spec.ts --project=chromium
```

⚠️ 不要用真實 email 打 `/api/forgot-password`。

## 環境驗證 (Environment Validation)

- `SESSION_SECRET`、`LOGIN_BYPASS_SECRET`（captcha 繞過，非 production）
- Google：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_SSO_ALLOWED_DOMAINS`
- LINE Login：`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`LINE_LOGIN_REDIRECT_URI`（缺任一 → start 回 503）

## 故障排除

- **OAuth 登入後回到 `/login?error=..._state_mismatch`**：state cookie 沒帶回來，多半是 redirect URI 的網域與發 cookie 的網域不同（www 與非 www）。
- **LINE Login 503**：三個 `LINE_LOGIN_*` 變數缺一不可，且 `LINE_LOGIN_REDIRECT_URI` 要與 LINE Developers 後台完全一致。
- **已知缺口**：
  1. `DELETE /api/auth/line-login/session` 只清 cookie，DynamoDB 裡的 session 仍然有效（應呼叫 `POST /api/logout` 的撤銷邏輯）。
  2. `/api/forgot-password` 對不存在的帳號回 404（可列舉帳號），且先重設密碼再寄信。

## 相關技能

- [server-auth-guards](../server-auth-guards/SKILL.md)、[abuse-prevention](../abuse-prevention/SKILL.md)、[auto-login](../auto-login/SKILL.md)
