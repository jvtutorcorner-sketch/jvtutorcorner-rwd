// lib/email/checkinTicketService.ts
// Sends the "報名成功 / 報到票券" email containing the student's dynamic QR check-in link.
// Structurally mirrors lib/email/verificationService.ts (own Gmail SMTP / Resend senders,
// whitelist-gated) — this codebase's established convention is one self-contained sender
// per email type rather than a shared transport helper.

import nodemailer from 'nodemailer';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { getBaseEmail, isEmailWhitelisted } from './whitelist';
import { resolveEmailLinkBaseUrl } from './verificationService';
import { signOrderToken } from '@/lib/ticket/ticketToken';

export async function sendCheckinTicketEmail(
  email: string,
  orderId: string,
  courseTitle: string,
  teacherName: string,
  startTime: string
): Promise<boolean> {
  try {
    const whitelisted = await isEmailWhitelisted(email);
    if (!whitelisted) {
      console.warn(`[CheckinTicketService] Blocked sending to ${email} (not in whitelist)`);
      return false;
    }

    const baseUrl = resolveEmailLinkBaseUrl();
    const ticketUrl = `${baseUrl}/ticket/${signOrderToken(orderId)}`;

    const subject = `報名成功！您的報到票券 - ${courseTitle || '課程'}`;
    const html = buildTicketEmailHtml(subject, {
      courseTitle: courseTitle || '課程',
      teacherName: teacherName || '',
      startTime: startTime || '',
      ticketUrl,
    });

    const targetRecipient = getBaseEmail(email);
    if (targetRecipient !== email) {
      console.log(`[CheckinTicketService] Redirecting recipient from ${email} to base email ${targetRecipient}`);
    }

    const gmailResult = await sendViaGmailSmtp(targetRecipient, subject, html);
    if (gmailResult.success) {
      console.log('[CheckinTicketService] Sent via Gmail SMTP:', gmailResult.messageId);
      return true;
    }

    const resendResult = await sendViaResend(targetRecipient, subject, html);
    if (resendResult.success) {
      console.log('[CheckinTicketService] Sent via Resend:', resendResult.messageId);
      return true;
    }

    console.error('[CheckinTicketService] All email methods failed:', {
      gmailError: gmailResult.error,
      resendError: resendResult.error,
    });
    return false;
  } catch (error) {
    console.error('[CheckinTicketService] Critical error sending email:', error);
    return false;
  }
}

function buildTicketEmailHtml(
  subject: string,
  data: { courseTitle: string; teacherName: string; startTime: string; ticketUrl: string }
): string {
  const formattedStart = (() => {
    if (!data.startTime) return '';
    try {
      const d = new Date(data.startTime);
      if (isNaN(d.getTime())) return data.startTime;
      return d.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return data.startTime;
    }
  })();

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
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                JV Tutor Corner
              </h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:13px;">報名成功通知</p>
            </td>
          </tr>
          <tr>
            <td style="background:#eff6ff;padding:16px 40px;border-bottom:1px solid #dbeafe;">
              <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">${escapeHtml(data.courseTitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.7;">
              <p>您已成功報名本課程，以下是您的專屬報到票券。上課當天請於教室門口出示此票券的 QR Code，供助教掃描報到。</p>
              ${data.teacherName ? `<p style="margin:4px 0;"><strong>授課老師：</strong>${escapeHtml(data.teacherName)}</p>` : ''}
              ${formattedStart ? `<p style="margin:4px 0;"><strong>上課時間：</strong>${escapeHtml(formattedStart)}</p>` : ''}
              <div style="text-align:center;margin:28px 0;">
                <a href="${data.ticketUrl}" style="display:inline-block;padding:14px 32px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
                  顯示我的報到票券
                </a>
              </div>
              <p style="font-size:13px;color:#6b7280;">如果上方按鈕無法使用，請改點<a href="${data.ticketUrl}" style="color:#3b82f6;">這個票券連結</a>。此票券在整個課程期間皆可重複使用。</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                此郵件由 JV Tutor Corner 自動發送，請勿直接回覆。
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

async function sendViaResend(to: string, subject: string, html: string) {
  try {
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
      console.warn('[CheckinTicketService] Resend DynamoDB lookup failed:', dbErr);
    }

    if (!apiKey) apiKey = process.env.RESEND_API_KEY;
    if (!fromAddress) fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM;

    if (!apiKey || !fromAddress) {
      return { success: false, error: 'Resend not configured' };
    }

    console.log('[CheckinTicketService] Resend SMTP Config:', {
      host: 'smtp.resend.com', port: 465, user: 'resend', fromAddress, toEmail: to, configSource,
    });

    const transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: apiKey },
      connectionTimeout: 10000,
    });

    await transporter.verify();

    const info = await transporter.sendMail({ from: fromAddress, to: to.trim(), subject, html });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    let errorMsg = String(error);
    if (errorMsg.includes('550') || errorMsg.toLowerCase().includes('domain is not verified')) {
      errorMsg = `Resend 網域未驗證: ${errorMsg}。如果您沒有自訂網域，請將寄件者改為 onboarding@resend.dev。`;
    }
    console.warn('[CheckinTicketService] Resend send failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function sendViaGmailSmtp(to: string, subject: string, html: string) {
  try {
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
      console.warn('[CheckinTicketService] Gmail DynamoDB lookup failed:', dbErr);
    }

    if (!smtpUser) smtpUser = process.env.SMTP_USER;
    if (!smtpPass) smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      return { success: false, error: 'Gmail SMTP not configured' };
    }

    console.log('[CheckinTicketService] Gmail SMTP Config:', {
      host: smtpHost, port: smtpPort, user: smtpUser, fromName, toEmail: to, configSource,
    });

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
    });

    await transporter.verify();

    const fromAddress = `"${fromName}" <${smtpUser}>`;
    const info = await transporter.sendMail({ from: fromAddress, to: to.trim(), subject, html });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    let errorMsg = String(error);
    if (errorMsg.includes('Invalid login') || errorMsg.includes('auth')) {
      errorMsg += ' (若是 Gmail，請確認是否已使用「應用程式密碼」，而非一般密碼)';
    }
    console.warn('[CheckinTicketService] Gmail SMTP send failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}
