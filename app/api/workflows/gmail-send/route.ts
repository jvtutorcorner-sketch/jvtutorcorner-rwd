import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

/**
 * Gmail SMTP 電子郵件發送 API
 * 使用 Nodemailer + SMTP 傳輸發送 HTML 郵件
 *
 * 必要環境變數：
 *   SMTP_USER  — Gmail 帳號 (e.g. yourname@gmail.com)
 *   SMTP_PASS  — Gmail App 密碼 (16 位元應用程式密碼，非登入密碼)
 * 可選環境變數：
 *   SMTP_HOST  — SMTP 主機，預設 smtp.gmail.com
 *   SMTP_PORT  — SMTP 連接埠，預設 587
 *   SMTP_FROM  — 顯示名稱，預設 "JV Tutor Workflow"
 */
export async function POST(req: NextRequest) {
    try {
        const { to, subject, body, html, purpose } = await req.json();

        if (!to || typeof to !== 'string' || !to.includes('@')) {
            return NextResponse.json({ ok: false, error: 'Valid recipient email is required' }, { status: 400 });
        }

        // --- Whitelist Check ---
        const { isEmailWhitelisted } = await import('@/lib/email/whitelist');
        const isWhitelisted = await isEmailWhitelisted(to);
        
        // Allow bypass if it's a verification email (to let new users register and verify)
        if (!isWhitelisted && purpose !== 'verification') {
            console.warn(`[gmail-send] Blocked sending to ${to} (not in whitelist)`);
            return NextResponse.json({ 
                ok: false, 
                error: `Sending to ${to} is blocked by whitelist configuration.`,
                code: 'WHITELIST_BLOCKED'
            }, { status: 403 });
        }
        // -----------------------

        if (!subject || typeof subject !== 'string') {
            return NextResponse.json({ ok: false, error: 'Subject is required' }, { status: 400 });
        }

        // ── Resolve SMTP configuration ──────────────────────────────────
        let smtpUser = process.env.SMTP_USER;
        let smtpPass = process.env.SMTP_PASS;
        let smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        let smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        let fromName = process.env.SMTP_FROM || 'JV Tutor Workflow';

        // 1. Try active GMAIL integration from DynamoDB
        try {
            const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
            const { ddbDocClient } = await import('@/lib/dynamo');
            const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
            
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#tp = :tp AND #st = :st',
                ExpressionAttributeNames: { '#tp': 'type', '#st': 'status' },
                ExpressionAttributeValues: { ':tp': 'GMAIL', ':st': 'ACTIVE' },
            }));

            if (Items && Items.length > 0) {
                const config = Items[0].config;
                if (config?.smtpUser) smtpUser = config.smtpUser;
                if (config?.smtpPass) smtpPass = config.smtpPass;
                if (config?.smtpHost) smtpHost = config.smtpHost;
                if (config?.smtpPort) smtpPort = parseInt(config.smtpPort, 10);
                if (config?.fromAddress) fromName = config.fromAddress;
            }
        } catch (dbErr) {
            console.warn('[gmail-send] DynamoDB lookup failed, falling back to env vars:', dbErr);
        }

        if (!smtpUser || !smtpPass) {
            console.warn('[gmail-send] SMTP_USER / SMTP_PASS not configured.');
            return NextResponse.json(
                { ok: false, error: 'Gmail credentials not configured. Add a GMAIL integration in /apps or set SMTP_USER and SMTP_PASS in environment.' },
                { status: 503 }
            );
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        // Verify SMTP connection before sending
        await transporter.verify();

        // Support both plain text body and explicit HTML; if only body is given, wrap it in basic HTML
        const htmlContent = html || body
            ? buildHtmlEmail(subject, html || body || '')
            : undefined;

        const info = await transporter.sendMail({
            from: `"${fromName}" <${smtpUser}>`,
            to: to.trim(),
            subject,
            text: body || '',
            ...(htmlContent ? { html: htmlContent } : {}),
        });

        console.log('[gmail-send] Message sent:', info.messageId);

        return NextResponse.json({
            ok: true,
            data: {
                to,
                subject,
                messageId: info.messageId,
                timestamp: new Date().toISOString(),
                status: 'sent',
            },
        });
    } catch (error: any) {
        console.error('[gmail-send] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Gmail send failed',
        }, { status: 500 });
    }
}

/**
 * 將純文字或 HTML 片段包裝成帶有 JV Tutor 品牌樣式的完整 HTML 郵件
 */
function buildHtmlEmail(subject: string, content: string): string {
    // If content already looks like full HTML, return as-is
    if (content.trimStart().toLowerCase().startsWith('<!doctype') ||
        content.trimStart().toLowerCase().startsWith('<html')) {
        return content;
    }

    // Convert newlines to <br> for plain-text content that isn't HTML
    const isHtmlFragment = /<[a-z][\s\S]*>/i.test(content);
    const bodyContent = isHtmlFragment
        ? content
        : content.replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                JV Tutor Corner
              </h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:13px;">自動化工作流程通知</p>
            </td>
          </tr>
          <!-- Subject bar -->
          <tr>
            <td style="background:#eff6ff;padding:16px 40px;border-bottom:1px solid #dbeafe;">
              <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">${escapeHtml(subject)}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.7;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                此郵件由 JV Tutor Corner Workflow 自動發送，請勿直接回覆。
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
