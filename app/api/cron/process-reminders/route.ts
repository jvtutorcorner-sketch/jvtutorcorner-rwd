// app/api/cron/process-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  UpdateCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import nodemailer from 'nodemailer';
import { COURSES } from '@/data/courses';

export const dynamic = 'force-dynamic';

// DynamoDB configuration
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

const client = new DynamoDBClient({
  region,
  credentials: accessKey && secretKey ? {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    ...(sessionToken ? { sessionToken } : {})
  } : undefined
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders';
const CRON_SECRET = process.env.CRON_SECRET;

// ── Email Sending ────────────────────────────────────────────────────────
async function sendReminderEmail(to: string, courseTitle: string, startTime: string, reminderMinutes: string) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP credentials not configured');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const formattedTime = new Date(startTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  await transporter.sendMail({
    from: `"JV Tutor 課程提醒" <${user}>`,
    to,
    subject: `[課程提醒] ${courseTitle} 將於 ${reminderMinutes} 分鐘後開始`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #4f46e5;">課程即將開始提醒</h2>
        <p>親愛的學生，您好：</p>
        <p>您報名的課程 <strong>${courseTitle}</strong> 即將在 <strong>${reminderMinutes} 分鐘後</strong> 開始。</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0;"><strong>課程名稱：</strong> ${courseTitle}</p>
          <p style="margin: 5px 0 0 0;"><strong>開始時間：</strong> ${formattedTime}</p>
        </div>
        <p>請準時進入教室，祝您學習愉快！</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">此為系統自動發送郵件，請勿直接回覆。</p>
      </div>
    `,
  });
}

// ── POST: Logic to process reminders ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const authHeader = request.headers.get('Authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      // Allow local testing if secret is not set, but warn
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      console.warn('[process-reminders] Authorized by non-production mode bypass (missing or mismatching CRON_SECRET)');
    }

    const now = new Date();
    
    // 2. Fetch all pending reminders
    // Ideally we use a GSI with status=pending, but for now we'll scan and filter
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'emailStatus = :status',
      ExpressionAttributeValues: { ':status': 'pending' }
    }));

    const reminders = (result.Items || []) as any[];
    console.log(`[process-reminders] Found ${reminders.length} pending reminders`);

    const processed = [];
    const errors = [];

    for (const r of reminders) {
      try {
        const eventTime = new Date(r.eventStartTime);
        const reminderMinutes = parseInt(r.reminderMinutes || '15', 10);
        const targetTime = new Date(eventTime.getTime() - reminderMinutes * 60000);

        // Check if it's time to send (within 5 minutes window or already past)
        if (now >= targetTime) {
          const course = COURSES.find(c => c.id === r.courseId);
          const courseTitle = course?.title || '您的課程';

          // Send email
          await sendReminderEmail(r.userId, courseTitle, r.eventStartTime, r.reminderMinutes);

          // Update status in DB
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: r.id },
            UpdateExpression: 'SET emailStatus = :status, emailSentAt = :sentAt, updatedAt = :now',
            ExpressionAttributeValues: {
              ':status': 'sent',
              ':sentAt': new Date().toISOString(),
              ':now': new Date().toISOString()
            }
          }));

          processed.push(r.id);
          console.log(`[process-reminders] Sent reminder ${r.id} to ${r.userId}`);
        } else {
          // Not yet time
          console.log(`[process-reminders] Skipping ${r.id} (not time yet: ${targetTime.toISOString()})`);
        }
      } catch (err: any) {
        console.error(`[process-reminders] Error processing ${r.id}:`, err.message);
        
        // Update failed status
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: r.id },
          UpdateExpression: 'SET emailStatus = :status, emailError = :err, updatedAt = :now',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':err': err.message,
            ':now': new Date().toISOString()
          }
        }));
        
        errors.push({ id: r.id, error: err.message });
      }
    }

    return NextResponse.json({
      ok: true,
      processedCount: processed.length,
      errorCount: errors.length,
      processedIds: processed,
      errors
    });

  } catch (error: any) {
    console.error('[process-reminders] Global error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
