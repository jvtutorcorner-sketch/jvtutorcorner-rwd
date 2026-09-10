// lib/courseSessionService.ts
//
// Course sessions (梯次 / 場次) — see lib/types/courseSession.ts for why this
// entity exists.
//
// Table: jvtutorcorner-course-sessions (scripts/setup-db.mjs :: createCourseSessionsTable)
//   PK id
//   byCourseId  (courseId  HASH, startTime RANGE)
//   byTeacherId (teacherId HASH, startTime RANGE)
//   byRoomId    (roomId    HASH)

import { randomUUID } from 'crypto';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { requireCanonicalTeacherId } from '@/lib/teacherIdentity';
import type {
  CourseSession,
  CourseSessionStatus,
  CreateCourseSessionInput,
} from '@/lib/types/courseSession';

export const COURSE_SESSIONS_TABLE =
  process.env.DYNAMODB_TABLE_COURSE_SESSIONS || 'jvtutorcorner-course-sessions';

export const ATTENDANCE_TABLE =
  process.env.DYNAMODB_TABLE_ATTENDANCE || 'jvtutorcorner-attendance';

// ──────────────────────────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────────────────────────

export async function getCourseSession(id: string): Promise<CourseSession | null> {
  if (!id) return null;
  const res = await ddbDocClient.send(
    new GetCommand({ TableName: COURSE_SESSIONS_TABLE, Key: { id } })
  );
  return (res.Item as CourseSession) || null;
}

async function queryAll(params: any): Promise<CourseSession[]> {
  const items: CourseSession[] = [];
  let exclusiveStartKey: any = undefined;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        ...params,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as CourseSession[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

/** Every occurrence of a course, earliest first. */
export async function listSessionsByCourse(courseId: string): Promise<CourseSession[]> {
  if (!courseId) return [];
  return queryAll({
    TableName: COURSE_SESSIONS_TABLE,
    IndexName: 'byCourseId',
    KeyConditionExpression: 'courseId = :cid',
    ExpressionAttributeValues: { ':cid': courseId },
    ScanIndexForward: true,
  });
}

/** A teacher's schedule across all their courses, within an optional window. */
export async function listSessionsByTeacher(
  teacherId: string,
  opts?: { from?: string; to?: string }
): Promise<CourseSession[]> {
  if (!teacherId) return [];

  const params: any = {
    TableName: COURSE_SESSIONS_TABLE,
    IndexName: 'byTeacherId',
    ExpressionAttributeValues: { ':tid': teacherId },
    ScanIndexForward: true,
  };

  if (opts?.from && opts?.to) {
    params.KeyConditionExpression = 'teacherId = :tid AND startTime BETWEEN :from AND :to';
    params.ExpressionAttributeValues[':from'] = opts.from;
    params.ExpressionAttributeValues[':to'] = opts.to;
  } else if (opts?.from) {
    params.KeyConditionExpression = 'teacherId = :tid AND startTime >= :from';
    params.ExpressionAttributeValues[':from'] = opts.from;
  } else {
    params.KeyConditionExpression = 'teacherId = :tid';
  }

  return queryAll(params);
}

/**
 * Resolve a live classroom room back to the session that owns it.
 *
 * This is the lookup that lets a join request be authorised against stored state
 * instead of a client-supplied room id.
 */
export async function findSessionByRoomId(roomId: string): Promise<CourseSession | null> {
  if (!roomId) return null;
  const res = await ddbDocClient.send(
    new QueryCommand({
      TableName: COURSE_SESSIONS_TABLE,
      IndexName: 'byRoomId',
      KeyConditionExpression: 'roomId = :rid',
      ExpressionAttributeValues: { ':rid': roomId },
      Limit: 1,
    })
  );
  return ((res.Items?.[0]) as CourseSession) || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────────────────────────────────

export async function createCourseSession(
  input: CreateCourseSessionInput
): Promise<CourseSession> {
  if (!input.courseId) throw new Error('[courseSession] courseId is required');
  if (!input.startTime || !input.endTime) {
    throw new Error('[courseSession] startTime and endTime are required');
  }

  // Teacher references are canonical ids, never emails — the same rule the
  // escrow table now enforces, so a session and its escrow agree on who the
  // teacher is.
  const teacherId = await requireCanonicalTeacherId(input.teacherId);

  // Sequence defaults to "one past the highest existing occurrence". This is a
  // display label, not a key, so a race producing two sessions labelled 3 is
  // cosmetic — the id is the identity.
  let sequence = input.sequence;
  if (sequence === undefined || sequence === null) {
    const existing = await listSessionsByCourse(input.courseId);
    sequence = existing.reduce((max, s) => Math.max(max, s.sequence || 0), 0) + 1;
  }

  const now = new Date().toISOString();
  const session: CourseSession = {
    id: randomUUID(),
    courseId: String(input.courseId),
    teacherId,
    orgId: input.orgId || undefined,
    sequence,
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
    // roomId is the byRoomId GSI key: a NULL-typed value is rejected by DynamoDB
    // ("Type mismatch for Index Key"), so an unassigned room must be an absent
    // attribute. setSessionRoom() adds it later.
    roomId: input.roomId || undefined,
    capacity: input.capacity ?? null,
    status: 'SCHEDULED',
    attendedCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Item: session,
      ConditionExpression: 'attribute_not_exists(id)',
    })
  );

  console.log(
    `[courseSession] created ${session.id} course=${session.courseId} seq=${sequence} teacher=${teacherId}`
  );
  return session;
}

/** Attach (or replace) the live classroom room for a session. */
export async function setSessionRoom(
  sessionId: string,
  roomId: string
): Promise<CourseSession | null> {
  const now = new Date().toISOString();
  const res = await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: sessionId },
      UpdateExpression: 'SET roomId = :rid, updatedAt = :now',
      ExpressionAttributeValues: { ':rid': roomId, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return (res.Attributes as CourseSession) || null;
}

/**
 * Move a session to LIVE.
 *
 * Conditional on the current status so a second "start" is a no-op rather than
 * resetting startedAt — classroom clients retry this call on reconnect.
 */
export async function markSessionStarted(
  sessionId: string,
  roomId?: string
): Promise<{ ok: true; session: CourseSession } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const sets = ['#status = :live', 'startedAt = if_not_exists(startedAt, :now)', 'updatedAt = :now'];
  const values: Record<string, any> = { ':live': 'LIVE', ':now': now, ':scheduled': 'SCHEDULED' };

  if (roomId) {
    sets.push('roomId = :rid');
    values[':rid'] = roomId;
  }

  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: sessionId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(id) AND (#status = :scheduled OR #status = :live)',
        ReturnValues: 'ALL_NEW',
      })
    );
    return { ok: true, session: res.Attributes as CourseSession };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return { ok: false, error: `Session ${sessionId} is not startable (missing, completed, or cancelled)` };
    }
    throw err;
  }
}

