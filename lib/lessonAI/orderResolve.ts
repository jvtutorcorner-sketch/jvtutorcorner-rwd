// lib/lessonAI/orderResolve.ts
//
// Resolve the order a classroom occurrence bills against, so the lesson session
// id can be derived from (courseId, orderId, scheduled start). Mirrors the lookup
// in app/api/classroom/complete: an explicit orderId wins; otherwise find the one
// active order in the current time slot (orders have no courseId index → Scan,
// acceptable at MVP scale). Server-side only — the id is never trusted from the
// client.

import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { parseOrderTime, COMPLETION_EARLY_WINDOW_MS } from '@/lib/classroomCompletion';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

export interface ResolvedOrder {
  orderId: string;
  courseId: string;
  startTime?: string;
  endTime?: string;
}

function toResolved(o: Record<string, unknown> | null): ResolvedOrder | null {
  if (!o) return null;
  const orderId = typeof o.orderId === 'string' ? o.orderId : '';
  const courseId = typeof o.courseId === 'string' ? o.courseId : '';
  if (!orderId || !courseId) return null;
  return {
    orderId,
    courseId,
    startTime: typeof o.startTime === 'string' ? o.startTime : undefined,
    endTime: typeof o.endTime === 'string' ? o.endTime : undefined,
  };
}

export async function getOrderById(orderId: string): Promise<ResolvedOrder | null> {
  if (!orderId) return null;
  const res = await ddbDocClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }));
  return toResolved((res.Item as Record<string, unknown>) || null);
}

/** The single PAID/ACTIVE order for this course whose time slot contains `now`. */
export async function findCurrentOrderForCourse(courseId: string, now: number): Promise<ResolvedOrder | null> {
  const candidates: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(
      new ScanCommand({
        TableName: ORDERS_TABLE,
        FilterExpression: 'courseId = :c',
        ExpressionAttributeValues: { ':c': courseId },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    candidates.push(...(res.Items || []));
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const inWindow = candidates.filter((o) => {
    const status = String(o.status || '').toUpperCase();
    if (status !== 'PAID' && status !== 'ACTIVE') return false;
    const start = parseOrderTime(typeof o.startTime === 'string' ? o.startTime : null);
    const end = parseOrderTime(typeof o.endTime === 'string' ? o.endTime : null);
    if (start === null) return false;
    const endBound = end ?? start;
    return now >= start - COMPLETION_EARLY_WINDOW_MS && now <= endBound + 2 * 60 * 60 * 1000;
  });
  if (inWindow.length !== 1) return null;
  return toResolved(inWindow[0]);
}

/** Look up a course's canonical teacher id (for ensureClassroomSession). */
export async function getCourseTeacherId(courseId: string): Promise<string | null> {
  if (!courseId) return null;
  const res = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } }));
  const t = (res.Item as { teacherId?: unknown })?.teacherId;
  return typeof t === 'string' && t ? t : null;
}
