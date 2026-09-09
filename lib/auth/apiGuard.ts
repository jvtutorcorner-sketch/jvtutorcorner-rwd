// lib/auth/apiGuard.ts
// API 路由保護工具 — 組合 Session 驗證 + HMAC 驗證
// 提供簡單的 withAuth / withHmac / withAnyAuth wrapper

import { NextResponse } from 'next/server';
import { getSession, extractTokenFromRequest, Session } from './sessionManager';
import { verifyHmacFromHeaders } from './hmac';

export type AuthedRequest = Request & { session: Session };

// 回傳型別用 Response 而非 NextResponse：Next.js route handler 本來就允許回傳原生
// Response（串流、二進位檔、SSE 都會這樣寫），NextResponse 也是它的子型別。
export type ApiHandler<T = any> = (
  req: AuthedRequest,
  context?: T
) => Promise<Response>;

export type PlainHandler<T = any> = (
  req: Request,
  context?: T
) => Promise<Response>;

// ─────────────────────────────────────────────
// E2E Bypass — 僅限非正式環境
// ─────────────────────────────────────────────

/**
 * 測試用的萬能鑰匙：帶對 `x-e2e-secret` 就取得 role='system' 的 session。
 *
 * system 這個角色在下游等同最高權限（orgAccess 的 isSystemAdmin、withAdminOrHmac
 * 允許的角色、profile/courses 的擁有者檢查都認它），而且這段檢查跑在 withAuth 的
 * 角色檢查之前，所以連 withAdmin 都會被繞過。先前沒有任何環境判斷 —— 只要正式環境
 * 存在 LOGIN_BYPASS_SECRET，一個 header 就能拿到全站管理權。
 *
 * 現在正式環境一律關閉，除非明確設定 ALLOW_E2E_BYPASS_IN_PRODUCTION=true。
 */
function isE2eBypassAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_E2E_BYPASS_IN_PRODUCTION === 'true';
}

function tryE2eBypassSession(req: Request): Session | null {
  if (!isE2eBypassAllowed()) return null;

  const e2eSecret = req.headers.get('x-e2e-secret');
  const bypassSecret = process.env.LOGIN_BYPASS_SECRET;
  if (!e2eSecret || !bypassSecret || e2eSecret !== bypassSecret) return null;

  const now = Math.floor(Date.now() / 1000);
  return {
    sessionId: 'e2e-bypass',
    userId: 'system',
    email: 'system@e2e',
    role: 'system',
    plan: 'system',
    createdAt: now,
    expiresAt: now + 3600,
  };
}

// ─────────────────────────────────────────────
// 1. Session Guard — 必須有登入 Session
// ─────────────────────────────────────────────

/**
 * 包裝 API handler，要求有效的 session token。
 * 可選擇性限制允許的角色。
 *
 * @example
 * export const GET = withAuth(async (req) => {
 *   const { email, role } = req.session;
 *   return NextResponse.json({ ok: true, email });
 * });
 */
export function withAuth(
  handler: ApiHandler,
  options?: { roles?: string[] }
): PlainHandler {
  return async (req: Request, context?: any) => {
    // 嘗試 E2E Bypass（正式環境預設關閉，見 tryE2eBypassSession）
    const bypassSession = tryE2eBypassSession(req);
    if (bypassSession) {
      const authedReq = Object.assign(req, { session: bypassSession }) as AuthedRequest;
      return handler(authedReq, context);
    }

    const token = extractTokenFromRequest(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: missing session token' },
        { status: 401 }
      );
    }

    const session = await getSession(token);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: invalid or expired session' },
        { status: 401 }
      );
    }

    // 角色檢查
    if (options?.roles && options.roles.length > 0) {
      if (!options.roles.includes(session.role)) {
        return NextResponse.json(
          { ok: false, error: `Forbidden: requires role [${options.roles.join(', ')}]` },
          { status: 403 }
        );
      }
    }

    // 將 session 附加到 request 上
    const authedReq = Object.assign(req, { session }) as AuthedRequest;
    return handler(authedReq, context);
  };
}

// ─────────────────────────────────────────────
// 2. HMAC Guard — 服務間呼叫
// ─────────────────────────────────────────────