/**
 * Record that a session finished.
 *
 * This is the fact the points-escrow release path should key off. It is a
 * conditional single-writer transition: only a LIVE or SCHEDULED session can
 * complete, and completing twice fails the condition rather than overwriting
 * completedAt. That matters because "completed" is what moves a student's held
 * points to the teacher — a second completion must not be able to trigger a
 * second release.
 */
export async function markSessionCompleted(
  sessionId: string
): Promise<{ ok: true; session: CourseSession } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: sessionId },
        UpdateExpression:
          'SET #status = :completed, completedAt = :now, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':completed': 'COMPLETED',
          ':now': now,
          ':live': 'LIVE',
          ':scheduled': 'SCHEDULED',
        },
        ConditionExpression:
          'attribute_exists(id) AND (#status = :live OR #status = :scheduled)',
        ReturnValues: 'ALL_NEW',
      })
    );
    console.log(`[courseSession] completed ${sessionId}`);
    return { ok: true, session: res.Attributes as CourseSession };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return {
        ok: false,
        error: `Session ${sessionId} is not completable (missing, already completed, or cancelled)`,
      };
    }
    throw err;
  }
}

/** Call a session off. Escrow for it should be refunded, not released. */
export async function markSessionCancelled(
  sessionId: string,
  reason?: string
): Promise<{ ok: true; session: CourseSession } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: sessionId },
        UpdateExpression:
          'SET #status = :cancelled, cancelledAt = :now, cancellationReason = :reason, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':cancelled': 'CANCELLED',
          ':now': now,
          ':reason': reason || null,
          ':completed': 'COMPLETED',
        },
        // A completed session cannot be un-completed: its escrow may already be released.
        ConditionExpression: 'attribute_exists(id) AND #status <> :completed',
        ReturnValues: 'ALL_NEW',
      })
    );
    return { ok: true, session: res.Attributes as CourseSession };
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return {
        ok: false,
        error: `Session ${sessionId} cannot be cancelled (missing or already completed)`,
      };
    }
    throw err;
  }
}

/**
 * Record one student's attendance at one session.
 *
 * The attendance row is the source of truth and lives in the attendance table,
 * keyed so a repeat check-in for the same (session, student) overwrites rather
 * than duplicates. The counter on the session is incremented only when the row
 * is genuinely new, so it cannot drift upward on a double scan.
 */
