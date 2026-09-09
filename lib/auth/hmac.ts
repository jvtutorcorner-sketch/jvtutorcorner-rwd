// lib/auth/hmac.ts
// HMAC 簽名驗證 — 用於服務間 API 呼叫（server-to-server）
// 例如：內部 cron job、webhook、或後台服務呼叫 API

import crypto from 'crypto';

const HMAC_SECRET = process.env.API_HMAC_SECRET || '';
// 舊請求的容許窗口。時間戳只能落後，不能超前 —— 先前用 Math.abs 比較，
// 等於連「未來 5 分鐘」的簽名也收，把重放窗口實際放大成 10 分鐘。
const TIMESTAMP_MAX_AGE_MS = 5 * 60 * 1000;
// 允許呼叫端時鐘些微快於本機，避免正常的伺服器間時差造成偽陰性。
const TIMESTAMP_MAX_SKEW_AHEAD_MS = 30 * 1000;

/**
 * 計算 HMAC-SHA256 簽名
 * Message = `${method}\n${path}\n${timestamp}\n${body}`
 *
 * `path` 必須包含 query string（例如 `/api/points?userId=u1`）。省略 query 會讓
 * 同一組簽名適用於任何參數 —— 例如 `GET /api/points?userId=A` 的簽名可以直接
 * 拿去讀 `?userId=B`。
 */
export function computeHmac(
  method: string,
  path: string,
  timestamp: string,
  body: string
): string {
  if (!HMAC_SECRET) {
    throw new Error('API_HMAC_SECRET is not configured');
  }
  const message = [method.toUpperCase(), path, timestamp, body].join('\n');
  return crypto.createHmac('sha256', HMAC_SECRET).update(message).digest('hex');
}

/**
 * 驗證請求的 HMAC 簽名
 * 預期 Headers:
 *   X-Api-Timestamp: <unix ms>
 *   X-Api-Signature: <hex>
 */
export function verifyHmacRequest(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  signature: string
): { valid: boolean; reason?: string } {
  if (!HMAC_SECRET) {
    return { valid: false, reason: 'HMAC secret not configured on server' };
  }

  // 1. Replay-attack protection: 時間戳必須在容許範圍內
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, reason: 'Invalid timestamp' };
  }
  const age = Date.now() - ts;
  if (age > TIMESTAMP_MAX_AGE_MS) {
    return { valid: false, reason: `Timestamp too old (age=${age}ms)` };
  }
  if (age < -TIMESTAMP_MAX_SKEW_AHEAD_MS) {
    return { valid: false, reason: `Timestamp is in the future (skew=${-age}ms)` };
  }

  // 2. 計算期望簽名並比對
  let expected: string;
  try {
    expected = computeHmac(method, path, timestamp, body);
  } catch (err: any) {
    return { valid: false, reason: err.message };
  }

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) {
      return { valid: false, reason: 'Signature length mismatch' };
    }
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Signature mismatch' };
    }
  } catch {
    return { valid: false, reason: 'Signature comparison error' };
  }

  return { valid: true };
}

/**
 * 從實際請求的 URL 取出要納入簽名的路徑（pathname + query string）。
 */
export function signedPathFromRequest(req: Request): string {
  try {
    const url = new URL(req.url);
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

/**
 * 從 Next.js Request 解析並驗證 HMAC
 * 回傳 { valid, reason }
 * rawBody 必須由呼叫者先讀取（避免 stream 消耗問題）
 *
 * 簽名比對的路徑一律由 `req.url` 推導（含 query string），而不是用呼叫端傳進來的
 * `declaredPath`。這樣做有兩個好處：query string 會被納入簽名，且動態路由
 * （`/api/orders/[orderId]`）不需要各自組出字面路徑就能驗證。`declaredPath`
 * 只留作記錄與錯誤訊息用。
 */
export function verifyHmacFromHeaders(req: Request, declaredPath: string, rawBody: string): { valid: boolean; reason?: string } {
  const timestamp = req.headers.get('x-api-timestamp') || '';
  const signature = req.headers.get('x-api-signature') || '';

  if (!timestamp || !signature) {
    return { valid: false, reason: 'Missing X-Api-Timestamp or X-Api-Signature headers' };
  }

  const path = signedPathFromRequest(req);
  if (!path) {
    return { valid: false, reason: `Could not derive request path (declared: ${declaredPath})` };
  }

  return verifyHmacRequest(req.method, path, timestamp, rawBody, signature);
}

/**
 * 產生 HMAC 請求 headers（供客戶端 / 內部服務呼叫時使用）
 *
 * `path` 要跟接收端看到的請求路徑完全一致，包含 query string。
 */
export function generateHmacHeaders(
  method: string,
  path: string,
  body: string
): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = computeHmac(method, path, timestamp, body);
  return {
    'X-Api-Timestamp': timestamp,
    'X-Api-Signature': signature,
  };
}
