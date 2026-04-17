// lib/auth/sessionManager.ts
// Session token management - creates and verifies server-side session tokens after login

import crypto from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const SESSIONS_TABLE = process.env.DYNAMODB_TABLE_SESSIONS || 'jvtutorcorner-sessions';
const SESSION_SECRET = process.env.SESSION_SECRET || 'jv_session_fallback_secret_2024';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  plan: string;
}

export interface Session extends SessionPayload {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * 產生不可預測的 session token
 * Format: <randomBytes>.<hmac-signature>
 */
function signToken(sessionId: string): string {
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
  return `${sessionId}.${sig}`;
}

/**
 * 驗證 token 簽名，回傳 sessionId 或 null
 */
function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [sessionId, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
  // Constant-time comparison
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return null;
    }
  } catch {
    return null;
  }
  return sessionId;
}

/**
 * 建立新 session（登入後呼叫）
 * 回傳簽名 token 供 cookie 使用
 */
export async function createSession(payload: SessionPayload): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  const session: Session = {
    sessionId,
    ...payload,
    createdAt: now,
    expiresAt,
  };

  await ddbDocClient.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: {
      ...session,
      ttl: expiresAt, // DynamoDB TTL attribute
    },
  }));

  return signToken(sessionId);
}

/**
 * 從 token 取得 session（每次 API 請求驗證）
 */
export async function getSession(token: string): Promise<Session | null> {
  const sessionId = verifyToken(token);
  if (!sessionId) return null;

  try {
    const res = await ddbDocClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }));

    if (!res.Item) return null;

    const session = res.Item as Session;
    const now = Math.floor(Date.now() / 1000);
    if (session.expiresAt < now) {
      // 已過期，順手刪除
      await deleteSession(token);
      return null;
    }

    return session;
  } catch (err) {
    console.error('[sessionManager] getSession error:', err);
    return null;
  }
}

/**
 * 刪除 session（登出）
 */
export async function deleteSession(token: string): Promise<void> {
  const sessionId = verifyToken(token);
  if (!sessionId) return;

  try {
    await ddbDocClient.send(new DeleteCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }));
  } catch (err) {
    console.error('[sessionManager] deleteSession error:', err);
  }
}

/**
 * 從 Next.js Request 取出 session token (Cookie 優先，其次 Authorization header)
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. 從 Authorization: Bearer <token> header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. 從 Cookie: session=<token>
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}
