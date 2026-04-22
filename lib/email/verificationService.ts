import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

/**
 * Email Verification Service
 * 
 * 直接在服務端發送驗證信，避免內部 API 調用的複雜性和延遲
 * 支援 Gmail SMTP 和 Resend 兩種方式，優先使用資料庫中的動態配置
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

    try {
        // 嘗試使用 Gmail SMTP（優先）
        const gmailResult = await sendViaGmailSmtp(email, subject, html);
        if (gmailResult.success) {
            console.log('[VerificationService] Sent via Gmail SMTP:', gmailResult.messageId);
            return true;
        }
        
        // 如果 Gmail SMTP 失敗或未配置，改用 Resend
        const resendResult = await sendViaResend(email, subject, html);
        if (resendResult.success) {
            console.log('[VerificationService] Sent via Resend:', resendResult.messageId);
            return true;
        }

        // 兩種方式都失敗
        console.error('[VerificationService] All email methods failed:', {
            gmailError: gmailResult.error,
            resendError: resendResult.error
        });
        return false;
    } catch (error) {
        console.error('[VerificationService] Critical error sending email:', error);
        return false;
    }
}

/**
 * 透過 Resend SMTP 發送郵件
 */
async function sendViaResend(to: string, subject: string, html: string) {
    try {
        // 1. 嘗試從 DynamoDB 讀取 Resend 配置
        let apiKey: string | undefined;
        let fromAddress: string | undefined;
        let configSource = 'Environment Variables';

        try {
            const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#tp = :tp AND #st = :st',
                ExpressionAttributeNames: { '#tp': 'type', '#st': 'status' },
                ExpressionAttributeValues: { ':tp': 'RESEND', ':st': 'ACTIVE' },
            }));
            if (Items && Items.length > 0) {
                apiKey = Items[0].config?.smtpPass;
                fromAddress = Items[0].config?.fromAddress;
                configSource = 'DynamoDB';
            }
        } catch (dbErr) {
            console.warn('[VerificationService] Resend DynamoDB lookup failed:', dbErr);
        }

        // 2. Fallback 至環境變數
        if (!apiKey) apiKey = process.env.RESEND_API_KEY;
        if (!fromAddress) fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM;

        if (!apiKey || !fromAddress) {
            return { success: false, error: 'Resend not configured' };
        }

        // 診斷日誌 - 記錄實際使用的配置
        console.log('[VerificationService] Resend SMTP Config:', {
            host: 'smtp.resend.com',
            port: 465,
            user: 'resend',
            fromAddress: fromAddress,
            toEmail: to,
            configSource: configSource
        });

        const transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
                user: 'resend',
                pass: apiKey,
            },
            connectionTimeout: 10000,  // 設定連接超時時間
        });

        // 驗證連線 - 確保 Resend 配置正確
        console.log('[VerificationService] Verifying Resend SMTP connection...');
        await transporter.verify();
        console.log('[VerificationService] Resend SMTP connection verified successfully');

        console.log('[VerificationService] Sending email via Resend with from:', fromAddress);

        const info = await transporter.sendMail({
            from: fromAddress,
            to: to.trim(),
            subject,
            html,
        });

        console.log('[VerificationService] Email sent successfully via Resend:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        let errorMsg = String(error);
        
        // 診斷 Resend 特定的錯誤
        if (errorMsg.includes('550') || errorMsg.toLowerCase().includes('domain is not verified')) {
            errorMsg = `Resend 網域未驗證: ${errorMsg}。如果您沒有自訂網域，請將寄件者改為 onboarding@resend.dev。`;
        }
        
        console.warn('[VerificationService] Resend send failed:', errorMsg);
        return { success: false, error: errorMsg };
    }
}

/**
 * 透過 Gmail SMTP 發送郵件
 */
async function sendViaGmailSmtp(to: string, subject: string, html: string) {
    try {
        // 1. 嘗試從 DynamoDB 讀取 Gmail 配置
        let smtpUser: string | undefined;
        let smtpPass: string | undefined;
        let smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        let smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        let fromName = process.env.SMTP_FROM || 'JV Tutor Corner';
        let configSource = 'Environment Variables';

        try {
            const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#tp = :tp AND #st = :st',
                ExpressionAttributeNames: { '#tp': 'type', '#st': 'status' },
                ExpressionAttributeValues: { ':tp': 'GMAIL', ':st': 'ACTIVE' },
            }));
            if (Items && Items.length > 0) {
                const config = Items[0].config;
                smtpUser = config?.smtpUser;
                smtpPass = config?.smtpPass;
                if (config?.smtpHost) smtpHost = config.smtpHost;
                if (config?.smtpPort) smtpPort = parseInt(config.smtpPort, 10);
                if (config?.fromAddress) fromName = config.fromAddress;
                configSource = 'DynamoDB';
            }
        } catch (dbErr) {
            console.warn('[VerificationService] Gmail DynamoDB lookup failed:', dbErr);
        }

        // 2. Fallback 至環境變數
        if (!smtpUser) smtpUser = process.env.SMTP_USER;
        if (!smtpPass) smtpPass = process.env.SMTP_PASS;

        if (!smtpUser || !smtpPass) {
            return { success: false, error: 'Gmail SMTP not configured' };
        }

        // 診斷日誌 - 記錄實際使用的配置
        console.log('[VerificationService] Gmail SMTP Config:', {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
            fromName: fromName,
            toEmail: to,
            configSource: configSource
        });

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
            connectionTimeout: 10000,  // 設定連接超時時間
        });

        // 驗證連線 - 確保 SMTP 配置正確
        console.log('[VerificationService] Verifying Gmail SMTP connection...');
        await transporter.verify();
        console.log('[VerificationService] Gmail SMTP connection verified successfully');

        const fromAddress = `"${fromName}" <${smtpUser}>`;
        console.log('[VerificationService] Sending email with from:', fromAddress);

        const info = await transporter.sendMail({
            from: fromAddress,
            to: to.trim(),
            subject,
            html,
        });

        console.log('[VerificationService] Email sent successfully via Gmail SMTP:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        let errorMsg = String(error);
        
        // 診斷 Gmail 特定的錯誤
        if (errorMsg.includes('Invalid login') || errorMsg.includes('auth')) {
            errorMsg += ' (若是 Gmail，請確認是否已使用「應用程式密碼」，而非一般密碼)';
        }
        
        console.warn('[VerificationService] Gmail SMTP send failed:', errorMsg);
        return { success: false, error: errorMsg };
    }
}

export function generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
}
