// lib/pointsStorage.ts
// Shared points storage module used by both /api/points and /api/orders.
// Provides a consistent backend (DynamoDB in production, in-memory in dev)
// so all routes always read/write from the same storage layer.
//
// Every balance mutation goes through applyPointsDelta(), which updates the
// balance and appends a point-transactions ledger row in ONE DynamoDB
// transaction (with an idempotency marker). addUserPoints/deductUserPoints are
// thin wrappers over it, so a balance can always be reconciled against the
// ledger and no concurrent pair of writes can double-spend.

import { GetCommand, PutCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import {
  POINT_TX_TABLE,
  buildLedgerItem,
  idempotencyMarkerSk,
  type LedgerEntryInput,
  type LedgerItem,
} from '@/lib/pointsLedger';

export const POINTS_TABLE =
  process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

export const useDynamoForPoints =
  typeof POINTS_TABLE === 'string' &&
  POINTS_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// In-memory fallback for development (shared singleton across all imports in the same process)
export const LOCAL_POINTS: Record<string, number> = {};
export const LOCAL_LEDGER: LedgerItem[] = [];
const LOCAL_IDEMP = new Set<string>();

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

/** Overwrite the balance for a user. Initialisation / admin use only — prefer applyPointsDelta. */
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

export type ApplyPointsResult =
  | { ok: true; newBalance: number; txId: string; duplicate: boolean }
  | { ok: false; error: string; currentBalance: number };

/**
 * The single atomic point mutation. Adds `delta` (may be negative) to the
 * balance AND appends a ledger row in one transaction, guarded by an
 * idempotency marker so a retried logical operation applies at most once.
 *
 * - A negative delta is rejected (never applied) when it would overdraw the
 *   balance — the double-spend fix.
 * - A replay with the same idempotencyKey is a no-op that reports ok:true,
 *   duplicate:true (never a second debit/credit).
 */
export async function applyPointsDelta(
  input: Omit<LedgerEntryInput, 'balanceAfter'>
): Promise<ApplyPointsResult> {
  const { userId, amount: delta, idempotencyKey } = input;
  const createdAt = new Date().toISOString();
  const txId = randomUUID();
  const ledgerItem = buildLedgerItem(input, txId, createdAt);

  if (useDynamoForPoints) {
    const balanceUpdate =
      delta < 0
        ? {
            Update: {
              TableName: POINTS_TABLE,
              Key: { userId },
              UpdateExpression: 'ADD #bal :d SET updatedAt = :u',
              ConditionExpression: 'attribute_exists(#bal) AND #bal >= :abs',
              ExpressionAttributeNames: { '#bal': 'balance' },
              ExpressionAttributeValues: { ':d': delta, ':abs': -delta, ':u': createdAt },
            },
          }
        : {
            Update: {
              TableName: POINTS_TABLE,
              Key: { userId },
              UpdateExpression: 'ADD #bal :d SET updatedAt = :u',
              ExpressionAttributeNames: { '#bal': 'balance' },
              ExpressionAttributeValues: { ':d': delta, ':u': createdAt },
            },
          };
    try {
      await ddbDocClient.send(
        new TransactWriteCommand({
          TransactItems: [
            balanceUpdate,
            { Put: { TableName: POINT_TX_TABLE, Item: ledgerItem } },
            {
              Put: {
                TableName: POINT_TX_TABLE,
                Item: { userId, sk: idempotencyMarkerSk(idempotencyKey), createdAt, txId },
                ConditionExpression: 'attribute_not_exists(userId)',
              },
            },
          ],
        })
      );
    } catch (err) {
      const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> })?.CancellationReasons;
      const name = (err as { name?: string })?.name;
      if (name === 'TransactionCanceledException' && reasons) {
        // reasons[0] = balance, reasons[2] = idempotency marker
        if (reasons[2]?.Code === 'ConditionalCheckFailed') {
          const current = await getUserPoints(userId);
          return { ok: true, newBalance: current, txId, duplicate: true };
        }
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          const current = await getUserPoints(userId);
          return {
            ok: false,
            error: `點數不足，目前餘額 ${current} 點，需要 ${-delta} 點`,
            currentBalance: current,
          };
        }
      }
      throw err;
    }
    const newBalance = await getUserPoints(userId);
    return { ok: true, newBalance, txId, duplicate: false };
  }

  // In-memory (dev)
  if (LOCAL_IDEMP.has(idempotencyKey)) {
    return { ok: true, newBalance: LOCAL_POINTS[userId] ?? 0, txId, duplicate: true };
  }
  const current = LOCAL_POINTS[userId] ?? 0;
  if (delta < 0 && current < -delta) {
    return {
      ok: false,
      error: `點數不足，目前餘額 ${current} 點，需要 ${-delta} 點`,
      currentBalance: current,
    };
  }
  const newBalance = current + delta;
  LOCAL_POINTS[userId] = newBalance;
  LOCAL_IDEMP.add(idempotencyKey);
  LOCAL_LEDGER.push({ ...ledgerItem, balanceAfter: newBalance });
  return { ok: true, newBalance, txId, duplicate: false };
}

/**
 * Atomically add `delta` points to a user's balance (creates the row if missing)
 * and record a ledger row. Returns the new balance. Throws on storage failure.
 *
 * Prefer applyPointsDelta with a real type/refId/idempotencyKey for semantic
 * flows (purchase/escrow/refund/AI). This wrapper is for ad-hoc credits.
 */
export async function addUserPoints(userId: string, delta: number): Promise<number> {
  const res = await applyPointsDelta({
    userId,
    amount: delta,
    type: 'adjustment',
    refType: 'direct',
    idempotencyKey: randomUUID(),
  });
  if (!res.ok) throw new Error(res.error);
  return res.newBalance;
}

/**
 * Deduct `amount` points from a user (atomic; rejects overdraft) and record a
 * ledger row.
 * Returns { ok: true, newBalance } on success.
 * Returns { ok: false, error, currentBalance } on insufficient funds.
 */
export async function deductUserPoints(
  userId: string,
  amount: number
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; currentBalance: number }> {
  const res = await applyPointsDelta({
    userId,
    amount: -Math.abs(amount),
    type: 'adjustment',
    refType: 'direct',
    idempotencyKey: randomUUID(),
  });
  if (!res.ok) return res;
  return { ok: true, newBalance: res.newBalance };
}
