// k6/config.js
// 共用設定：目標 URL、測試帳號、HMAC 簽名工具

import { SharedArray } from 'k6/data';
import { crypto } from 'k6/experimental/webcrypto';

import { ACCOUNTS as DATA_ACCOUNTS } from './test_data.js';

// ─── 目標主機 ──────────────────────────────────────────
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ─── 測試帳號 (從 test_data.js 引用) ────────────────────
export const ACCOUNTS = DATA_ACCOUNTS;

function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`[k6/config] Missing required env var: ${name}`);
  }
  return value;
}


// ─── HMAC 簽名工具 ─────────────────────────────────────
// k6 的 WebCrypto  API 支援 HMAC-SHA256
const HMAC_SECRET = requireEnv('API_HMAC_SECRET');

/**
 * 計算 HMAC-SHA256 (hex)
 * 使用 k6 TextEncoder + CryptoKey
 */
export async function computeHmacHex(method, path, timestamp, body) {
  const enc = new TextEncoder();
  const message = [method.toUpperCase(), path, timestamp, body].join('\n');
  const keyData = enc.encode(HMAC_SECRET);
  const msgData = enc.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 產生 HMAC 請求 headers (同步版本，用於不支援 async 的 k6 scenarios)
 * 注意：k6 runtime 的 crypto 是同步的，這裡用簡化版
 */
export function hmacHeaders(method, path, bodyStr) {
  const timestamp = String(Date.now());
  // k6 沒有原生 HMAC，我們使用 k6/crypto（需要 k6 >= 0.37）
  // 若環境不支援，gracefully skip HMAC
  return {
    'X-Api-Timestamp': timestamp,
    'X-Api-Signature': 'hmac-placeholder', // 替換為實際 HMAC 實作
    'Content-Type': 'application/json',
  };
}

// ─── 標準 JSON headers ─────────────────────────────────
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ─── 共用 Thresholds（效能基準）──────────────────────
export const COMMON_THRESHOLDS = {
  // 95% 請求要在 500ms 內完成
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  // 錯誤率低於 1%
  http_req_failed: ['rate<0.01'],
};

// ─── 輸出設定 ─────────────────────────────────────────
export function htmlReport(data) {
  return {
    title: 'JVTutorCorner API Performance Report',
    ...data,
  };
}
