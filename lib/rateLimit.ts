// lib/rateLimit.ts
// 固定時間窗（fixed window）限流器，計數存在 DynamoDB，讓 serverless 多個執行實例共用同一份計數。
//
// 為什麼不用記憶體：Amplify / Lambda 每個容器都有自己的記憶體，攻擊者的請求會被分散到
// 多個容器，記憶體計數器等於沒擋。DynamoDB 的 ADD 是原子操作，多實例同時累加也不會漏算。
//
// 表結構（scripts/create-rate-limit-table.mjs）：
//   PK: rlKey (S) — `<scope>:<identifier>:<windowStart>`
//   ttl (N)      — DynamoDB TTL，時間窗結束後自動清掉
//
// 表不存在或 DynamoDB 出錯時退回記憶體計數（僅在同一實例內有效），並印出 warning，
// 不會因為限流器壞掉就把整個登入流程擋死。

import { ddbDocClient } from '@/lib/dynamo';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const RATE_LIMIT_TABLE = process.env.DYNAMODB_TABLE_RATE_LIMITS || 'jvtutorcorner-rate-limits';

export interface RateLimitRule {
  /** 命名空間，例如 'login:ip'、'register:ip' */
  scope: string;
  /** 時間窗內允許的最大次數 */
  limit: number;
  /** 時間窗長度（秒） */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 目前時間窗內已用次數（含這一次） */
  count: number;
  limit: number;
  /** 距離時間窗結束的秒數 */
  retryAfterSeconds: number;
}

// ── 記憶體 fallback ────────────────────────────────────────────
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();
let dynamoUnavailableLoggedAt = 0;

function memoryIncrement(key: string, expiresAt: number): number {
  const now = Date.now();
  // 順手清掉過期項目，避免長時間執行的 dev server 記憶體無限成長
  if (memoryCounters.size > 5000) {
    for (const [k, v] of memoryCounters) {
      if (v.expiresAt * 1000 < now) memoryCounters.delete(k);
    }
  }
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt * 1000 < now) {
    memoryCounters.set(key, { count: 1, expiresAt });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function isRateLimitDisabled(): boolean {
  // 本地 / e2e 測試可整體關閉，正式環境永遠開啟。
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DISABLE_RATE_LIMIT === 'true';
}

/**
 * 累加一次並判斷是否超限。
 *
 * 每次呼叫都會計數（包含被擋下的那一次），所以攻擊者持續打只會延長被擋的狀態，
 * 不會因為「被擋的請求不算數」而在時間窗邊界撿到漏洞。
 */
export async function checkRateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const windowEnd = windowStart + rule.windowSeconds;
  const retryAfterSeconds = Math.max(1, windowEnd - nowSec);

  if (isRateLimitDisabled()) {
    return { allowed: true, count: 0, limit: rule.limit, retryAfterSeconds };
  }

  const key = `${rule.scope}:${identifier || 'unknown'}:${windowStart}`;
  let count: number;

  try {
    const res = await ddbDocClient.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { rlKey: key },
      // ADD 是原子的；ttl 用 if_not_exists 保留第一次寫入的值即可。
      UpdateExpression: 'ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
      // 多留 60 秒緩衝：DynamoDB TTL 刪除本來就不是即時的，晚一點刪無妨。
      ExpressionAttributeValues: { ':one': 1, ':ttl': windowEnd + 60 },
      ReturnValues: 'UPDATED_NEW',
    }));
    count = Number(res.Attributes?.count ?? 1);
  } catch (err: any) {
    // 每分鐘最多印一次，避免表不存在時 log 被洗版。
    if (Date.now() - dynamoUnavailableLoggedAt > 60_000) {
      dynamoUnavailableLoggedAt = Date.now();
      console.warn(
        `[rateLimit] DynamoDB unavailable (${err?.name || 'error'}), falling back to in-memory counter. ` +
        `Run scripts/create-rate-limit-table.mjs to create ${RATE_LIMIT_TABLE}.`
      );
    }
    count = memoryIncrement(key, windowEnd);
  }

  return { allowed: count <= rule.limit, count, limit: rule.limit, retryAfterSeconds };
}

