// lib/auth/sessionManager.ts
// Session token management - creates and verifies server-side session tokens after login

import crypto from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const SESSIONS_TABLE = process.env.DYNAMODB_TABLE_SESSIONS || 'jvtutorcorner-sessions';

/**
 * 解析簽 session token 用的金鑰。
 *
 * 先前漏設時會靜默退回「每個 process 各自隨機產生」的金鑰。在 serverless 上這代表
 * 每個容器都有自己的金鑰：A 容器發出的 token 到 B 容器就驗不過，使用者會隨機被登出，
 * 而且問題只會出現在 log 的一行 warning 裡。正式環境改為直接啟動失敗。
 *
 * 注意：這裡沿用 API_HMAC_SECRET 作為 fallback，等於 session 簽章與服務間 HMAC
 * 共用同一把金鑰。建議另外設定 SESSION_SECRET 把兩個信任域分開。
 */
function resolveSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;

  const sharedHmacSecret = process.env.API_HMAC_SECRET;
  if (sharedHmacSecret) {
    console.warn(
      '[sessionManager] SESSION_SECRET is not set; falling back to API_HMAC_SECRET. ' +
      'Set a dedicated SESSION_SECRET so session signing and service-to-service HMAC use separate keys.'
    );
    return sharedHmacSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[sessionManager] SESSION_SECRET (或 API_HMAC_SECRET) 必須在正式環境設定。' +
      '缺少時每個執行實例會各自產生金鑰，導致 session 在實例之間互不認得。'
    );
  }

  console.warn('[sessionManager] SESSION_SECRET is not set. Using ephemeral in-memory secret; sessions reset on restart.');
  return crypto.randomBytes(48).toString('hex');
}

const SESSION_SECRET = resolveSessionSecret();
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
 * 刪除某個使用者的所有 session（停權 / 封鎖時強制下線）。
 *
 * sessions 表沒有 userId GSI，這裡用 Scan + FilterExpression。這是管理員手動觸發的低頻操作，
 * 而且表內資料 24 小時 TTL 自動清除，量不會大到需要為此加索引。
 * 回傳刪除的 session 數。
 */
export async function deleteSessionsForUser(userId: string): Promise<number> {
  if (!userId) return 0;
  let deleted = 0;
  let lastKey: Record<string, unknown> | undefined;

  try {
    do {
      const res = await ddbDocClient.send(new ScanCommand({
        TableName: SESSIONS_TABLE,
        FilterExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ProjectionExpression: 'sessionId',
        ExclusiveStartKey: lastKey,
      }));
      for (const item of res.Items || []) {
        if (!item.sessionId) continue;
        await ddbDocClient.send(new DeleteCommand({
          TableName: SESSIONS_TABLE,
          Key: { sessionId: item.sessionId },
        }));
        deleted += 1;
      }
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
  } catch (err) {
    console.error('[sessionManager] deleteSessionsForUser error:', err);
  }

  return deleted;
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
