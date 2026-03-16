/**
 * 行事曆提醒遷移腳本 - LocalStorage → DynamoDB
 *
 * 此腳本用於將現有 localStorage 中的提醒數據遷移到 DynamoDB
 * 用法：node scripts/migrate-reminders.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// 配置
const TABLE_NAME = process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

// DynamoDB 客戶端
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// 模擬數據源（實際應用中應從資料庫或 API 讀取）
const mockEvents = {
  'course-1-start': {
    id: 'course-1-start',
    title: '數學進階課程',
    courseId: 'course_1',
    start: new Date('2025-02-01T14:00:00Z'),
    teacherName: '李老師',
    studentName: '張三',
  },
  'activity_course_1': {
    id: 'activity_course_1',
    title: '英文會話課',
    courseId: 'course_1',
    start: new Date('2025-02-02T10:00:00Z'),
    teacherName: '王老師',
    studentName: '李四',
  },
  'order-order_123': {
    id: 'order-order_123',
    title: '物理基礎課',
    courseId: 'course_2',
    orderId: 'order_123',
    start: new Date('2025-02-03T15:30:00Z'),
    teacherName: '張老師',
    studentName: '王五',
  },
};

/**
 * 產生提醒 ID
 */
function generateReminderId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `reminder_${timestamp}_${random}`;
}

/**
 * 將 localStorage 格式轉換為 DynamoDB 格式
 */
async function migrateReminder(userId, eventId, reminderMinutes) {
  const event = mockEvents[eventId];

  if (!event) {
    console.warn(`⚠️  事件 ${eventId} 未找到，跳過此提醒`);
    return null;
  }

  const now = new Date();
  const reminderId = generateReminderId();

  const reminder = {
    id: reminderId,
    userId,
    eventId,
    eventStartTime: event.start.toISOString(),
    reminderMinutes: String(reminderMinutes),
    courseId: event.courseId,
    courseName: event.title,
    teacherName: event.teacherName,
    studentName: event.studentName,
    orderId: event.orderId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: reminder,
      })
    );

    console.log(`✅ 已遷移提醒: ${eventId} (提前 ${reminderMinutes} 分鐘)`);
    return reminder;
  } catch (error) {
    console.error(`❌ 遷移失敗 ${eventId}:`, error.message);
    return null;
  }
}

/**
 * 執行遷移
 */
async function migrate() {
  console.log('🚀 開始遷移提醒到 DynamoDB...\n');
  console.log(`表格: ${TABLE_NAME}`);
  console.log(`區域: ${REGION}\n`);

  // 測試數據：basic@test.com (張三) 的提醒
  const testData = {
    'basic@test.com': {
      'course-1-start': '30', // 30 分鐘
      'activity_course_1': '15', // 15 分鐘
      'order-order_123': '60', // 60 分鐘
    },
  };

  let successCount = 0;
  let failureCount = 0;

  for (const [userId, reminders] of Object.entries(testData)) {
    console.log(`\n用戶: ${userId}`);
    console.log('─'.repeat(50));

    for (const [eventId, reminderMinutes] of Object.entries(reminders)) {
      const result = await migrateReminder(userId, eventId, parseInt(reminderMinutes));
      if (result) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 遷移結果:`);
  console.log(`✅ 成功: ${successCount} 個提醒`);
  console.log(`❌ 失敗: ${failureCount} 個提醒`);
  console.log(`\n💾 已同步到 DynamoDB 表格: ${TABLE_NAME}`);
}

// 執行遷移
migrate().catch((error) => {
  console.error('❌ 遷移過程出錯:', error);
  process.exit(1);
});
