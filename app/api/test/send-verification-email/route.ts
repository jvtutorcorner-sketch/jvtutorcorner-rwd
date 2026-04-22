import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationEmail, generateVerificationToken } from '@/lib/email/verificationService';

/**
 * 診斷端點：測試 Email 驗證信發送功能
 * 
 * 使用方式:
 * POST http://localhost:3000/api/test/send-verification-email
 * Body: {
 *   "email": "test@example.com"
 * }
 */
export async function POST(req: NextRequest) {
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

        // Attempt to send
        console.log('[Test API] Calling sendVerificationEmail()...');
        const result = await sendVerificationEmail(email, token);

        console.log('[Test API] Send result:', result);

        return NextResponse.json({
            ok: true,
            message: 'Email send test initiated',
            email,
            tokenPreview: token.substring(0, 16) + '...',
            sendResult: result,
            instructions: 'Check server console logs for [VerificationService] messages'
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
 * GET 端點：顯示使用說明
 */
export async function GET() {
    return NextResponse.json({
        endpoint: '/api/test/send-verification-email',
        method: 'POST',
        description: 'Test email verification sending',
        body: {
            email: 'test@example.com'
        },
        response: {
            ok: true,
            message: 'Email send test initiated',
            email: 'test@example.com',
            sendResult: true,
            instructions: 'Check server console logs for [VerificationService] messages'
        },
        notes: [
            'This endpoint is for testing only',
            'Check server console for [VerificationService] log messages',
            'Look for either [VerificationService] Sent via Resend or [VerificationService] Sent via Gmail SMTP',
            'Make sure SMTP_USER/SMTP_PASS or RESEND_API_KEY is configured'
        ]
    });
}
