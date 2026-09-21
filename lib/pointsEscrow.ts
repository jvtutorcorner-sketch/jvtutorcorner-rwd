// lib/pointsEscrow.ts
// Points Escrow module: holds deducted student points until course completion.
//
// Flow:
//   1. Student enrolls  → deductUserPoints() + createEscrow()
//   2. Course completes → releaseEscrow()  → points added to teacher
//   3. Course cancelled → refundEscrow()   → points returned to student

import { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddbDocClient } from '@/lib/dynamo';
import { getUserPoints, addUserPoints, POINTS_TABLE, useDynamoForPoints } from '@/lib/pointsStorage';
import { resolveCanonicalTeacherId } from '@/lib/teacherIdentity';

export const ESCROW_TABLE =
  process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

export const useDynamoForEscrow =
  typeof ESCROW_TABLE === 'string' &&
  ESCROW_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

export type EscrowStatus = 'HOLDING' | 'RELEASED' | 'REFUNDED';

export type EscrowRecord = {
  escrowId: string;
  orderId: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  courseTitle: string;
  points: number;
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
  releasedAt?: string;
  refundedAt?: string;
  /** Unique id of the call that settled this escrow (release/refund idempotency). */
  settlementToken?: string;
  // Optional display fields stored at creation time (for display when course is deleted)
  teacherName?: string;
  durationMinutes?: number;
  totalSessions?: number;
  courseStartDate?: string;
  courseStartTime?: string;
  courseEndTime?: string;
};

// In-memory fallback for development
const LOCAL_ESCROW: Record<string, EscrowRecord> = {};

// ──────────────────────────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────────────────────────

export async function getEscrow(escrowId: string): Promise<EscrowRecord | null> {
  if (useDynamoForEscrow) {
    try {
      const res = await ddbDocClient.send(
        new GetCommand({ TableName: ESCROW_TABLE, Key: { escrowId } })
      );
      return (res.Item as EscrowRecord) || null;
    } catch (e) {
      console.error('[pointsEscrow] DynamoDB get error:', e);
      return null;
    }
  }
  return LOCAL_ESCROW[escrowId] || null;
}

export async function getEscrowByOrder(orderId: string): Promise<EscrowRecord | null> {
  if (useDynamoForEscrow) {
    try {
      const res = await ddbDocClient.send(
        new QueryCommand({
          TableName: ESCROW_TABLE,
          IndexName: 'byOrderId',
          KeyConditionExpression: 'orderId = :oid',
          ExpressionAttributeValues: { ':oid': orderId },
          Limit: 1,
        })
      );
      return ((res.Items?.[0]) as EscrowRecord) || null;
    } catch (e) {
      console.error('[pointsEscrow] DynamoDB query byOrderId error:', e);
      return null;
    }
  }
  const found = Object.values(LOCAL_ESCROW).find((r) => r.orderId === orderId);
  return found || null;
}

export async function listEscrows(opts?: {
  status?: EscrowStatus;
  studentId?: string;
  teacherId?: string;
  limit?: number;
}): Promise<EscrowRecord[]> {
  if (useDynamoForEscrow) {
    try {
      const limit = opts?.limit ?? 100;

      // Per-party listing goes through the byStudentId / byTeacherId GSIs that
      // scripts/setup-db.mjs provisions. This used to be a full-table Scan with a
      // FilterExpression, which is not merely slow: DynamoDB applies Limit to items
      // SCANNED, not items matched, so "list my escrows" silently returned an
      // arbitrary subset once the table outgrew the first page. A Query on the
      // index partition key returns every row belonging to that party.
      const partyIndex = opts?.studentId
        ? { indexName: 'byStudentId', keyName: 'studentId', value: opts.studentId }
        : opts?.teacherId
          ? { indexName: 'byTeacherId', keyName: 'teacherId', value: opts.teacherId }
          : null;

      if (partyIndex) {
        const queryParams: any = {
          TableName: ESCROW_TABLE,
          IndexName: partyIndex.indexName,
          KeyConditionExpression: partyIndex.keyName + ' = :party',
          ExpressionAttributeValues: { ':party': partyIndex.value },
          Limit: limit,
        };
        if (opts?.status) {
          queryParams.FilterExpression = '#status = :status';
          queryParams.ExpressionAttributeNames = { '#status': 'status' };
          queryParams.ExpressionAttributeValues[':status'] = opts.status;
        }
        const queryRes = await ddbDocClient.send(new QueryCommand(queryParams));
        return (queryRes.Items || []) as EscrowRecord[];
      }

      // No party filter (admin-wide listing). Scan is the only option here, since
      // status on its own has no index.
      const params: any = { TableName: ESCROW_TABLE, Limit: limit };
      if (opts?.status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { ':status': opts.status };
      }

      const res = await ddbDocClient.send(new ScanCommand(params));
      return (res.Items || []) as EscrowRecord[];
    } catch (e) {
      console.error('[pointsEscrow] DynamoDB list error:', e);
      return [];
    }
  }

  let records = Object.values(LOCAL_ESCROW);
  if (opts?.status) records = records.filter((r) => r.status === opts.status);
  if (opts?.studentId) records = records.filter((r) => r.studentId === opts.studentId);
  if (opts?.teacherId) records = records.filter((r) => r.teacherId === opts.teacherId);
  return records.slice(0, opts?.limit ?? 100);
}

