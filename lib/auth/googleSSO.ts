// lib/auth/googleSSO.ts
// 真正的 Google OAuth2 / OIDC 驗證邏輯：authorization code exchange、id_token 簽章/發行者/
// 受眾/過期時間驗證、企業網域白名單。取代 app/api/auth/callback/google/route.ts 先前
// 「收到任何 code 字串就當作登入成功」的 prototype stub。
//
// 需要環境變數：
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — Google Cloud Console OAuth 2.0 用戶端
//   GOOGLE_OAUTH_REDIRECT_URI（可選）— 未設定時由請求本身的 origin 推導
//   GOOGLE_SSO_ALLOWED_DOMAINS（可選）— 逗號分隔的網域白名單；未設定則不限制網域

import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getGoogleJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
  }
  return jwks;
}

export function isGoogleSSOConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(params: { state: string; nonce: string; redirectUri: string }): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  // 每次都要求同意畫面 + 選帳號，避免瀏覽器自動用上一個 Google session 靜默登入錯的帳號。
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

/**
 * 用 authorization code 換 token（第 1 步：token exchange）。
 * 失敗（無效 code、重放的 code、redirect_uri 不符…）會 throw，呼叫端一律導回 /login?error=…，
 * 不透露細節給使用者。
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing)');
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.id_token) {
    throw new Error('Google token response missing id_token');
  }
  return data;
}

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

/**
 * 驗證 id_token（第 2 步）：
 *   - 簽章（透過 Google 的 JWKS 端點，jose 會自動處理 kid 對應與快取）
 *   - issuer 必須是 accounts.google.com
 *   - audience 必須等於我們自己的 GOOGLE_CLIENT_ID
 *   - 過期時間（jwtVerify 內建檢查 exp/nbf/iat）
 *   - nonce 必須跟我們發起這次登入時放進 cookie 的 nonce 一致（防止 token 被重放到別的登入流程）
 *   - email_verified 必須是 true（拒絕未驗證的 Google 信箱）
 */
export async function verifyGoogleIdToken(idToken: string, expectedNonce: string): Promise<VerifiedGoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const { payload } = await jwtVerify(idToken, getGoogleJwks(), {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
  });

  if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
    throw new Error('id_token nonce mismatch (possible replay attack)');
  }
  if (payload.email_verified !== true) {
    throw new Error('Google account email is not verified');
  }
  if (typeof payload.email !== 'string' || !payload.email) {
    throw new Error('id_token missing email claim');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('id_token missing sub claim');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    firstName: typeof payload.given_name === 'string' ? payload.given_name : undefined,
    lastName: typeof payload.family_name === 'string' ? payload.family_name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

/**
 * 企業網域白名單（可選）。GOOGLE_SSO_ALLOWED_DOMAINS 未設定時不限制 —— 一般 B2C 使用者也能用
 * Google 帳號登入；設定後（例如企業 SSO 只想接受 @acme.com）才會擋掉不符網域的信箱。
 */
export function isEmailDomainAllowed(email: string): boolean {
  const allowList = (process.env.GOOGLE_SSO_ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (allowList.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return allowList.includes(domain);
}
