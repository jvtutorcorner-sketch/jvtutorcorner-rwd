// lib/pointsEscrow.ts
// Points Escrow module: holds deducted student points until course completion.
//
// Flow:
//   1. Student enrolls  → deductUserPoints() + createEscrow()
//   2. Course completes → releaseEscrow()  → points added to teacher
//   3. Course cancelled → refundEscrow()   → points returned to student

import { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';

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
      const filters: string[] = [];
      const ExpressionAttributeValues: Record<string, any> = {};
      const ExpressionAttributeNames: Record<string, string> = {};

      if (opts?.status) {
        filters.push('#status = :status');
        ExpressionAttributeNames['#status'] = 'status';
        ExpressionAttributeValues[':status'] = opts.status;
      }
      if (opts?.studentId) {
        filters.push('studentId = :studentId');
        ExpressionAttributeValues[':studentId'] = opts.studentId;
      }
      if (opts?.teacherId) {
        filters.push('teacherId = :teacherId');
        ExpressionAttributeValues[':teacherId'] = opts.teacherId;
      }

      const params: any = {
        TableName: ESCROW_TABLE,
        Limit: opts?.limit ?? 100,
      };
      if (filters.length) {
        params.FilterExpression = filters.join(' AND ');
        params.ExpressionAttributeValues = ExpressionAttributeValues;
        if (Object.keys(ExpressionAttributeNames).length) {
          params.ExpressionAttributeNames = ExpressionAttributeNames;
        }
      }

      const res = await ddbDocClient.send(new ScanCommand(params));
      return (res.Items || []) as EscrowRecord[];
    } catch (e) {
      console.error('[pointsEscrow] DynamoDB scan error:', e);
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
  const record: EscrowRecord = {
    ...params,
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

/**
 * Release escrow: transfer held points to the teacher.
 * Call this when the course session is fully completed.
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
export async function releaseEscrow(
  escrowId: string
): Promise<{ ok: true; teacherNewBalance: number } | { ok: false; error: string }> {
  const record = await getEscrow(escrowId);
  if (!record) return { ok: false, error: `Escrow ${escrowId} not found` };
  if (record.status !== 'HOLDING') {
    return { ok: false, error: `Escrow ${escrowId} is already ${record.status}` };
  }

  // Add points to teacher
  const teacherCurrent = await getUserPoints(record.teacherId);
  const teacherNewBalance = teacherCurrent + record.points;
  await setUserPoints(record.teacherId, teacherNewBalance);

  // Update escrow status
  const now = new Date().toISOString();
  if (useDynamoForEscrow) {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ESCROW_TABLE,
        Key: { escrowId },
        UpdateExpression: 'SET #status = :s, releasedAt = :ra, updatedAt = :ua',
        ConditionExpression: '#status = :holding',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':s': 'RELEASED', ':ra': now, ':ua': now, ':holding': 'HOLDING' },
      })
    );
  } else {
    LOCAL_ESCROW[escrowId] = { ...record, status: 'RELEASED', releasedAt: now, updatedAt: now };
  }

  console.log(
    `[pointsEscrow] Released escrow ${escrowId}: ${record.points} pts → teacher ${record.teacherId} (new balance: ${teacherNewBalance})`
  );

  return { ok: true, teacherNewBalance };
}

/**
 * Refund escrow: return held points back to the student.
 * Call this when the course is cancelled before completion.
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
export async function refundEscrow(
  escrowId: string
): Promise<{ ok: true; studentNewBalance: number } | { ok: false; error: string }> {
  const record = await getEscrow(escrowId);
  if (!record) return { ok: false, error: `Escrow ${escrowId} not found` };
  if (record.status !== 'HOLDING') {
    return { ok: false, error: `Escrow ${escrowId} is already ${record.status}` };
  }

  // Return points to student
  const studentCurrent = await getUserPoints(record.studentId);
  const studentNewBalance = studentCurrent + record.points;
  await setUserPoints(record.studentId, studentNewBalance);

  // Update escrow status
  const now = new Date().toISOString();
  if (useDynamoForEscrow) {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ESCROW_TABLE,
        Key: { escrowId },
        UpdateExpression: 'SET #status = :s, refundedAt = :rfa, updatedAt = :ua',
        ConditionExpression: '#status = :holding',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':s': 'REFUNDED', ':rfa': now, ':ua': now, ':holding': 'HOLDING' },
      })
    );
  } else {
    LOCAL_ESCROW[escrowId] = { ...record, status: 'REFUNDED', refundedAt: now, updatedAt: now };
  }

  console.log(
    `[pointsEscrow] Refunded escrow ${escrowId}: ${record.points} pts → student ${record.studentId} (new balance: ${studentNewBalance})`
  );

  return { ok: true, studentNewBalance };
}
