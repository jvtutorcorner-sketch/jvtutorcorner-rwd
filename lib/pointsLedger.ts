// lib/pointsLedger.ts
//
// Append-only point ledger. Every balance mutation writes one row here in the
// SAME DynamoDB transaction as the user-points update (see applyPointsDelta in
// lib/pointsStorage.ts), so a balance is always reconstructable and every
// change is attributable to an order / escrow / reservation / AI request.
//
// This module holds only pure helpers, the table name, and read/reconstruct
// utilities — it deliberately does NOT import lib/pointsStorage, so pointsStorage
// can depend on it without a cycle.

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const POINT_TX_TABLE =
  process.env.DYNAMODB_TABLE_POINT_TRANSACTIONS || 'jvtutorcorner-point-transactions';

export type LedgerEntryType =
  | 'purchase' // bought points with real money
  | 'enroll_hold' // points moved into escrow at enrollment (student −)
  | 'escrow_release' // escrow released to teacher (teacher +)
  | 'platform_fee' // platform commission leg of a release (platform +)
  | 'refund' // escrow refunded to student (student +)
  | 'ai_reserve' // points reserved for an async AI/GPU job (−)
  | 'ai_charge' // reserved points settled as a charge
  | 'ai_refund' // reserved points returned on failure (+)
  | 'reserve_expired' // reservation swept back to the user (+)
  | 'adjustment'; // manual admin correction

export type PointBucket = 'general' | 'media_grant';

export interface LedgerEntryInput {
  userId: string;
  amount: number; // signed delta in credits (+credit / −debit)
  type: LedgerEntryType;
  bucket?: PointBucket;
  refType?: string; // 'order' | 'escrow' | 'reservation' | 'ai_request' | …
  refId?: string;
  idempotencyKey: string;
  balanceAfter?: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface LedgerItem extends LedgerEntryInput {
  sk: string; // `${createdAt}#${txId}`
  txId: string;
  bucket: PointBucket;
  createdAt: string;
}

/** SK for the idempotency marker that dedupes a logical operation. */
export function idempotencyMarkerSk(idempotencyKey: string): string {
  return `IDEMP#${idempotencyKey}`;
}

/** True for real ledger rows (excludes idempotency markers). */
export function isLedgerRow(item: { sk?: string }): boolean {
  return typeof item?.sk === 'string' && !item.sk.startsWith('IDEMP#');
}

/**
 * Build the concrete ledger row item written inside the balance transaction.
 * Pure — no I/O. `txId`/`createdAt` are injected so callers/tests are deterministic.
 */
export function buildLedgerItem(
  input: LedgerEntryInput,
  txId: string,
  createdAt: string
): LedgerItem {
  const item: LedgerItem = {
    userId: input.userId,
    sk: `${createdAt}#${txId}`,
    txId,
    type: input.type,
    amount: input.amount,
    bucket: input.bucket ?? 'general',
    idempotencyKey: input.idempotencyKey,
    createdAt,
  };
  if (input.refType) item.refType = input.refType;
  if (input.refId) item.refId = input.refId;
  if (typeof input.balanceAfter === 'number') item.balanceAfter = input.balanceAfter;
  if (input.meta) item.meta = input.meta;
  return item;
}

/** All ledger rows for a user, oldest first. Excludes idempotency markers. */
export async function queryUserLedger(userId: string): Promise<LedgerItem[]> {
  const out: LedgerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: POINT_TX_TABLE,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ExclusiveStartKey,
      })
    );
    for (const it of res.Items ?? []) {
      if (isLedgerRow(it as { sk?: string })) out.push(it as LedgerItem);
    }
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/** Reconstruct a balance purely from the ledger — the reconciliation check. */
export async function reconstructBalance(userId: string): Promise<number> {
  const rows = await queryUserLedger(userId);
  return rows.reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0);
}