// ──────────────────────────────────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create a new HOLDING escrow record.
 * Call this AFTER successfully deducting points from the student.
 */
export async function createEscrow(params: {
  escrowId: string;
  orderId: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  courseTitle: string;
  points: number;
  teacherName?: string;
  durationMinutes?: number;
  totalSessions?: number;
  courseStartDate?: string;
  courseStartTime?: string;
  courseEndTime?: string;
}): Promise<EscrowRecord> {
  const now = new Date().toISOString();

  // The teacher key MUST be the canonical profile id. releaseEscrow() credits the
  // teacher with setUserPoints(record.teacherId). If an email string lands here
  // instead (app/api/orders/route.ts resolved the course teacher as
  // `teacherId || teacherEmail`) the points are written to a balance keyed by that
  // email, which no teacher-facing read ever looks at. The escrow then reads as
  // RELEASED while the teacher's actual balance never moves.
  const canonicalTeacherId = await resolveCanonicalTeacherId(params.teacherId);
  if (!canonicalTeacherId) {
    throw new Error(
      '[pointsEscrow] refusing to create escrow ' + params.escrowId +
        ': teacherId "' + params.teacherId + '" does not resolve to a teacher profile'
    );
  }
  if (canonicalTeacherId !== params.teacherId) {
    console.log(
      '[pointsEscrow] normalised teacherId ' + params.teacherId + ' -> ' + canonicalTeacherId
    );
  }

  const record: EscrowRecord = {
    ...params,
    teacherId: canonicalTeacherId,
    status: 'HOLDING',
    createdAt: now,
    updatedAt: now,
  };

  if (useDynamoForEscrow) {
    await ddbDocClient.send(new PutCommand({ TableName: ESCROW_TABLE, Item: record }));
  } else {
    LOCAL_ESCROW[params.escrowId] = record;
  }

  console.log(
    `[pointsEscrow] Created escrow ${params.escrowId}: ${params.points} pts held for course "${params.courseTitle}" (student=${params.studentId}, teacher=${params.teacherId})`
  );

  return record;
}

// ──────────────────────────────────────────────────────────────────────────────
// Settle (release / refund)
//
// Previously both functions did: read escrow → read balance → Put new balance →
// conditional status update. Two concurrent callers (admin POST, agora/session
// PATCH, LiveKit webhook, a settlement cron) both passed the status read, both
// credited the payee, and the loser's conditional update then threw. Separately,
// the blind Put meant two credits to the SAME payee for different escrows could
// overwrite each other.
//
// Now the status flip and the balance ADD commit in ONE DynamoDB transaction,
// conditioned on status = HOLDING. The transition HOLDING → RELEASED|REFUNDED is
// the idempotency key: exactly one caller wins, everyone else gets
// { ok:false, error:'already …' } and nobody is credited twice.
// ──────────────────────────────────────────────────────────────────────────────

type SettleTarget = 'RELEASED' | 'REFUNDED';

type SettleResult =
  | { ok: true; payeeId: string; points: number; payeeNewBalance: number }
  | { ok: false; error: string };

function isConditionalCancel(err: unknown): boolean {
  const e = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  if (e?.name !== 'TransactionCanceledException') return false;
  const reasons = e.CancellationReasons ?? [];
  // A missing reasons array is still treated as a lost race; the follow-up
  // re-read decides what to report.
  return reasons.length === 0 || reasons.some((r) => r?.Code === 'ConditionalCheckFailed');
}

