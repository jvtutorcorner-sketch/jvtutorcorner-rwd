// lib/enrollmentService.ts
//
// Enrollment reads, expressed as Queries against the GSIs that
// scripts/setup-db.mjs :: createEnrollmentsTable provisions.
//
// Every access decision in this codebase used to reach the enrollments table via
// a full-table ScanCommand with a FilterExpression — lib/accessControl.ts to
// decide whether a student may open a course, app/api/enroll/route.ts to list
// them. Two things are wrong with that beyond cost:
//
//   1. DynamoDB applies Limit to items SCANNED, not items matched. A Scan with
//      Limit 50 and a filter returns the matches inside the first 50 rows of the
//      table, which is an arbitrary subset. "Do you have an active enrollment?"
//      answered from that is a coin flip once the table is non-trivial.
//   2. A Scan reads every tenant's rows to answer a single user's question, so a
//      filter bug leaks across users and organisations rather than returning
//      nothing.
//
// The indexes:
//   byUserId   (userId  HASH, createdAt RANGE) — a student's enrollments
//   byCourseId (courseId HASH, createdAt RANGE) — a course's roster / seat count
//   byOrderId  (orderId HASH)                   — reconcile order -> enrollment
//   byOrgId    (orgId   HASH, createdAt RANGE)  — an organisation's enrollments

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const ENROLLMENTS_TABLE =
  process.env.ENROLLMENTS_TABLE ||
  process.env.DYNAMODB_TABLE_ENROLLMENTS ||
  'jvtutorcorner-enrollments';

export type EnrollmentStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'FAILED';

/** Statuses that actually grant access to course content. */
export const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = ['PAID', 'ACTIVE'];

export type EnrollmentRecord = {
  id: string;
  name: string;
  email: string;
  userId?: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
  paymentProvider?: string;
  paymentSessionId?: string;
  startTime?: string;
  endTime?: string;

  /**
   * The order that paid for this enrollment.
   *
   * Previously absent: an enrollment recorded WHAT was bought but not WHICH
   * payment bought it, while orders recorded `enrollmentId` pointing the other
   * way. A one-directional link meant "this order was captured — did the seat
   * actually get granted?" could only be answered by scanning enrollments and
   * comparing, and a half-finished checkout left an orphan row nothing pointed at.
   */
  orderId?: string | null;

  /**
   * Owning organisation for a seat consumed under a B2B contract, null for B2C.
   *
   * Previously declared on the type but never written by the POST handler, so
   * every B2B enrollment was indistinguishable from a personal purchase and no
   * org-scoped listing was possible.
   */
  orgId?: string | null;

  /** Which course session (梯次/場次) this enrollment is for, when scheduled. */
  courseSessionId?: string | null;

  sourceType?: 'B2C' | 'B2B_SEAT' | 'ADMIN_OVERRIDE';
};

async function queryAll(params: any): Promise<EnrollmentRecord[]> {
  const items: EnrollmentRecord[] = [];
  let exclusiveStartKey: any = undefined;

  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        ...params,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as EnrollmentRecord[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

/** Every enrollment belonging to one user, newest first. */
export async function listEnrollmentsByUser(
  userId: string,
  opts?: { statuses?: EnrollmentStatus[] }
): Promise<EnrollmentRecord[]> {
  if (!userId) return [];

  const params: any = {
    TableName: ENROLLMENTS_TABLE,
    IndexName: 'byUserId',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
  };

  applyStatusFilter(params, opts?.statuses);
  return queryAll(params);
}

/** Every enrollment for one course — the roster, and the seat-occupancy source. */
export async function listEnrollmentsByCourse(
  courseId: string,
  opts?: { statuses?: EnrollmentStatus[] }
): Promise<EnrollmentRecord[]> {
  if (!courseId) return [];

  const params: any = {
    TableName: ENROLLMENTS_TABLE,
    IndexName: 'byCourseId',
    KeyConditionExpression: 'courseId = :cid',
    ExpressionAttributeValues: { ':cid': courseId },
    ScanIndexForward: false,
  };

  applyStatusFilter(params, opts?.statuses);
  return queryAll(params);
}

/** Every enrollment belonging to one organisation. */
export async function listEnrollmentsByOrg(
  orgId: string,
  opts?: { statuses?: EnrollmentStatus[] }
): Promise<EnrollmentRecord[]> {
  if (!orgId) return [];

  const params: any = {
    TableName: ENROLLMENTS_TABLE,
    IndexName: 'byOrgId',
    KeyConditionExpression: 'orgId = :oid',
    ExpressionAttributeValues: { ':oid': orgId },
    ScanIndexForward: false,
  };

  applyStatusFilter(params, opts?.statuses);
  return queryAll(params);
}

/** The enrollments an order paid for. */
export async function listEnrollmentsByOrder(
  orderId: string
): Promise<EnrollmentRecord[]> {
  if (!orderId) return [];

  return queryAll({
    TableName: ENROLLMENTS_TABLE,
    IndexName: 'byOrderId',
    KeyConditionExpression: 'orderId = :oid',
    ExpressionAttributeValues: { ':oid': orderId },
  });
}

/**
 * Does this user hold an access-granting enrollment for this course?
 *
 * A Query on byUserId followed by an in-memory courseId match. The alternative
 * — a Query on byCourseId — reads the whole roster to answer a question about
 * one person, so it scales with the popular course rather than the user.
 */
export async function findActiveEnrollment(
  userId: string,
  courseId: string
): Promise<EnrollmentRecord | null> {
  if (!userId || !courseId) return null;

  const rows = await listEnrollmentsByUser(userId, {
    statuses: ACTIVE_ENROLLMENT_STATUSES,
  });

  return rows.find((r) => r.courseId === courseId) || null;
}

function applyStatusFilter(params: any, statuses?: EnrollmentStatus[]): void {
  if (!statuses || statuses.length === 0) return;

  const placeholders = statuses.map((_, i) => `:st${i}`);
  params.FilterExpression = `#status IN (${placeholders.join(', ')})`;
  params.ExpressionAttributeNames = {
    ...(params.ExpressionAttributeNames || {}),
    '#status': 'status',
  };
  statuses.forEach((status, i) => {
    params.ExpressionAttributeValues[`:st${i}`] = status;
  });
}
