/**
 * 遷移 API 路由 - 從 localStorage 遷移提醒到 DynamoDB
 *
 * 端點: POST /api/calendar/reminders/migrate
 * 用途: 批量將現有提醒數據寫入 DynamoDB
 *
 * 請求 Body:
 * {
 *   "userId": "user@example.com",
 *   "reminders": {
 *     "event_id_1": "30",
 *     "event_id_2": "60"
 *   },
 *   "events": {
 *     "event_id_1": {
 *       "title": "課程名稱",
 *       "start": "2025-02-01T14:00:00Z",
 *       "courseId": "course_1",
 *       "teacherName": "老師名稱",
 *       "studentName": "學生名稱",
 *       "orderId": "order_123"
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

// 初始化 DynamoDB 客戶端
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

interface MigrateRequest {
  userId: string;
  reminders: Record<string, string>; // eventId -> reminderMinutes
  events: Record<
    string,
    {
      title: string;
      start: string; // ISO 8601
      courseId?: string;
      teacherName?: string;
      studentName?: string;
      orderId?: string;
    }
  >;
}

/**
 * 產生提醒 ID
 */
function generateReminderId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `reminder_${timestamp}_${random}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: MigrateRequest = await request.json();

    const { userId, reminders, events } = body;

    // 驗證必填欄位
    if (!userId || !reminders || !events) {
      return NextResponse.json(
        {
          ok: false,
          error: 'userId, reminders, and events are required',
        },
        { status: 400 }
      );
    }

    console.log(`[Migrate] 開始遷移用戶 ${userId} 的提醒...`);
    console.log(`[Migrate] 提醒數量: ${Object.keys(reminders).length}`);

    const results = {
      success: [] as string[],
      failed: [] as { eventId: string; error: string }[],
    };

    const now = new Date();

    // 遍歷每個提醒並寫入 DynamoDB
    for (const [eventId, reminderMinutes] of Object.entries(reminders)) {
      try {
        let event = events[eventId];

        // 如果事件未找到，嘗試剝離常見前綴
        if (!event) {
          const prefixes = ['order-', 'activity-', 'course-'];
          for (const prefix of prefixes) {
            if (eventId.startsWith(prefix)) {
              const withoutPrefix = eventId.substring(prefix.length);
              event = events[withoutPrefix];
              if (event) {
                console.log(`[Migrate] 透過剝離前綴 '${prefix}' 找到事件: ${withoutPrefix}`);
                break;
              }
            }
          }
        }

        if (!event) {
          console.warn(`[Migrate] 事件 ${eventId} 未找到，跳過`);
          results.failed.push({
            eventId,
            error: 'Event not found',
          });
          continue;
        }

        // 構建提醒物件（只存索引鍵和遇期時間，名稱欄位不存DB）
        const reminder = {
          id: generateReminderId(),
          userId,
          eventId,
          eventStartTime: event.start,
          reminderMinutes: String(reminderMinutes),
          courseId: event.courseId,
          orderId: event.orderId,          emailStatus: 'pending',  // 初始狀態：待發送          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        // 寫入 DynamoDB
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: reminder,
          })
        );

        console.log(`[Migrate] ✅ 已寫入: ${eventId} (提前 ${reminderMinutes} 分鐘)`);
        results.success.push(eventId);
      } catch (error: any) {
        console.error(`[Migrate] ❌ 失敗: ${eventId}`, error.message);
        results.failed.push({
          eventId,
          error: error.message || 'Write failed',
        });
      }
    }

    console.log(`[Migrate] 完成 - 成功: ${results.success.length}, 失敗: ${results.failed.length}`);

    return NextResponse.json({
      ok: true,
      message: `遷移完成: ${results.success.length} 個成功，${results.failed.length} 個失敗`,
      results,
    });
  } catch (error: any) {
    console.error('[Migrate] 錯誤:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Migration failed',
      },
      { status: 500 }
    );
  }
}