export async function recordAttendance(params: {
  courseSessionId: string;
  studentId: string;
  courseId: string;
  orderId?: string | null;
}): Promise<{ ok: boolean; alreadyRecorded: boolean }> {
  const { courseSessionId, studentId, courseId, orderId } = params;
  if (!courseSessionId || !studentId) {
    throw new Error('[courseSession] courseSessionId and studentId are required');
  }

  const scannedAt = new Date().toISOString();
  // Deterministic id => idempotent check-in for this (session, student) pair.
  const id = `att_${courseSessionId}_${studentId}`;

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: ATTENDANCE_TABLE,
        Item: {
          id,
          courseSessionId,
          courseId,
          studentId,
          orderId: orderId ?? null,
          scannedAt,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      })
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return { ok: true, alreadyRecorded: true };
    }
    throw err;
  }

  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: COURSE_SESSIONS_TABLE,
        Key: { id: courseSessionId },
        UpdateExpression:
          'SET attendedCount = if_not_exists(attendedCount, :zero) + :one, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': scannedAt },
        ConditionExpression: 'attribute_exists(id)',
      })
    );
  } catch (err: any) {
    // The attendance row is written; a stale counter is cosmetic and is
    // recomputed by anything that needs an exact number.
    console.warn(
      `[courseSession] attendance recorded but counter not incremented for ${courseSessionId}:`,
      err?.message || err
    );
  }

  return { ok: true, alreadyRecorded: false };
}

/** Statuses that mean "this occurrence still expects students". */
export function isSessionOpen(status: CourseSessionStatus): boolean {
  return status === 'SCHEDULED' || status === 'LIVE';
}

// ──────────────────────────────────────────────────────────────────────────────
// LiveKit webhook write-back (Phase 4)
// ──────────────────────────────────────────────────────────────────────────────

export interface PresenceEntry {
  identity: string;
  role: 'teacher' | 'student' | 'admin';
  kind: 'join' | 'leave';
  at: string; // ISO
}

/**
 * Record one presence event onto the session's presenceLog map.
 *
 * Keyed by the LiveKit webhook event uuid, so retried deliveries (LiveKit is
 * at-least-once) overwrite the same entry with the same value → idempotent, and
 * concurrent events for different eventIds don't clobber each other (no
 * read-modify-write). The map is lazily created with if_not_exists on the root.
 */
export async function recordPresenceEvent(
  sessionId: string,
  eventId: string,
  entry: PresenceEntry
): Promise<void> {
  if (!sessionId || !eventId) return;
  const now = new Date().toISOString();
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: sessionId },
      // Two-step-in-one: ensure the map exists, then set this event's key.
      UpdateExpression:
        'SET presenceLog = if_not_exists(presenceLog, :empty), updatedAt = :now',
      ExpressionAttributeValues: { ':empty': {}, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    })
  ).catch((err) => {
    // A missing session (e.g. room for a deleted session) shouldn't throw here.
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  });

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: sessionId },
      UpdateExpression: 'SET presenceLog.#eid = :entry, updatedAt = :now',
      ExpressionAttributeNames: { '#eid': eventId },
      ExpressionAttributeValues: { ':entry': entry, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    })
  ).catch((err) => {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  });
}

/** Record the LiveKit room sid for reconciliation (idempotent). */
export async function setSessionRoomSid(sessionId: string, roomSid: string): Promise<void> {
  if (!sessionId || !roomSid) return;
  const now = new Date().toISOString();
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: sessionId },
      UpdateExpression: 'SET livekitRoomSid = :sid, updatedAt = :now',
      ExpressionAttributeValues: { ':sid': roomSid, ':now': now },
      ConditionExpression: 'attribute_exists(id)',
    })
  ).catch((err) => {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  });
}

export interface SessionDurations {
  actualDurationSec: number;
  teacherPresenceSec: number;
  studentPresenceSec: number;
  billableSec: number;
}

/** Persist the computed durations + escrow settlement result (idempotent overwrite). */
export async function saveSessionSettlement(
  sessionId: string,
  durations: SessionDurations,
  settlement: NonNullable<CourseSession['escrowSettlement']>
): Promise<void> {
  const now = new Date().toISOString();
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: COURSE_SESSIONS_TABLE,
      Key: { id: sessionId },
      UpdateExpression:
        'SET actualDurationSec = :ad, teacherPresenceSec = :tp, studentPresenceSec = :sp, ' +
        'billableSec = :bs, escrowSettlement = :es, updatedAt = :now',
      ExpressionAttributeValues: {
        ':ad': durations.actualDurationSec,
        ':tp': durations.teacherPresenceSec,
        ':sp': durations.studentPresenceSec,
        ':bs': durations.billableSec,
        ':es': settlement,
        ':now': now,
      },
      ConditionExpression: 'attribute_exists(id)',
    })
  );
}
