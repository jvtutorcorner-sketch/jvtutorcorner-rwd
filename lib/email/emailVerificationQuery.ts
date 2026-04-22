import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getVerificationEventsByUserId, getVerificationStats } from './emailVerificationLog';

/**
 * Email Verification Query Service
 * 
 * 提供統一的查詢介面，整合 profiles 表的基礎信息和日誌表的詳細事件
 */

export interface VerificationStatusView {
  // 基礎信息（來自 profiles 表）
  userId: string;
  email: string;
  verified: boolean;
  status: 'verified' | 'pending' | 'failed' | 'resend_requested';
  
  // 驗證時間線
  createdAt: string;
  firstAttemptAt?: string;
  lastAttemptAt?: string;
  successAt?: string;
  
  // 統計數據
  totalAttempts: number;
  resendCount: number;
  
  // 詳細日誌（來自日誌表）
  recentEvents: Array<{
    timestamp: string;
    eventType: string;
    status: 'success' | 'failure';
    errorCode?: string;
  }>;
}

/**
 * 獲取用戶的完整驗證狀態（混合視圖）
 */
export async function getEmailVerificationStatus(
  userId: string
): Promise<VerificationStatusView | null> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

  try {
    // 1. 獲取基礎信息
    const { Item: profile } = await ddbDocClient.send(new GetCommand({
      TableName: PROFILES_TABLE,
      Key: { id: userId }
    }));

    if (!profile) {
      return null;
    }

    // 2. 獲取詳細統計和事件
    const stats = await getVerificationStats(userId);
    const events = await getVerificationEventsByUserId(userId, 10);

    // 3. 組合視圖
    return {
      userId: profile.id,
      email: profile.email,
      verified: profile.emailVerified || false,
      status: profile.emailVerificationStatus || (profile.emailVerified ? 'verified' : 'pending'),
      createdAt: profile.createdAt,
      firstAttemptAt: profile.emailVerificationLastAttempt ? 
        new Date(new Date(profile.emailVerificationLastAttempt).getTime() - (stats.totalAttempts * 1000)).toISOString() 
        : undefined,
      lastAttemptAt: profile.emailVerificationLastAttempt,
      successAt: profile.emailVerificationSuccessAt,
      totalAttempts: stats.totalAttempts,
      resendCount: profile.emailVerificationResendCount || 0,
      recentEvents: events.map(e => ({
        timestamp: e.timestamp,
        eventType: e.eventType,
        status: e.status,
        errorCode: e.errorCode
      }))
    };
  } catch (error) {
    console.error('[VerificationQuery] Failed to get status:', error);
    return null;
  }
}

/**
 * 查詢尚未驗證的帳號（用於提醒或統計）
 */
export async function getPendingVerifications(limit: number = 100) {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

  try {
    const { Items } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'emailVerified = :false AND attribute_exists(verificationExpires)',
      ExpressionAttributeValues: {
        ':false': false
      },
      Limit: limit
    }));

    return Items || [];
  } catch (error) {
    console.error('[VerificationQuery] Failed to get pending verifications:', error);
    return [];
  }
}

/**
 * 查詢已過期的驗證 token
 */
export async function getExpiredVerificationTokens(limit: number = 100) {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
  const now = new Date().toISOString();

  try {
    const { Items } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'emailVerified = :false AND verificationExpires < :now AND attribute_exists(verificationExpires)',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': now
      },
      Limit: limit
    }));

    return Items || [];
  } catch (error) {
    console.error('[VerificationQuery] Failed to get expired tokens:', error);
    return [];
  }
}

/**
 * 獲取驗證統計摘要
 */
export async function getVerificationSummary() {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

  try {
    // 查詢已驗證的用戶
    const { Items: verifiedUsers } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'emailVerified = :true',
      ExpressionAttributeValues: { ':true': true },
      Select: 'COUNT'
    }));

    // 查詢待驗證的用戶
    const { Items: pendingUsers } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'emailVerified = :false AND attribute_exists(verificationToken)',
      ExpressionAttributeValues: { ':false': false },
      Select: 'COUNT'
    }));

    // 查詢失敗的用戶
    const { Items: failedUsers } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'emailVerificationStatus = :failed',
      ExpressionAttributeValues: { ':failed': 'failed' },
      Select: 'COUNT'
    }));

    return {
      verified: verifiedUsers?.length || 0,
      pending: pendingUsers?.length || 0,
      failed: failedUsers?.length || 0,
      total: (verifiedUsers?.length || 0) + (pendingUsers?.length || 0) + (failedUsers?.length || 0)
    };
  } catch (error) {
    console.error('[VerificationQuery] Failed to get summary:', error);
    return {
      verified: 0,
      pending: 0,
      failed: 0,
      total: 0
    };
  }
}
