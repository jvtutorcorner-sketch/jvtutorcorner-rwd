import { randomBytes } from 'crypto';

/**
 * Email Verification Service
 */
export async function sendVerificationEmail(email: string, token: string) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    const subject = '請驗證您的 JV Tutor Corner 帳號';
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>歡迎加入 JV Tutor Corner!</h2>
            <p>感謝您的註冊。請點擊下方的按鈕來驗證您的電子郵件地址：</p>
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">
                驗證電子郵件
            </a>
            <p>如果您無法點擊按鈕，請複製以下連結至瀏覽器：</p>
            <p><a href="${verifyUrl}">${verifyUrl}</a></p>
            <p>此連結將在 24 小時後失效。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">如果您沒有註冊 JV Tutor Corner，請忽略此郵件。</p>
        </div>
    `;

    // Internal API call to send email
    // We use purpose: 'verification' to bypass the initial whitelist check
    const sendApi = `${baseUrl}/api/workflows/gmail-send`; // Or resend-send
    
    try {
        const res = await fetch(sendApi, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // We might need an internal secret or HMAC here if the route is protected
                // For now, these routes are protected by CRON_SECRET or session in production
            },
            body: JSON.stringify({
                to: email,
                subject,
                html,
                purpose: 'verification'
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to send verification email');
        }

        return true;
    } catch (error) {
        console.error('[VerificationService] Error sending email:', error);
        return false;
    }
}

export function generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
}
