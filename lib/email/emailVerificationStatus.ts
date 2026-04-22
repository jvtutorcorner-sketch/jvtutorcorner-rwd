import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { logEmailVerificationEvent, EmailVerificationEventType } from './emailVerificationLog';

/**
 * Email Verification Status Update Service
 * 
 * 負責在 profiles 表中記錄基礎驗證狀態，同時在日誌表中記錄詳細事件
 */

export type EmailVerificationStatus = 'verified' | 'pending' | 'failed' | 'resend_requested';

export interface EmailVerificationStatusUpdate {
  emailVerified?: boolean;
  emailVerificationStatus?: EmailVerificationStatus;
  emailVerificationAttempts?: number;
  emailVerificationLastAttempt?: string;
  emailVerificationSuccessAt?: string;
  emailVerificationResendCount?: number;
  emailVerificationLastResendAt?: string;
}

/**
 * 更新用戶的郵件驗證狀態
 * 同時更新 profiles 表和日誌表
 */
export async function updateEmailVerificationStatus(
  userId: string,
  email: string,
  eventType: EmailVerificationEventType,
  updates: EmailVerificationStatusUpdate,
  context?: {
    token?: string;
    tokenExpiresAt?: string;
    ipAddress?: string;
    userAgent?: string;
    errorCode?: string;
    errorMessage?: string;
    duration?: number;
  }
): Promise<void> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
  const now = new Date().toISOString();

  try {
    // 1. 更新 profiles 表
    const updateFields: Record<string, string> = {};
    const expressionValues: Record<string, any> = { ':now': now };
    let updateExpression = 'SET updatedAtUtc = :now';

    if (updates.emailVerified !== undefined) {
      updateFields['#ev'] = 'emailVerified';
      expressionValues[':ev'] = updates.emailVerified;
      updateExpression += ', #ev = :ev';
    }

    if (updates.emailVerificationStatus) {
      updateFields['#evs'] = 'emailVerificationStatus';
      expressionValues[':evs'] = updates.emailVerificationStatus;
      updateExpression += ', #evs = :evs';
    }

    if (updates.emailVerificationAttempts !== undefined) {
      updateFields['#eva'] = 'emailVerificationAttempts';
      expressionValues[':eva'] = updates.emailVerificationAttempts;
      updateExpression += ', #eva = :eva';
    }

    if (updates.emailVerificationLastAttempt) {
      updateFields['#evla'] = 'emailVerificationLastAttempt';
      expressionValues[':evla'] = updates.emailVerificationLastAttempt;
      updateExpression += ', #evla = :evla';
    }

    if (updates.emailVerificationSuccessAt) {
      updateFields['#evsa'] = 'emailVerificationSuccessAt';
      expressionValues[':evsa'] = updates.emailVerificationSuccessAt;
      updateExpression += ', #evsa = :evsa';
    }

    if (updates.emailVerificationResendCount !== undefined) {
      updateFields['#evrc'] = 'emailVerificationResendCount';
      expressionValues[':evrc'] = updates.emailVerificationResendCount;
      updateExpression += ', #evrc = :evrc';
    }

    if (updates.emailVerificationLastResendAt) {
      updateFields['#evlra'] = 'emailVerificationLastResendAt';
      expressionValues[':evlra'] = updates.emailVerificationLastResendAt;
      updateExpression += ', #evlra = :evlra';
    }

    await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: userId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: updateFields,
      ExpressionAttributeValues: expressionValues
    }));

    console.log(`[VerificationStatusUpdate] ✅ Updated profile for ${email}`);

    // 2. 記錄事件到日誌表
    const status = updates.emailVerified ? 'success' : 'failure';
    
    await logEmailVerificationEvent(
      userId,
      email,
      eventType,
      {
        token: context?.token,
        tokenExpiresAt: context?.tokenExpiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        status: status as 'success' | 'failure',
        errorCode: context?.errorCode as any,
        errorMessage: context?.errorMessage,
        duration: context?.duration,
        attempt: updates.emailVerificationAttempts
      }
    );

  } catch (error) {
    console.error('[VerificationStatusUpdate] ❌ Failed to update verification status:', error);
    throw error;
  }
}

/**
 * 清理驗證 token（驗證成功後）
 */
export async function clearVerificationToken(
  userId: string
): Promise<void> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET verificationToken = :null, verificationExpires = :null, updatedAtUtc = :now',
      ExpressionAttributeValues: {
        ':null': null,
        ':now': new Date().toISOString()
      }
    }));

    console.log(`[VerificationStatusUpdate] ✅ Cleared verification token for user ${userId}`);
  } catch (error) {
    console.error('[VerificationStatusUpdate] ❌ Failed to clear token:', error);
    throw error;
  }
}

/**
 * 初始化驗證狀態（註冊時調用）
 */
export async function initializeVerificationStatus(
  userId: string,
  email: string,
  token: string,
  tokenExpires: string
): Promise<void> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
  const now = new Date().toISOString();

  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: PROFILES_TABLE,
      Key: { id: userId },
      UpdateExpression: `SET 
        emailVerified = :false,
        emailVerificationStatus = :pending,
        emailVerificationAttempts = :zero,
        emailVerificationLastAttempt = :now,
        verificationToken = :token,
        verificationExpires = :tokenExpires,
        updatedAtUtc = :now`,
      ExpressionAttributeValues: {
        ':false': false,
        ':pending': 'pending',
        ':zero': 1,
        ':now': now,
        ':token': token,
        ':tokenExpires': tokenExpires
      }
    }));

    // 記錄初始化事件
    await logEmailVerificationEvent(
      userId,
      email,
      'SENT',
      {
        token,
        tokenExpiresAt: tokenExpires,
        status: 'success'
      }
    );

    console.log(`[VerificationStatusUpdate] ✅ Initialized verification status for ${email}`);
  } catch (error) {
    console.error('[VerificationStatusUpdate] ❌ Failed to initialize verification status:', error);
    throw error;
  }
}