/**
 * 只讀取目前時間窗的計數，不累加。用在「先看帳號是否已被鎖，再決定要不要驗密碼」這種
 * 需要先查後記的流程。
 */
export async function getRateLimitCount(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);
  const windowEnd = windowStart + rule.windowSeconds;
  const retryAfterSeconds = Math.max(1, windowEnd - nowSec);

  if (isRateLimitDisabled()) {
    return { allowed: true, count: 0, limit: rule.limit, retryAfterSeconds };
  }

  const key = `${rule.scope}:${identifier || 'unknown'}:${windowStart}`;
  let count = 0;
  try {
    const res = await ddbDocClient.send(new GetCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { rlKey: key },
      ConsistentRead: true,
    }));
    count = Number(res.Item?.count ?? 0);
  } catch {
    const mem = memoryCounters.get(key);
    count = mem && mem.expiresAt * 1000 >= Date.now() ? mem.count : 0;
  }
  return { allowed: count < rule.limit, count, limit: rule.limit, retryAfterSeconds };
}

/**
 * 從 Request 取得用戶端 IP。Amplify / CloudFront / 各種反向代理都會塞 x-forwarded-for，
 * 第一個值是真正的用戶端。取不到就回 'unknown'，這時所有匿名請求會共用一個計數桶，
 * 寧可擋嚴一點也不要完全不擋。
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/** 產生標準 429 回應（含 Retry-After header）。`message` 用 i18n key，前端會 t() 它。 */
export function rateLimitResponse(result: RateLimitResult, message = 'too_many_requests'): Response {
  return new Response(
    JSON.stringify({ ok: false, message, retryAfterSeconds: result.retryAfterSeconds }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
      },
    }
  );
}

// ── 各入口的規則集中在這裡，方便一眼看到全站策略 ─────────────────
export const RATE_LIMIT_RULES = {
  /** 同一 IP 15 分鐘內最多 30 次登入嘗試（成功與失敗都算） */
  loginPerIp: { scope: 'login:ip', limit: 30, windowSeconds: 15 * 60 } as RateLimitRule,
  /** 同一帳號 15 分鐘內最多 8 次密碼錯誤 → 暫時鎖定（防暴力破解／撞庫） */
  loginFailPerEmail: { scope: 'login:fail:email', limit: 8, windowSeconds: 15 * 60 } as RateLimitRule,
  /** 同一 IP 1 小時內最多 5 次註冊（防大量灌假帳號） */
  registerPerIp: { scope: 'register:ip', limit: 5, windowSeconds: 60 * 60 } as RateLimitRule,
  /**
   * 企業 CSV 批次註冊（/api/register/batch）：一次請求最多建立 BATCH_MAX_ROWS 個帳號，
   * 整批只算 registerPerIp 的 1 次，另外再用這條獨立限制批次本身的次數。
   */
  registerBatchPerIp: { scope: 'register:batch:ip', limit: 5, windowSeconds: 60 * 60 } as RateLimitRule,
  /** 同一 IP 1 小時內最多 5 次忘記密碼（每次都會寄信並重設密碼，必須嚴格） */
  forgotPasswordPerIp: { scope: 'forgot:ip', limit: 5, windowSeconds: 60 * 60 } as RateLimitRule,
  /** 同一 Email 1 小時內最多 3 次忘記密碼（防止拿別人信箱洗信 / 反覆重設別人密碼） */
  forgotPasswordPerEmail: { scope: 'forgot:email', limit: 3, windowSeconds: 60 * 60 } as RateLimitRule,
  /** 同一 IP 1 小時內最多 10 次重寄驗證信 */
  resendVerificationPerIp: { scope: 'resend:ip', limit: 10, windowSeconds: 60 * 60 } as RateLimitRule,
  /** 同一使用者 1 小時內最多 30 次送出 AI Media 生成任務(每次都會預扣點數,防洗版) */
  mediaSubmitPerUser: { scope: 'media:submit:user', limit: 30, windowSeconds: 60 * 60 } as RateLimitRule,
};
