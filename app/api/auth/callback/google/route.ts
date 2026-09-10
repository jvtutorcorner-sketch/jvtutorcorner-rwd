import { NextResponse } from 'next/server';
import {
    exchangeCodeForTokens,
    verifyGoogleIdToken,
    isEmailDomainAllowed,
    isGoogleSSOConfigured,
} from '@/lib/auth/googleSSO';
import { findProfileByEmail, putProfile } from '@/lib/profilesService';
import { createSession } from '@/lib/auth/sessionManager';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

function redirectWithError(request: Request, code: string) {
    return NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
}

/**
 * 真正的 Google OAuth2 / OIDC callback：
 *   1. state 比對（CSRF：query string 的 state 必須等於 /api/auth/google/start 放進 cookie 的值）
 *   2. authorization code exchange（跟 Google 換 id_token，無效或已用過的 code 這步會失敗）
 *   3. id_token 簽章 / issuer / audience / 過期時間 / nonce 驗證
 *   4. 網域白名單（GOOGLE_SSO_ALLOWED_DOMAINS，未設定則不限制）
 *   5. find-or-create Profile，建立真正的 server-side session（跟 /api/login 用同一套 createSession）
 *
 * 先前的版本收到任何 "code" 字串就視為登入成功，且前端直接信任 URL 上的 email query
 * param 建立本地使用者狀態 —— 等於任何人都能用 ?google_auth_success=true&email=<任意信箱>
 * 冒充該信箱登入。這裡改成整個身分只由 server session cookie 決定，URL 不再帶身分資訊。
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
        console.error('Google OAuth error:', error);
        return redirectWithError(request, 'google_auth_failed');
    }

    if (!code || !state) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!isGoogleSSOConfigured()) {
        return redirectWithError(request, 'google_sso_not_configured');
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)g_oauth=([^;]+)/);
    const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
    const [expectedState, expectedNonce] = cookieValue.split('.');

    if (!expectedState || !expectedNonce || expectedState !== state) {
        console.warn('[google callback] state mismatch or missing g_oauth cookie (possible CSRF or expired flow)');
        return redirectWithError(request, 'google_auth_failed');
    }

    let email: string;
    let firstName: string | undefined;
    let lastName: string | undefined;

    try {
        const redirectUri = new URL('/api/auth/callback/google', request.url).toString();
        const tokens = await exchangeCodeForTokens(code, redirectUri);
        const identity = await verifyGoogleIdToken(tokens.id_token, expectedNonce);
        email = identity.email;
        firstName = identity.firstName;
        lastName = identity.lastName;
    } catch (err: any) {
        console.error('[google callback] token exchange / id_token verification failed:', err?.message || err);
        return redirectWithError(request, 'google_auth_failed');
    }

    if (!isEmailDomainAllowed(email)) {
        console.warn(`[google callback] email domain not in whitelist: ${email}`);
        return redirectWithError(request, 'google_auth_domain_denied');
    }

    // Find-or-create Profile
    let profile: any;
    try {
        profile = await findProfileByEmail(email);
        if (!profile) {
            const id = randomUUID();
            profile = {
                id,
                roid_id: id,
                email,
                firstName: firstName || 'Google',
                lastName: lastName || 'User',
                role: 'student',
                // lib/plans.ts DEFAULT_PLAN_ID — 'basic' is the legacy synonym of 'free'.
                plan: 'free',
                isB2B: false,
                emailVerified: true, // Google 已驗證過
                emailVerificationStatus: 'verified',
                authProvider: 'google',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await putProfile(profile);
        }
    } catch (err: any) {
        console.error('[google callback] profile lookup/create failed:', err?.message || err);
        return redirectWithError(request, 'google_auth_failed');
    }

    const canonicalId = profile.roid_id || profile.id;
    let sessionToken: string | null = null;
    try {
        sessionToken = await createSession({
            userId: canonicalId,
            email: profile.email,
            role: profile.role || 'student',
            plan: profile.plan || 'free',
        });
    } catch (err: any) {
        console.error('[google callback] failed to create session:', err?.message || err);
        return redirectWithError(request, 'google_auth_failed');
    }

    const successRedirectUrl = new URL('/login?google_auth_success=true', request.url);
    const res = NextResponse.redirect(successRedirectUrl);

    const isProduction = process.env.NODE_ENV === 'production';
    res.headers.append(
        'Set-Cookie',
        `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400${isProduction ? '; Secure' : ''}`
    );
    // 清掉一次性的 state/nonce cookie
    res.headers.append('Set-Cookie', `g_oauth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);

    return res;
}
