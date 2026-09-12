// lib/seatAccounting.ts
//
// Seat counts, derived from the tables that own the underlying facts.
//
// ── The two counters and what was wrong with them ─────────────────────────────
//
// course.seatsLeft — was a plain number a teacher typed into the course edit
//   form. Nothing ever decremented it. Enrolling a student did not change it;
//   cancelling did not change it. So a course advertising "3 位" advertised 3
//   forever, whatever the roster said, and the number shown to a buyer was
//   unrelated to whether a seat existed. It was never a remaining-seat count —
//   it was a capacity the field name mislabelled.
//
//   Fixed by derivation: capacity is the stored number, occupancy is counted
//   from access-granting enrollments on the byCourseId GSI, and seatsLeft is
//   the difference computed at read time. There is no stored counter left to
//   drift.
//
// Organization.usedSeats — is a real counter, and it must stay one: it is the
//   thing conditional writes test against to stop an org exceeding maxSeats
//   (organizationService.incrementUsedSeats uses `usedSeats < maxSeats`), and a
//   count-on-read cannot be used as a DynamoDB condition. It is already mutated
//   only through those atomic conditional updates. What was missing is the
//   ability to detect and repair drift when a seat transaction half-fails, which
//   reconcileOrgUsedSeats below provides.

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import {
  listEnrollmentsByCourse,
  ACTIVE_ENROLLMENT_STATUSES,
  type EnrollmentRecord,
} from '@/lib/enrollmentService';
import { countActiveLicenses } from '@/lib/licenseService';
import { getOrganizationById } from '@/lib/organizationService';
import type { SeatOccupancy } from '@/lib/types/courseSession';

const ORGANIZATIONS_TABLE =
  process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations';

/**
 * Read the capacity a course row declares.
 *
 * `capacity` is the field going forward. `seatsLeft` is read as a fallback
 * because that is where every existing row's number lives — it was always a
 * capacity, so reading it as one is a rename, not a semantic change.
 */
export function readCourseCapacity(
  course: { capacity?: number | null; seatsLeft?: number | null } | null | undefined
): number | null {
  if (!course) return null;
  const explicit = course.capacity;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const legacy = course.seatsLeft;
  if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
  return null;
}

function toOccupancy(capacity: number | null, occupied: number): SeatOccupancy {
  if (capacity === null) {
    return { capacity: null, occupied, seatsLeft: null, isFull: false };
  }
  const seatsLeft = Math.max(0, capacity - occupied);
  return { capacity, occupied, seatsLeft, isFull: seatsLeft === 0 };
}

/**
 * Live seat occupancy for a course, counted from the enrollments table.
 *
 * Only PAID/ACTIVE enrollments occupy a seat: a PENDING_PAYMENT row is a
 * checkout in progress and a CANCELLED/FAILED one has released its seat.
 */
export async function getCourseOccupancy(
  course: { id: string; capacity?: number | null; seatsLeft?: number | null }
): Promise<SeatOccupancy> {
  const capacity = readCourseCapacity(course);

  const enrollments = await listEnrollmentsByCourse(course.id, {
    statuses: ACTIVE_ENROLLMENT_STATUSES,
  });

  return toOccupancy(capacity, enrollments.length);
}

/**
 * Occupancy for one course session (梯次), when enrollments name a session.
 *
 * Enrollments that predate the session entity carry no courseSessionId; they are
 * counted against the course as a whole, not against any single occurrence.
 */
export async function getSessionOccupancy(
  session: { id: string; courseId: string; capacity?: number | null }
): Promise<SeatOccupancy> {
  const enrollments = await listEnrollmentsByCourse(session.courseId, {
    statuses: ACTIVE_ENROLLMENT_STATUSES,
  });

  const occupied = enrollments.filter(
    (e: EnrollmentRecord) => e.courseSessionId === session.id
  ).length;

  const capacity =
    typeof session.capacity === 'number' && Number.isFinite(session.capacity)
      ? session.capacity
      : null;

  return toOccupancy(capacity, occupied);
}

/** Simultaneous occupancy Queries during a listing decoration. */
const MAX_CONCURRENT_OCCUPANCY_QUERIES = 10;

/**
 * Above this many capacity-bearing courses in one listing, per-course occupancy
 * is skipped entirely. A catalogue page is not worth hundreds of Queries; that
 * scale needs a maintained counter or a cache, and silently issuing the fan-out
 * would turn a browse into a slow, expensive request.
 */
