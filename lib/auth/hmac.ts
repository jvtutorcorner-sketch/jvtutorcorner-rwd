// lib/auth/hmac.ts
// HMAC 簽名驗證 — 用於服務間 API 呼叫（server-to-server）
// 例如：內部 cron job、webhook、或後台服務呼叫 API

import crypto from 'crypto';

const HMAC_SECRET = process.env.API_HMAC_SECRET || '';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 分鐘容許誤差，防重放攻擊

/**
 * 計算 HMAC-SHA256 簽名
 * Message = `${method}\n${path}\n${timestamp}\n${body}`
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
  const diff = Math.abs(Date.now() - ts);
  if (diff > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, reason: `Timestamp out of tolerance (diff=${diff}ms)` };
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
 * 從 Next.js Request 解析並驗證 HMAC
 * 回傳 { valid, reason }
 * rawBody 必須由呼叫者先讀取（避免 stream 消耗問題）
 */
export function verifyHmacFromHeaders(req: Request, path: string, rawBody: string): { valid: boolean; reason?: string } {
  const timestamp = req.headers.get('x-api-timestamp') || '';
  const signature = req.headers.get('x-api-signature') || '';

  if (!timestamp || !signature) {
    return { valid: false, reason: 'Missing X-Api-Timestamp or X-Api-Signature headers' };
  }

  return verifyHmacRequest(req.method, path, timestamp, rawBody, signature);
}

/**
 * 產生 HMAC 請求 headers（供客戶端 / 內部服務呼叫時使用）
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
