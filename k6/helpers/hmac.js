// k6/helpers/hmac.js
// k6 HMAC-SHA256 簽名工具（使用 k6 內建 crypto module）

import { hmac } from 'k6/crypto';

const HMAC_SECRET = __ENV.API_HMAC_SECRET || 'jv_hmac_secret_change_in_production_2024';

/**
 * 計算 HMAC-SHA256 hex 簽名
 * @param {string} method  - HTTP method (GET, POST, ...)
 * @param {string} path    - API path (/api/points)
 * @param {string} timestamp - Unix ms string
 * @param {string} body    - request body string
 */
export function computeHmac(method, path, timestamp, body) {
  const message = [method.toUpperCase(), path, timestamp, body].join('\n');
  return hmac('sha256', HMAC_SECRET, message, 'hex');
}

/**
 * 產生 HMAC 簽名 Headers
 */
export function generateHmacHeaders(method, path, body = '') {
  const timestamp = String(Date.now());
  const signature = computeHmac(method, path, timestamp, body);
  return {
    'Content-Type': 'application/json',
    'X-Api-Timestamp': timestamp,
    'X-Api-Signature': signature,
  };
}
