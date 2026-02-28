// app/api/calendar/reminders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  QueryCommand, 
  ScanCommand, 
  DeleteCommand,
  GetCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

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

// 精簡結構：名稱欄位不存入DB，查詢時透過 courseId/orderId 動態 join
interface CalendarReminder {
  id: string;
  userId: string;          // 設定提醒的用戶（學生 email）
  eventId: string;         // 日曆事件 ID
  eventStartTime: string;  // ISO8601，用於 GSI 排序
  reminderMinutes: string; // 提前幾分鐘提醒
  courseId?: string;       // 關聯 courses 表
  orderId?: string;        // 關聯 orders 表
  // Email 發送追蹤
  emailStatus?: 'pending' | 'sent' | 'failed' | 'not_sent';
  emailSentAt?: string;    // 成功送出的 ISO8601 時間
  emailError?: string;     // 失敗原因（最後一次）
  createdAt: string;
  updatedAt: string;
}

/**
 * 嘗試透過 GSI 查詢；若 GSI 不存在則降級為 Scan + FilterExpression
 */
async function queryOrScan(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  indexName: string,
  keyCondition: string,
  filterExpression: string | undefined,
  exprValues: Record<string, any>,
  limit: number
): Promise<CalendarReminder[]> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: exprValues,
      Limit: limit,
    }));
    return (result.Items || []) as CalendarReminder[];
  } catch (err: any) {
    // GSI 不存在時降級為 Scan（表已建立但未加 GSI 的情況）
    if (err?.name === 'ValidationException' && err?.message?.includes('index')) {
      console.warn(`[reminders] GSI '${indexName}' 不存在，降級為 Scan`);
      // 將 keyCondition 合併進 FilterExpression
      const combinedFilter = filterExpression
        ? `(${keyCondition}) AND (${filterExpression})`
        : keyCondition;
      const result = await docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: combinedFilter,
        ExpressionAttributeValues: exprValues,
      }));
      const all = (result.Items || []) as CalendarReminder[];
      return all.slice(0, limit);
    }
    throw err;
  }
}

// GET: Fetch reminders with filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const orderId = searchParams.get('orderId');
    const courseId = searchParams.get('courseId');
    const teacherId = searchParams.get('teacherId');
    const studentId = searchParams.get('studentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const isAdmin = searchParams.get('isAdmin') === 'true';

    let reminders: CalendarReminder[] = [];

    if (isAdmin) {
      if (orderId) {
        reminders = await queryOrScan(
          docClient, TABLE_NAME,
          'orderId-index',
          'orderId = :orderId',
          undefined,
          { ':orderId': orderId },
          limit
        );
      } else if (userId) {
        reminders = await queryOrScan(
          docClient, TABLE_NAME,
          'userId-eventStartTime-index',
          'userId = :userId',
          undefined,
          { ':userId': userId },
          limit
        );
      } else if (courseId) {
        reminders = await queryOrScan(
          docClient, TABLE_NAME,
          'courseId-eventStartTime-index',
          'courseId = :courseId',
          undefined,
          { ':courseId': courseId },
          limit
        );
      } else {
        // Scan all for admin (no filter)
        const result = await docClient.send(new ScanCommand({
          TableName: TABLE_NAME,
          Limit: limit
        }));
        reminders = (result.Items || []) as CalendarReminder[];
      }
    } else {
      // Non-admin: only own reminders or order-related
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
      }

      if (orderId) {
        reminders = await queryOrScan(
          docClient, TABLE_NAME,
          'orderId-index',
          'orderId = :orderId',
          'userId = :userId',
          { ':orderId': orderId, ':userId': userId },
          limit
        );
      } else {
        reminders = await queryOrScan(
          docClient, TABLE_NAME,
          'userId-eventStartTime-index',
          'userId = :userId',
          undefined,
          { ':userId': userId },
          limit
        );
      }
    }

    // Client-side filtering for additional criteria
    let filteredReminders = reminders;

    // teacherId/studentId 篩選已移至前端（前端 join COURSES 資料後過濾）
    if (startDate) {
      filteredReminders = filteredReminders.filter(r => r.eventStartTime >= startDate);
    }
    if (endDate) {
      filteredReminders = filteredReminders.filter(r => r.eventStartTime <= endDate);
    }

    // Sort by event start time
    filteredReminders.sort((a, b) => 
      new Date(a.eventStartTime).getTime() - new Date(b.eventStartTime).getTime()
    );

    return NextResponse.json({ 
      ok: true, 
      data: filteredReminders,
      count: filteredReminders.length 
    });

  } catch (error: any) {
    console.error('[calendar/reminders GET] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Failed to fetch reminders' 
    }, { status: 500 });
  }
}

// POST: Create a new reminder
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      orderId,
      eventId,
      courseId,
      eventStartTime,
      reminderMinutes
    } = body;
    // courseName/teacherName/studentName/teacherId/studentId 不存入DB
    // 需要時透過 courseId → COURSES，orderId → Orders API 動態取得

    if (!userId || !eventId || !eventStartTime || !reminderMinutes) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing required fields: userId, eventId, eventStartTime, reminderMinutes' 
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const reminder: CalendarReminder = {
      id,
      userId,
      eventId,
      eventStartTime,
      reminderMinutes: String(reminderMinutes),
      courseId: courseId || undefined,
      orderId: orderId || undefined,
      emailStatus: 'pending',  // 初始狀態：待發送
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: reminder
    }));

    return NextResponse.json({ ok: true, data: reminder });

  } catch (error: any) {
    console.error('[calendar/reminders POST] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Failed to create reminder' 
    }, { status: 500 });
  }
}

// PATCH: Update email send status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, emailStatus, emailError } = body;

    if (!id || !emailStatus) {
      return NextResponse.json({ ok: false, error: 'id and emailStatus required' }, { status: 400 });
    }

    const validStatuses = ['pending', 'sent', 'failed', 'not_sent'];
    if (!validStatuses.includes(emailStatus)) {
      return NextResponse.json({ ok: false, error: `emailStatus must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const isSent = emailStatus === 'sent';

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: isSent
        ? 'SET emailStatus = :status, emailSentAt = :sentAt, updatedAt = :now REMOVE emailError'
        : 'SET emailStatus = :status, emailError = :err, updatedAt = :now',
      ExpressionAttributeValues: isSent
        ? { ':status': emailStatus, ':sentAt': now, ':now': now }
        : { ':status': emailStatus, ':err': emailError || 'unknown error', ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    }));

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ ok: false, error: 'Reminder not found' }, { status: 404 });
    }
    console.error('[calendar/reminders PATCH] Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Failed to update email status' }, { status: 500 });
  }
}

// DELETE: Remove a reminder
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    const isAdmin = searchParams.get('isAdmin') === 'true';

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }

    // Verify ownership unless admin
    if (!isAdmin && userId) {
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
      }));

      if (!result.Item) {
        return NextResponse.json({ ok: false, error: 'Reminder not found' }, { status: 404 });
      }

      if (result.Item.userId !== userId) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
      }
    }

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id }
    }));

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[calendar/reminders DELETE] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Failed to delete reminder' 
    }, { status: 500 });
  }
}
