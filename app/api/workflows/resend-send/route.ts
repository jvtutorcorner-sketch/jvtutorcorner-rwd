import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const runtime = 'nodejs';

/**
 * Resend SMTP 郵件發送 API
 * 從 /apps 頁面設定的 RESEND 整合取得 API Key 與寄件者，
 * 透過 smtp.resend.com (port 465) 發送郵件。
 *
 * 若 DynamoDB 查無 RESEND 整合，fallback 至環境變數 RESEND_API_KEY + RESEND_FROM。
 */
export async function POST(req: NextRequest) {
    try {
        const { to, subject, body, html } = await req.json();

        if (!to || typeof to !== 'string' || !to.includes('@')) {
            return NextResponse.json({ ok: false, error: 'Valid recipient email is required' }, { status: 400 });
        }
        if (!subject || typeof subject !== 'string') {
            return NextResponse.json({ ok: false, error: 'Subject is required' }, { status: 400 });
        }

        // ── Resolve API Key & from address ────────────────────────────────
        let apiKey: string | undefined;
        let fromAddress: string | undefined;

        // 1. Try active RESEND app-integration from DynamoDB
        try {
            const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
            const { Items } = await ddbDocClient.send(new ScanCommand({
                TableName: APPS_TABLE,
                FilterExpression: '#tp = :tp AND #st = :st',
                ExpressionAttributeNames: { '#tp': 'type', '#st': 'status' },
                ExpressionAttributeValues: { ':tp': 'RESEND', ':st': 'ACTIVE' },
            }));
            if (Items && Items.length > 0) {
                apiKey = Items[0].config?.smtpPass;       // Resend stores API Key as smtpPass
                fromAddress = Items[0].config?.fromAddress;
            }
        } catch (dbErr) {
            console.warn('[resend-send] DynamoDB lookup failed, falling back to env vars:', dbErr);
        }

        // 2. Fallback to env vars
        if (!apiKey) apiKey = process.env.RESEND_API_KEY;
        if (!fromAddress) fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM;

        if (!apiKey) {
            return NextResponse.json(
                { ok: false, error: 'Resend API Key not configured. Add a RESEND integration in /apps or set RESEND_API_KEY in environment.' },
                { status: 503 }
            );
        }
        if (!fromAddress) {
            return NextResponse.json(
                { ok: false, error: 'Sender address not configured. Set fromAddress in the RESEND integration or RESEND_FROM env var.' },
                { status: 503 }
            );
        }

        // ── Build HTML content ─────────────────────────────────────────────
        const htmlContent = html || body
            ? buildHtmlEmail(subject, html || body || '')
            : undefined;

        // ── Send via Resend SMTP ───────────────────────────────────────────
        const transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
                user: 'resend',
                pass: apiKey,
            },
        });

        await transporter.verify();

        const info = await transporter.sendMail({
            from: fromAddress,
            to: to.trim(),
            subject,
            text: body || '',
            ...(htmlContent ? { html: htmlContent } : {}),
        });

        console.log('[resend-send] Message sent:', info.messageId);

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
        console.error('[resend-send] error:', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Resend send failed',
        }, { status: 500 });
    }
}

/**
 * 將純文字或 HTML 片段包裝成帶有 JV Tutor 品牌樣式的完整 HTML 郵件
 */
function buildHtmlEmail(subject: string, content: string): string {
    if (
        content.trimStart().toLowerCase().startsWith('<!doctype') ||
        content.trimStart().toLowerCase().startsWith('<html')
    ) {
        return content;
    }

    const isHtmlFragment = /<[a-z][\s\S]*>/i.test(content);
    const bodyContent = isHtmlFragment ? content : content.replace(/\n/g, '<br>');

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
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                JV Tutor Corner
              </h1>
              <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">自動化工作流程通知</p>
            </td>
          </tr>
          <!-- Subject bar -->
          <tr>
            <td style="background:#eef2ff;padding:16px 40px;border-bottom:1px solid #e0e7ff;">
              <p style="margin:0;color:#4338ca;font-size:14px;font-weight:600;">${escapeHtml(subject)}</p>
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
                此郵件由 JV Tutor Corner Workflow (Resend) 自動發送，請勿直接回覆。
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
