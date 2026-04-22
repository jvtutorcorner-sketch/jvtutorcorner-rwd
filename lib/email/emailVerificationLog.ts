import { PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { createHash } from 'crypto';

/**
 * Email Verification Event Log Service
 * 
 * 記錄所有郵件驗證相關的事件，支援審計追蹤和統計分析
 */

export type EmailVerificationEventType = 
  | 'SENT'           // 驗證信已發送
  | 'CLICKED'        // 驗證鏈接被點擊
  | 'VERIFIED'       // 驗證成功
  | 'FAILED'         // 驗證失敗
  | 'RESENT'         // 重新發送驗證信
  | 'EXPIRED'        // token已過期
  | 'THROTTLED';     // 被限流（防止濫用）

export interface EmailVerificationLog {
  id: string;                    // 日誌ID (pk)
  userId: string;                // 用戶ID (gsi-pk)
  email: string;                 // 用戶郵箱 (gsi-pk，支援批量查詢)
  timestamp: string;             // 事件時間戳
  eventType: EmailVerificationEventType;
  
  // Token 信息
  tokenHash: string;             // Token hash（不儲存明文）
  tokenCreatedAt?: string;       // Token 建立時間
  tokenExpiresAt?: string;       // Token 過期時間
  
  // 環境信息
  ipAddress?: string;
  userAgent?: string;
  
  // 結果信息
  status: 'success' | 'failure';
  errorCode?: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'ALREADY_VERIFIED' | 
              'VERIFICATION_FAILED' | 'RATE_LIMITED' | 'NETWORK_ERROR';
  errorMessage?: string;
  
  // 性能指標
  duration?: number;             // 從發送到驗證的秒數
  
  // 重試信息
  attempt?: number;              // 驗證嘗試次數
  
  // TTL (90天後自動刪除)
  ttl?: number;
}

/**
 * 記錄郵件驗證事件到 DynamoDB
 */
export async function logEmailVerificationEvent(
  userId: string,
  email: string,
  eventType: EmailVerificationEventType,
  data: {
    token?: string;
    tokenExpiresAt?: string;
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorCode?: EmailVerificationLog['errorCode'];
    errorMessage?: string;
    duration?: number;
    attempt?: number;
  }
): Promise<void> {
  const LOGS_TABLE = process.env.DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS || 
                     'jvtutorcorner-email-verification-logs';

  const now = new Date();
  const logId = `evlog_${userId}_${Date.now()}`;
  
  // Token hash（防止記錄敏感信息）
  const tokenHash = data.token 
    ? createHash('sha256').update(data.token).digest('hex')
    : undefined;

  const log: EmailVerificationLog = {
    id: logId,
    userId,
    email,
    timestamp: now.toISOString(),
    eventType,
    tokenHash: tokenHash || '',
    tokenCreatedAt: now.toISOString(),
    tokenExpiresAt: data.tokenExpiresAt,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    status: data.status,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    duration: data.duration,
    attempt: data.attempt,
    // 90天後自動刪除
    ttl: Math.floor(now.getTime() / 1000) + (90 * 24 * 60 * 60)
  };

  try {
    await ddbDocClient.send(new PutCommand({
      TableName: LOGS_TABLE,
      Item: log
    }));
    
    console.log(`[EmailVerificationLog] ✅ Event logged: ${eventType} for ${email}`);
  } catch (error) {
    // 日誌失敗不應該中斷主流程
    console.error('[EmailVerificationLog] ❌ Failed to log event:', error);
  }
}

/**
 * 查詢特定用戶的所有驗證事件
 */
export async function getVerificationEventsByUserId(
  userId: string,
  limit: number = 50
) {
  const LOGS_TABLE = process.env.DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS || 
                     'jvtutorcorner-email-verification-logs';

  try {
    const { Items } = await ddbDocClient.send(new ScanCommand({
      TableName: LOGS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: limit
    }));

    return Items as EmailVerificationLog[];
  } catch (error) {
    console.error('[EmailVerificationLog] Failed to query events:', error);
    return [];
  }
}

/**
 * 查詢特定郵件地址的驗證事件
 */
export async function getVerificationEventsByEmail(
  email: string,
  limit: number = 50
) {
  const LOGS_TABLE = process.env.DYNAMODB_TABLE_EMAIL_VERIFICATION_LOGS || 
                     'jvtutorcorner-email-verification-logs';

  try {
    const { Items } = await ddbDocClient.send(new ScanCommand({
      TableName: LOGS_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      },
      Limit: limit
    }));

    return Items as EmailVerificationLog[];
  } catch (error) {
    console.error('[EmailVerificationLog] Failed to query events by email:', error);
    return [];
  }
}

/**
 * 獲取驗證統計信息
 */
export async function getVerificationStats(userId: string) {
  const events = await getVerificationEventsByUserId(userId);
  
  if (!events.length) {
    return {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      lastAttempt: null,
      lastSuccess: null,
      eventTypes: {}
    };
  }

  const eventTypes: Record<EmailVerificationEventType, number> = {
    SENT: 0,
    CLICKED: 0,
    VERIFIED: 0,
    FAILED: 0,
    RESENT: 0,
    EXPIRED: 0,
    THROTTLED: 0
  };

  let lastAttempt: EmailVerificationLog | null = null;
  let lastSuccess: EmailVerificationLog | null = null;
  let successCount = 0;
  let failureCount = 0;

  // 按時間排序（最新優先）
  const sortedEvents = events.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  for (const event of sortedEvents) {
    eventTypes[event.eventType]++;
    
    if (!lastAttempt) {
      lastAttempt = event;
    }

    if (event.status === 'success' && !lastSuccess) {
      lastSuccess = event;
      successCount++;
    } else if (event.status === 'failure') {
      failureCount++;
    }
  }

  return {
    totalAttempts: events.length,
    successCount,
    failureCount,
    lastAttempt: lastAttempt?.timestamp || null,
    lastSuccess: lastSuccess?.timestamp || null,
    eventTypes
  };
}