const MAX_COURSES_TO_DECORATE = 100;

/**
 * Attach a derived `seatsLeft` (and `capacity`, `seatsOccupied`) to course rows
 * for a listing response.
 *
 * Courses that declare no capacity cost nothing — they short-circuit before any
 * query. The rest are resolved one Query each, at bounded concurrency.
 *
 * A course whose occupancy cannot be read keeps its stored value rather than
 * reporting a wrong one: a listing should degrade to stale, never to "0 seats"
 * on a transient failure, which would tell a buyer a course is full when it is
 * not.
 */
export async function decorateCoursesWithSeats<
  T extends { id: string; capacity?: number | null; seatsLeft?: number | null }
>(courses: T[]): Promise<(T & { capacity: number | null; seatsOccupied?: number })[]> {
  const results: any[] = new Array(courses.length);
  const needsQuery: number[] = [];

  courses.forEach((course, i) => {
    const capacity = readCourseCapacity(course);
    if (capacity === null) {
      // No declared capacity means unlimited: no seat maths, no query.
      results[i] = { ...course, capacity: null, seatsLeft: null };
    } else {
      results[i] = { ...course, capacity };
      needsQuery.push(i);
    }
  });

  if (needsQuery.length === 0) return results;

  if (needsQuery.length > MAX_COURSES_TO_DECORATE) {
    console.warn(
      `[seatAccounting] ${needsQuery.length} courses declare a capacity, over the ` +
        `${MAX_COURSES_TO_DECORATE} limit — returning stored values without live occupancy`
    );
    return results;
  }

  let cursor = 0;
  async function worker() {
    while (cursor < needsQuery.length) {
      const idx = needsQuery[cursor++];
      const course = courses[idx];
      try {
        const occupancy = await getCourseOccupancy(course);
        results[idx] = {
          ...results[idx],
          capacity: occupancy.capacity,
          seatsOccupied: occupancy.occupied,
          seatsLeft: occupancy.seatsLeft,
        };
      } catch (err: any) {
        console.warn(
          `[seatAccounting] occupancy lookup failed for course ${course.id}, keeping stored value:`,
          err?.message || err
        );
      }
    }
  }

  const workers = Math.min(MAX_CONCURRENT_OCCUPANCY_QUERIES, needsQuery.length);
  await Promise.all(Array.from({ length: workers }, worker));

  return results;
}

/**
 * Compare Organization.usedSeats against the licenses that actually exist and
 * repair it if they disagree.
 *
 * usedSeats is defined as "count of this org's licenses with status 'active'"
 * (lib/types/b2b.ts). It is maintained by atomic increments, so it drifts only
 * when a multi-step seat transaction fails between its steps — a license created
 * but not counted, or counted but not created. Nothing detected that before.
 *
 * @param apply false (default) reports the drift without writing.
 */
export async function reconcileOrgUsedSeats(
  orgId: string,
  opts?: { apply?: boolean }
): Promise<{
  orgId: string;
  recorded: number;
  actual: number;
  drift: number;
  repaired: boolean;
}> {
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error(`[seatAccounting] organization ${orgId} not found`);

  const actual = await countActiveLicenses(orgId);
  const recorded = org.usedSeats ?? 0;
  const drift = recorded - actual;

  if (drift === 0) {
    return { orgId, recorded, actual, drift, repaired: false };
  }

  console.warn(
    `[seatAccounting] org ${orgId} usedSeats drift: recorded=${recorded} actual=${actual}`
  );

  if (!opts?.apply) {
    return { orgId, recorded, actual, drift, repaired: false };
  }

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { id: orgId },
      UpdateExpression: 'SET usedSeats = :actual, updatedAt = :now',
      ExpressionAttributeValues: {
        ':actual': actual,
        ':now': new Date().toISOString(),
        ':recorded': recorded,
      },
      // Only overwrite the value we measured against. If a concurrent seat
      // transaction moved usedSeats while we were counting, this write loses and
      // the next reconciliation pass picks it up with a fresh count.
      ConditionExpression: 'usedSeats = :recorded',
    })
  );

  console.log(`[seatAccounting] org ${orgId} usedSeats repaired: ${recorded} -> ${actual}`);
  return { orgId, recorded, actual, drift, repaired: true };
}