/**
 * 包裝 API handler，要求有效的 HMAC 簽名。
 * 適用於 cron job、webhook、內部服務呼叫。
 *
 * @example
 * export const POST = withHmac('/api/cron/daily-report', async (req) => {
 *   return NextResponse.json({ ok: true });
 * });
 */
export function withHmac(
  path: string,
  handler: PlainHandler
): PlainHandler {
  return async (req: Request, context?: any) => {
    // 必須先讀取 body（只能讀一次）
    let rawBody = '';
    try {
      rawBody = await req.text();
    } catch {
      rawBody = '';
    }

    const result = verifyHmacFromHeaders(req, path, rawBody);
    if (!result.valid) {
      console.warn(`[withHmac] ${path} rejected: ${result.reason}`);
      return NextResponse.json(
        { ok: false, error: `Forbidden: ${result.reason}` },
        { status: 403 }
      );
    }

    // 重新建立含有 body 的 Request（因為 stream 已消耗）
    const newReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: rawBody || undefined,
    });

    return handler(newReq, context);
  };
}

// ─────────────────────────────────────────────
// 3. Admin Guard — Session + admin role
// ─────────────────────────────────────────────

/**
 * 速記 wrapper：要求 admin 角色
 */
export function withAdmin(handler: ApiHandler): PlainHandler {
  return withAuth(handler, { roles: ['admin'] });
}

// ─────────────────────────────────────────────
// 4. Any Auth Guard — Session 或 HMAC 其中一個即可
// ─────────────────────────────────────────────

/**
 * 允許兩種認證方式之一通過：
 * - 有效的 session token（用戶登入）
 * - 有效的 HMAC 簽名（服務間）
 */
export function withAnyAuth(
  path: string,
  handler: ApiHandler
): PlainHandler {
  return async (req: Request, context?: any) => {
    // 嘗試 E2E Bypass（正式環境預設關閉，見 tryE2eBypassSession）
    const bypassSession = tryE2eBypassSession(req);
    if (bypassSession) {
      const authedReq = Object.assign(req, { session: bypassSession }) as AuthedRequest;
      return handler(authedReq, context);
    }

    // 嘗試 Session 驗證
    const token = extractTokenFromRequest(req);
    if (token) {
      const session = await getSession(token);
      if (session) {
        const authedReq = Object.assign(req, { session }) as AuthedRequest;
        return handler(authedReq, context);
      }
    }

    // 嘗試 HMAC 驗證
    let rawBody = '';
    try {
      rawBody = await req.text();
    } catch {
      rawBody = '';
    }
    const hmacResult = verifyHmacFromHeaders(req, path, rawBody);
    if (hmacResult.valid) {
      // HMAC 通過，建立虛擬 system session
      const systemSession: Session = {
        sessionId: 'hmac-system',
        userId: 'system',
        email: 'system@internal',
        role: 'system',
        plan: 'system',
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      };
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: rawBody || undefined,
      });
      const authedReq = Object.assign(newReq, { session: systemSession }) as AuthedRequest;
      return handler(authedReq, context);
    }

    return NextResponse.json(
      { ok: false, error: 'Unauthorized: valid session or HMAC signature required' },
      { status: 401 }
    );
  };
}

// ─────────────────────────────────────────────
// 5. Admin-or-HMAC Guard — 給有副作用的內部 action node（寄信、外呼 HTTP…）
// ─────────────────────────────────────────────

/**
 * 跟 withAnyAuth 一樣接受 session 或 HMAC 其中一個，但 session 那條路必須是 admin/system
 * 角色 —— 用在像 workflow action node（gmail-send、http-request…）這種一般登入使用者
 * 不該直接觸發的內部端點：只有工作流程引擎本身（HMAC）或管理員可以呼叫。
 */
export function withAdminOrHmac(
  path: string,
  handler: ApiHandler
): PlainHandler {
  const inner = withAnyAuth(path, async (req, context) => {
    if (req.session.role !== 'admin' && req.session.role !== 'system') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: requires admin session or internal service call' },
        { status: 403 }
      );
    }
    return handler(req, context);
  });
  return inner;
}
