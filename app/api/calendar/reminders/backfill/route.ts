/**
 * Backfill API - 更新 jvtutorcorner-calendar-reminders 資料表欄位
 *
 * POST /api/calendar/reminders/backfill
 * - 掃描全表，補齊缺少 emailStatus 的記錄（設為 'pending'）
 * - 只更新缺少的欄位，不覆蓋已有值
 *
 * GET /api/calendar/reminders/backfill
 * - 回傳資料表統計（總數、各 emailStatus 計數）
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

const client = new DynamoDBClient({
  region,
  credentials: accessKey && secretKey ? {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    ...(sessionToken ? { sessionToken } : {}),
  } : undefined,
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME =
  process.env.DYNAMODB_TABLE_CALENDAR_REMINDERS || 'jvtutorcorner-calendar-reminders';

// GET: 取得資料表統計
export async function GET() {
  try {
    const stats = {
      total: 0,
      emailStatus: {
        pending: 0,
        sent: 0,
        failed: 0,
        not_sent: 0,
        missing: 0,   // 沒有 emailStatus 欄位的舊記錄
      },
    };

    let lastKey: Record<string, any> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: 'id, emailStatus',
          ExclusiveStartKey: lastKey,
        })
      );

      for (const item of result.Items || []) {
        stats.total++;
        const s = item.emailStatus as string | undefined;
        if (!s) {
          stats.emailStatus.missing++;
        } else if (s === 'pending') {
          stats.emailStatus.pending++;
        } else if (s === 'sent') {
          stats.emailStatus.sent++;
        } else if (s === 'failed') {
          stats.emailStatus.failed++;
        } else if (s === 'not_sent') {
          stats.emailStatus.not_sent++;
        }
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return NextResponse.json({ ok: true, stats });
  } catch (error: any) {
    console.error('[backfill GET] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get stats' },
      { status: 500 }
    );
  }
}

// POST: 執行 backfill — 補齊缺少 emailStatus 的記錄
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // isAdmin 驗證
    const isAdmin = body.isAdmin === true;
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }

    const results = {
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      failedIds: [] as string[],
    };

    const now = new Date().toISOString();
    let lastKey: Record<string, any> | undefined;

    do {
      const scanResult = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'attribute_not_exists(emailStatus)',
          ExclusiveStartKey: lastKey,
        })
      );

      results.scanned += scanResult.Count || 0;

      for (const item of scanResult.Items || []) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { id: item.id },
              UpdateExpression:
                'SET emailStatus = :status, updatedAt = :now',
              ConditionExpression: 'attribute_not_exists(emailStatus)',
              ExpressionAttributeValues: {
                ':status': 'pending',
                ':now': now,
              },
            })
          );
          results.updated++;
        } catch (err: any) {
          // ConditionalCheckFailed = 另一執行緒已先更新，可忽略
          if (err?.name === 'ConditionalCheckFailedException') {
            results.skipped++;
          } else {
            console.error(`[backfill] failed to update ${item.id}:`, err.message);
            results.failed++;
            results.failedIds.push(item.id);
          }
        }
      }

      lastKey = scanResult.LastEvaluatedKey;
    } while (lastKey);

    console.log('[backfill] 完成:', results);

    return NextResponse.json({
      ok: true,
      message: `Backfill 完成：更新 ${results.updated} 筆，跳過 ${results.skipped} 筆，失敗 ${results.failed} 筆`,
      results,
    });
  } catch (error: any) {
    console.error('[backfill POST] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Backfill failed' },
      { status: 500 }
    );
  }
}
