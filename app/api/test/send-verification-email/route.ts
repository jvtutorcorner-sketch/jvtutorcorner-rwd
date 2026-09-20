import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationEmailDetailed, generateVerificationToken } from '@/lib/email/verificationService';
import { getBypassSecret } from '@/lib/captcha';

/**
 * 診斷端點：測試 Email 驗證信發送功能並回傳「各管道為什麼失敗」
 *
 * 用途：production（Amplify）上註冊顯示「發送失敗」時，各管道的真實錯誤
 * （gmail/resend 的 error）平常只會寫進 CloudWatch。此端點把它們攤到 HTTP
 * 回應，讓我們從外部就能判定是「未配置」還是「SMTP 逾時/被封鎖」。
 *
 * 保護：需提供 bypass secret（沿用登入/QA 既有的 LOGIN_BYPASS_SECRET 等），
 * 否則一律回 404，避免在 prod 裸奔洩漏設定來源。
 *
 * 使用方式:
 *   POST /api/test/send-verification-email?secret=<BYPASS_SECRET>
 *   或帶 header：X-E2E-Secret: <BYPASS_SECRET>
 *   Body: { "email": "test@example.com" }
 *
 * ⚠️ 診斷完成後應移除或關閉此端點（見 verification 收尾）。
 */

/** 驗證請求是否帶了正確的 bypass secret；未設定 secret 時視為不可用（回 false）。 */
function isAuthorized(req: NextRequest): boolean {
    const configured = getBypassSecret();
    if (!configured) return false;
    const provided =
        req.nextUrl.searchParams.get('secret') ||
        req.headers.get('x-e2e-secret') ||
        req.headers.get('x-diagnostic-secret') ||
        '';
    return provided.trim() === configured.trim();
}

const NOT_FOUND = NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NOT_FOUND;

    try {
        const { email } = await req.json();

        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { ok: false, error: 'Valid email required' },
                { status: 400 }
            );
        }

        console.log('[Test API] Testing email verification send for:', email);

        // Generate test token
        const token = generateVerificationToken();
        console.log('[Test API] Generated token:', token.substring(0, 16) + '...');

        // Attempt to send and capture per-channel diagnosis
        console.log('[Test API] Calling sendVerificationEmailDetailed()...');
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host');
        const requestOrigin = host ? `${protocol}://${host}` : undefined;
        const diagnosis = await sendVerificationEmailDetailed(email, token, requestOrigin);

        console.log('[Test API] Send diagnosis:', diagnosis);

        return NextResponse.json({
            ok: true,
            email,
            requestOrigin: requestOrigin ?? null,
            tokenPreview: token.substring(0, 16) + '...',
            // 結構化診斷：success / channel / baseUrl / gmail{success,error,configSource} / resend{...}
            diagnosis,
            instructions: 'diagnosis.gmail.error 與 diagnosis.resend.error 說明各管道失敗原因',
        }, { status: 200 });

    } catch (error) {
        console.error('[Test API] Error:', error);
        return NextResponse.json(
            {
                ok: false,
                error: String(error),
                message: 'Test failed - check server logs'
            },
            { status: 500 }
        );
    }
}

/**
 * GET 端點：顯示使用說明（同樣需要 secret，否則回 404）
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) return NOT_FOUND;

    return NextResponse.json({
        endpoint: '/api/test/send-verification-email',
        method: 'POST',
        auth: 'requires ?secret=<BYPASS_SECRET> or X-E2E-Secret header',
        description: 'Test email verification sending and return per-channel diagnosis',
        body: {
            email: 'test@example.com'
        },
        response: {
            ok: true,
            diagnosis: {
                success: false,
                channel: null,
                baseUrl: 'https://www.jvtutorcorner.com',
                gmail: { success: false, error: 'Gmail SMTP not configured | ETIMEDOUT | Invalid login ...', configSource: 'Environment Variables | DynamoDB' },
                resend: { success: false, error: 'Resend not configured | ...', configSource: 'Environment Variables | DynamoDB' },
            },
        },
        notes: [
            'This endpoint is for diagnosis only and should be removed/locked after use',
            'gmail.error === "Gmail SMTP not configured" → Amplify env vars missing',
            'gmail.error contains ETIMEDOUT/ESOCKET/ECONNREFUSED → Amplify blocks outbound SMTP',
            'gmail.error contains "Invalid login" → wrong Gmail credential (use 16-char app password)',
        ]
    });
}
