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
import { resolveCanonicalTeacherId } from '@/lib/teacherIdentity';

export const ESCROW_TABLE =
  process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

export const useDynamoForEscrow =
  typeof ESCROW_TABLE === 'string' &&
  ESCROW_TABLE.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID));

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
