import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import nodemailer from 'nodemailer';
import resolveDataFile from '@/lib/localData';

async function readProfiles() {
    try {
        const DATA_FILE = await resolveDataFile('profiles.json');
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (err) {
        return [];
    }
}

function generateRandomPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export async function POST(req: Request) {
    try {
        const { email } = await req.json();
        if (!email) {
            return NextResponse.json({ message: 'Email required' }, { status: 400 });
        }

        const targetEmail = String(email).toLowerCase();

        // Do not allow password reset for test accounts from the API
        if (targetEmail === 'admin@jvtutorcorner.com' || targetEmail === 'teacher@test.com') {
            return NextResponse.json({ ok: false, message: '測試帳號無法重置密碼' }, { status: 400 });
        }

        const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
        const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0 &&
            (process.env.NODE_ENV === 'production' || !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

        let found: any = null;
        let isDynamoRecord = false;

        if (useDynamo) {
            try {
                const scanRes: any = await ddbDocClient.send(new ScanCommand({
                    TableName: PROFILES_TABLE,
                    FilterExpression: 'email = :email',
                    ExpressionAttributeValues: { ':email': targetEmail }
                }));
                if (scanRes?.Count > 0) {
                    found = scanRes.Items[0];
                    isDynamoRecord = true;
                }
            } catch (e) {
                console.warn('[forgot-password] Dynamo scan failed, falling back to file', (e as any)?.message || e);
            }
        }

        if (!found) {
            const profiles = await readProfiles();
            const user = profiles.find((p: any) => p.email === targetEmail);
            if (user) {
                found = user;
            }
        }

        if (!found) {
            return NextResponse.json({ ok: false, message: 'login_account_not_found' }, { status: 404 });
        }

        // Generate new random password
        const newPassword = generateRandomPassword(8);

        // Update in DynamoDB if applicable
        if (isDynamoRecord) {
            try {
                console.log(`[forgot-password] Updating password for ${targetEmail} in DynamoDB`);
                await ddbDocClient.send(new UpdateCommand({
                    TableName: PROFILES_TABLE,
                    Key: { id: found.id },
                    UpdateExpression: 'SET password = :password',
                    ExpressionAttributeValues: {
                        ':password': newPassword
                    }
                }));
            } catch (e) {
                console.error('[forgot-password] Failed to update password in DynamoDB', e);
                return NextResponse.json({ ok: false, message: '密碼更新失敗' }, { status: 500 });
            }
        } else {
            console.warn(`[forgot-password] User ${targetEmail} found in local JSON but updating JSON is currently not supported for password reset.`);
            // For real implementation, consider updating JSON if it's strictly local, but DynamoDB is our main target.
        }

        // Send email with new password
        let emailSent = false;
        const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpUser || !smtpPass) {
            console.warn('[forgot-password] SMTP credentials not configured. Password updated but email NOT sent. New password is:', newPassword);
        } else {
            try {
                console.log(`[forgot-password] Creating transporter with ${smtpHost}:${smtpPort} as ${smtpUser}`);
                const transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: smtpPort,
                    secure: smtpPort === 465,
                    auth: {
                        user: smtpUser,
                        pass: smtpPass,
                    },
                });

                console.log('[forgot-password] Verifying transporter...');
                await transporter.verify();
                console.log('[forgot-password] Transporter verified');

                console.log(`[forgot-password] Sending email to ${targetEmail}...`);
                const info = await transporter.sendMail({
                    from: `"JV Tutor AI 助理" <${smtpUser}>`,
                    to: targetEmail,
                    subject: '[JV Tutor] 您的密碼已重置',
                    html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;padding:20px;color:#333;">
              <h2>密碼重置通知</h2>
              <p>親愛的用戶您好，</p>
              <p>您的密碼已經重置，請使用以下隨機產生的新密碼登入：</p>
              <div style="margin:20px 0;padding:15px;background:#f3f4f6;border-radius:8px;font-size:18px;letter-spacing:1px;">
                <strong>${newPassword}</strong>
              </div>
              <p>登入後，如有需要，您可以在個人設定中修改密碼（若系統支援此功能）。</p>
              <p style="color:#666;font-size:12px;margin-top:40px;">自動發送，請勿直接回覆此信件。</p>
            </div>
          `,
                });
                console.log(`[forgot-password] Password reset email sent to ${targetEmail}. MessageId: ${info.messageId}`);
                emailSent = true;
            } catch (e: any) {
                console.error('[forgot-password] Failed to send email:', e.message || e);
            }
        }

        return NextResponse.json({ ok: true, emailSent, message: 'Password reset successful' });
    } catch (err: any) {
        console.error('[forgot-password] Error:', err);
        return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
    }
}
