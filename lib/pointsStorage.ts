// lib/pointsStorage.ts
// Shared points storage module used by both /api/points and /api/orders.
// Provides a consistent backend (DynamoDB in production, in-memory in dev)
// so all routes always read/write from the same storage layer.

import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const POINTS_TABLE =
  process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

export const useDynamoForPoints =
  typeof POINTS_TABLE === 'string' &&
  POINTS_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// In-memory fallback for development (shared singleton across all imports in the same process)
export const LOCAL_POINTS: Record<string, number> = {};

/** Read balance for a user. Returns 0 if not found. */
export async function getUserPoints(userId: string): Promise<number> {
  if (useDynamoForPoints) {
    try {
      const res = await ddbDocClient.send(
        new GetCommand({ TableName: POINTS_TABLE, Key: { userId } })
      );
      return typeof res.Item?.balance === 'number' ? res.Item.balance : 0;
    } catch (e) {
      console.error('[pointsStorage] DynamoDB get error:', e);
      return 0;
    }
  }
  return LOCAL_POINTS[userId] ?? 0;
}

/** Overwrite the balance for a user. */
export async function setUserPoints(userId: string, balance: number): Promise<void> {
  if (useDynamoForPoints) {
    try {
      await ddbDocClient.send(
        new PutCommand({
          TableName: POINTS_TABLE,
          Item: { userId, balance, updatedAt: new Date().toISOString() },
        })
      );
    } catch (e) {
      console.error('[pointsStorage] DynamoDB put error:', e);
    }
    return;
  }
  LOCAL_POINTS[userId] = balance;
}

/**
 * Atomically add `delta` points to a user's balance (creates the row if missing).
 *
 * Unlike getUserPoints + setUserPoints, this is a single DynamoDB `ADD`, so two
 * concurrent credits to the same user can never overwrite each other.
 * Returns the new balance.
 */
export async function addUserPoints(userId: string, delta: number): Promise<number> {
  if (useDynamoForPoints) {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: POINTS_TABLE,
        Key: { userId },
        UpdateExpression: 'ADD #bal :d SET updatedAt = :u',
        ExpressionAttributeNames: { '#bal': 'balance' },
        ExpressionAttributeValues: { ':d': delta, ':u': new Date().toISOString() },
        ReturnValues: 'UPDATED_NEW',
      })
    );
    return typeof res.Attributes?.balance === 'number' ? res.Attributes.balance : delta;
  }
  LOCAL_POINTS[userId] = (LOCAL_POINTS[userId] ?? 0) + delta;
  return LOCAL_POINTS[userId];
}

/**
 * Deduct `amount` points from a user.
 * Returns { ok: true, newBalance } on success.
 * Returns { ok: false, error, currentBalance } on insufficient funds.
 * Throws on storage errors.
 */
export async function deductUserPoints(
  userId: string,
  amount: number
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; currentBalance: number }> {
  const current = await getUserPoints(userId);
  if (current < amount) {
    return {
      ok: false,
      error: `點數不足，目前餘額 ${current} 點，需要 ${amount} 點`,
      currentBalance: current,
    };
  }
  const newBalance = current - amount;
  await setUserPoints(userId, newBalance);
  return { ok: true, newBalance };
}