async function settleEscrow(escrowId: string, target: SettleTarget): Promise<SettleResult> {
  const record = await getEscrow(escrowId);
  if (!record) return { ok: false, error: `Escrow ${escrowId} not found` };
  if (record.status !== 'HOLDING') {
    return { ok: false, error: `Escrow ${escrowId} is already ${record.status}` };
  }

  const payeeId = target === 'RELEASED' ? record.teacherId : record.studentId;
  const stampField = target === 'RELEASED' ? 'releasedAt' : 'refundedAt';
  const now = new Date().toISOString();
  // Unique per call. Timestamps are NOT unique: concurrent callers routinely get
  // the same millisecond, so they cannot tell "my commit" from "a rival's commit".
  const settlementToken = randomUUID();

  if (!payeeId) {
    return { ok: false, error: `Escrow ${escrowId} has no ${target === 'RELEASED' ? 'teacherId' : 'studentId'}` };
  }
  if (typeof record.points !== 'number' || !Number.isFinite(record.points) || record.points < 0) {
    return { ok: false, error: `Escrow ${escrowId} has invalid points: ${String(record.points)}` };
  }

  if (useDynamoForEscrow && useDynamoForPoints) {
    try {
      await ddbDocClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: ESCROW_TABLE,
                Key: { escrowId },
                UpdateExpression: `SET #status = :s, ${stampField} = :at, updatedAt = :at, settlementToken = :tok`,
                ConditionExpression: '#status = :holding',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':s': target, ':at': now, ':holding': 'HOLDING', ':tok': settlementToken },
              },
            },
            {
              Update: {
                TableName: POINTS_TABLE,
                Key: { userId: payeeId },
                UpdateExpression: 'ADD #bal :pts SET updatedAt = :at',
                ExpressionAttributeNames: { '#bal': 'balance' },
                ExpressionAttributeValues: { ':pts': record.points, ':at': now },
              },
            },
          ],
        })
      );
    } catch (err) {
      if (!isConditionalCancel(err)) throw err;
      const latest = await getEscrow(escrowId);
      // An SDK-level retry of a transaction that actually committed comes back
      // as a condition failure; our own unique token on the row proves it was us.
      if (latest?.status === target && latest.settlementToken === settlementToken) {
        const payeeNewBalance = await getUserPoints(payeeId);
        return { ok: true, payeeId, points: record.points, payeeNewBalance };
      }
      return { ok: false, error: `Escrow ${escrowId} is already ${latest?.status ?? 'settled'}` };
    }

    const payeeNewBalance = await getUserPoints(payeeId);
    return { ok: true, payeeId, points: record.points, payeeNewBalance };
  }

  if (!useDynamoForEscrow) {
    // In-memory dev path. Claim synchronously (no await between the check and
    // the write) so concurrent calls in one process cannot both pass.
    const current = LOCAL_ESCROW[escrowId];
    if (!current || current.status !== 'HOLDING') {
      return { ok: false, error: `Escrow ${escrowId} is already ${current?.status ?? 'settled'}` };
    }
    LOCAL_ESCROW[escrowId] = { ...current, status: target, [stampField]: now, updatedAt: now };
    const payeeNewBalance = await addUserPoints(payeeId, record.points);
    return { ok: true, payeeId, points: record.points, payeeNewBalance };
  }

  // Mixed storage (escrow in DynamoDB, points in memory) is not a real deployment
  // shape, but keep it safe: claim atomically first, then credit.
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ESCROW_TABLE,
        Key: { escrowId },
        UpdateExpression: `SET #status = :s, ${stampField} = :at, updatedAt = :at`,
        ConditionExpression: '#status = :holding',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':s': target, ':at': now, ':holding': 'HOLDING' },
      })
    );
  } catch (err) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      const latest = await getEscrow(escrowId);
      return { ok: false, error: `Escrow ${escrowId} is already ${latest?.status ?? 'settled'}` };
    }
    throw err;
  }
  const payeeNewBalance = await addUserPoints(payeeId, record.points);
  return { ok: true, payeeId, points: record.points, payeeNewBalance };
}

/**
 * Release escrow: transfer held points to the teacher.
 * Call this when the course session is fully completed.
 * Safe to call concurrently: exactly one caller releases and credits the teacher.
 */
export async function releaseEscrow(
  escrowId: string
): Promise<{ ok: true; teacherNewBalance: number } | { ok: false; error: string }> {
  const result = await settleEscrow(escrowId, 'RELEASED');
  if (!result.ok) return result;
  console.log(
    `[pointsEscrow] Released escrow ${escrowId}: ${result.points} pts → teacher ${result.payeeId} (new balance: ${result.payeeNewBalance})`
  );
  return { ok: true, teacherNewBalance: result.payeeNewBalance };
}

/**
 * Refund escrow: return held points back to the student.
 * Call this when the course is cancelled before completion.
 * Safe to call concurrently, and safe to race against releaseEscrow: exactly one wins.
 */
export async function refundEscrow(
  escrowId: string
): Promise<{ ok: true; studentNewBalance: number } | { ok: false; error: string }> {
  const result = await settleEscrow(escrowId, 'REFUNDED');
  if (!result.ok) return result;
  console.log(
    `[pointsEscrow] Refunded escrow ${escrowId}: ${result.points} pts → student ${result.payeeId} (new balance: ${result.payeeNewBalance})`
  );
  return { ok: true, studentNewBalance: result.payeeNewBalance };
}
