import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { headers } from 'next/headers';

function randomString(len = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function randomAlpha(len = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function makeSvg(text: string) {
  const width = 140;
  const height = 48;
  const bg = '#f6f7fb';
  const fg = '#222';
  const jitter = (v: number) => (Math.floor(Math.random() * (v * 2)) - v);
  const chars = text.split('');
  const cx = 12;
  const fontSize = 28;
  const parts = chars.map((c, i) => {
    const x = cx + i * 24 + jitter(4);
    const y = 30 + jitter(4);
    const rotate = jitter(18);
    return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="${fg}" transform="rotate(${rotate} ${x} ${y})">${c}</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/><g>${parts.join('')}</g></svg>`;
}

const SECRET = process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || process.env.API_HMAC_SECRET || randomString(48);
if (!process.env.CAPTCHA_SECRET && !process.env.SESSION_SECRET && !process.env.API_HMAC_SECRET) {
  console.warn('[captcha] No CAPTCHA_SECRET configured. Using ephemeral in-memory secret; tokens reset on restart.');
}

function sign(text: string): string {
  return crypto.createHmac('sha256', SECRET).update(text).digest('hex');
}

export function generateCaptcha(ttlMs = 5 * 60 * 1000) {
  const value = randomAlpha(5);
  const expires = Date.now() + ttlMs;

  // Create a stateless payload
  const payload = JSON.stringify({ v: value, e: expires });
  const signature = sign(payload);

  // Token = base64(payload) + '.' + signature
  const token = Buffer.from(payload).toString('base64') + '.' + signature;

  const svg = makeSvg(value);
  const image = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

  // Avoid logging CAPTCHA answer value.
  console.log('[captcha] generated stateless', { expires });

  return { token, image };
}

/**
 * Gets the bypass secret from environment or .env.production file
 */
export function getBypassSecret(): string | undefined {
  let secret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || process.env.QA_CAPTCHA_BYPASS;

  if (!secret) {
    try {
      const envProdPath = path.resolve(process.cwd(), '.env.production');
      if (fs.existsSync(envProdPath)) {
        const fileContent = fs.readFileSync(envProdPath, 'utf8');
        const envConfig = dotenv.parse(fileContent);
        secret = envConfig.LOGIN_BYPASS_SECRET || envConfig.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || envConfig.QA_CAPTCHA_BYPASS;
        if (secret) {
          // Sync back to process.env so subsequent calls are faster
          process.env.LOGIN_BYPASS_SECRET = secret;
          console.log('[captcha] Loaded bypass secret from .env.production');
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  return secret;
}

export async function verifyCaptcha(token: string | undefined, value: string | undefined) {
  // Common bypass code for automated testing
  const bypassSecret = getBypassSecret();

  // 1. Check bypass via provided value (form field)
  if (bypassSecret && value && value.trim() === bypassSecret.trim()) {
    console.log('[captcha] bypass code used via value');
    return true;
  }

  // 2. Check bypass via Request Header (X-E2E-Secret)
  try {
    const headerList = await headers();
    const e2eHeader = headerList.get('X-E2E-Secret');
    if (bypassSecret && e2eHeader && e2eHeader.trim() === bypassSecret.trim()) {
      console.log('[captcha] bypass code used via X-E2E-Secret header');
      return true;
    }
  } catch (err) {
    // headers() might throw if called outside of request context (e.g. build time)
  }

  if (!token || !value) {
    console.log('[captcha] missing token or value');
    return false;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.log('[captcha] invalid token format');
      return false;
    }

    const [b64, signature] = parts;
    const payloadStr = Buffer.from(b64, 'base64').toString('utf8');

    // Verify signature first
    const expectedSig = sign(payloadStr);
    if (signature !== expectedSig) {
      console.log('[captcha] signature mismatch');
      return false;
    }

    const payload = JSON.parse(payloadStr);

    // Check expiration
    if (Date.now() > payload.e) {
      console.log('[captcha] token expired');
      return false;
    }

    // Check value
    const expectedValue = payload.v;
    const ok = String(expectedValue).toLowerCase() === String(value).trim().toLowerCase();

    console.log('[captcha] verify result', { ok });
    return ok;
  } catch (e) {
    console.error('[captcha] verify error', e);
    return false;
  }
}

export function clearExpired() {
  // No-op for stateless
}
