/**
 * Course Session (梯次 / 場次) — one dated occurrence of a course.
 *
 * ── Why this entity exists ────────────────────────────────────────────────────
 * A `course` row was doing two incompatible jobs at once. It was the catalogue
 * entry (title, subject, price, teacher) AND the single occurrence (startDate,
 * startTime, endTime, seatsLeft). That works only while a course runs exactly
 * once, and it left three facts with nowhere to live:
 *
 *   1. THE CLASSROOM ROOM. The Agora/whiteboard room id was derived per request
 *      from the course id, so there was no stored record saying "this room
 *      belongs to this occurrence". Nothing could authorise a join by looking
 *      the room up — see app/api/classroom/ready/route.ts, which manufactures
 *      `classroom_ready_<uuid>` on the fly.
 *   2. ATTENDANCE. Rows in the attendance table point at (courseId, orderId,
 *      studentId) with no occurrence, so a course that meets weekly produces
 *      check-ins that cannot be attributed to a specific meeting.
 *   3. COMPLETION. "Is this finished?" was inferred by comparing the wall clock
 *      to course.endTime. That is not a record — it cannot express "ended early",
 *      "cancelled", or "ended but not yet settled", and it is exactly the signal
 *      the points-escrow release path needs to be certain about before moving a
 *      student's money to a teacher.
 *
 * A course is now the catalogue entry. A course session is one occurrence of it,
 * and it owns the room, the attendance link, and the completion state.
 */

export type CourseSessionStatus =
  /** Created, not yet started. */
  | 'SCHEDULED'
  /** The room is open and the class is in progress. */
  | 'LIVE'
  /** The class ran to completion. This is the signal that releases escrow. */
  | 'COMPLETED'
  /** Called off. Escrow for this session should be refunded, not released. */
  | 'CANCELLED';

/** Every CourseSessionStatus value; the partitions of the byStatus GSI. */
export const COURSE_SESSION_STATUSES = [
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly CourseSessionStatus[];

export function isCourseSessionStatus(value: unknown): value is CourseSessionStatus {
  return typeof value === 'string' && (COURSE_SESSION_STATUSES as readonly string[]).includes(value);
}

/** Window options for byStatus queries. `from` / `to` bound startTime (inclusive, ISO 8601 UTC). */
export interface SessionStatusQueryOptions {
  from?: string;
  to?: string;
  /** Stop after this many items (across pages). */
  limit?: number;
}

/** What a capacity pre-scaler needs: classes about to start and classes running now. */
export interface UpcomingAndLiveSessions {
  /** status LIVE, all of them, startTime ascending. */
  live: CourseSession[];
  /** status SCHEDULED with startTime inside `window`, startTime ascending. */
  upcoming: CourseSession[];
  /** The startTime window used for `upcoming` (ISO 8601 UTC). */
  window: { from: string; to: string };
}

export interface CourseSession {
  /** Primary key (UUID v4). */
  id: string;

  /** Catalogue course this is an occurrence of. */
  courseId: string;

  /**
   * Canonical teacher id — `profile.roid_id || profile.id`, resolved through
   * lib/teacherIdentity.ts. Never an email. See that module for why.
   */
  teacherId: string;

  /** Owning organisation for a private/corporate cohort; null for public ones. */
  orgId?: string | null;

  /**
   * The order this occurrence bills against (1對1 / small-class). Present when the
   * session was claimed from a classroom via ensureClassroomSession(); absent for
   * B2B enrollment-based occurrences. Non-key attribute.
   */
  orderId?: string | null;

  /**
   * Cross-reference to the class-summaries row (buildSummaryId) for the same
   * occurrence, so the AI summary (L3) and this session agree on identity.
   */
  summaryId?: string | null;

  /** 1-based occurrence number within the course ("第 3 梯次"). */
  sequence: number;

  /** Optional label, e.g. '2026 春季班'. Falls back to the course title. */
  title?: string;

  /**
   * Scheduled start (ISO 8601, UTC `Z` form). Range key of the byCourseId /
   * byTeacherId / byStatus GSIs — window queries compare it as a string, so a
   * non-`Z` offset would sort wrongly.
   */
  startTime: string;

  /** Scheduled end (ISO 8601). */
  endTime: string;

  /**
   * The live classroom room this occurrence uses (Agora channel / whiteboard room).
   * Indexed by byRoomId so a join request can be resolved back to its session and
   * authorised, rather than trusting a room id supplied by the client.
   */
  roomId?: string | null;

  /** Seats this occurrence offers. Occupancy is counted from enrollments. */
  capacity?: number | null;

  /**
   * Hash key of the byStatus GSI. Must always be one of COURSE_SESSION_STATUSES —
   * never null and never removed, or DynamoDB rejects the write
   * ("Type mismatch for Index Key").
   */
  status: CourseSessionStatus;

  /** When the room actually opened. */
  startedAt?: string;

  /** When the class actually finished. Set together with status COMPLETED. */
  completedAt?: string;

  /** When it was called off, and why. */
  cancelledAt?: string;
  cancellationReason?: string;

  // ── LiveKit webhook 寫回的實際上課紀錄（Phase 4） ──────────────────────────
  // 這些是薪資結算與點數釋放的「事實依據」，全部由 webhook 從 LiveKit server 的
  // 事件時間戳算出，不信任前端回報。

  /** LiveKit 房間的 sid（room_started 時記錄，方便對帳）。 */
  livekitRoomSid?: string;

  /**
   * 出席事件流，key = LiveKit webhook 事件 uuid（天生冪等：同一事件重送會覆寫同值）。
   * room_finished 時讀這份 log 計算時長，避免逐事件 read-modify-write 的競態。
   */
  presenceLog?: Record<
    string,
    { identity: string; role: 'teacher' | 'student' | 'admin'; kind: 'join' | 'leave'; at: string }
  >;

  /**
   * Cloudflare Realtime SFU 的房間登錄，key = SFU sessionId（見 lib/realtime/registry.ts）。
   * SFU 沒有房間與參與者的概念，這份登錄就是「誰在場、發佈了哪些軌道」的伺服器真相；
   * 對方要拉誰的軌道一律從這裡查，不採信瀏覽器互傳的 sessionId。
   */
  sfuSessions?: Record<
    string,
    {
      /** `${role}:${userId}`，與 LiveKit identity 同格式。 */
      identity: string;
      userId: string;
      role: 'teacher' | 'student' | 'admin';
      joinedAt: string;
      /** 最後一次心跳；超過 REALTIME_HEARTBEAT_TIMEOUT_SEC 視為離開。 */
      lastSeenAt: string;
      leftAt?: string;
      /** 已發佈的本地軌道：trackName → 發佈時間。 */
      tracks: Record<string, string>;
    }
  >;

  /** 房間實際開到關的總長（completedAt - startedAt），秒。 */
  actualDurationSec?: number;
  /** 老師在場總時長（多段重連取聯集），秒。 */
  teacherPresenceSec?: number;
  /** 學生在場總時長（多段取聯集），秒。 */
  studentPresenceSec?: number;
  /** 師生「同時」在場的時長 = 可計費時間，秒。薪資與扣點以此為準。 */
  billableSec?: number;

  /** escrow 結算結果（room_finished 觸發），冪等記錄。 */
  escrowSettlement?: {
    at: string;
    released: Array<{ orderId: string; escrowId: string; points: number }>;
    skipped: Array<{ orderId: string; reason: string }>;
  };

  /**
   * Denormalised attendance count, maintained by recordAttendance().
   *
   * The attendance rows themselves stay in the attendance table — this is a
   * counter for listings, not the source of truth. Anything that must be exact
   * (billing, completion rules) counts the attendance rows.
   */
  attendedCount?: number;

  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseSessionInput {
  courseId: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  sequence?: number;
  title?: string;
  orgId?: string | null;
  roomId?: string | null;
  capacity?: number | null;
}

/** Live occupancy for one course or one session, computed from enrollments. */
export interface SeatOccupancy {
  /** Seats offered. Null when the course/session declares no limit. */
  capacity: number | null;
  /** Access-granting enrollments counted from the enrollments table. */
  occupied: number;
  /** capacity - occupied, floored at 0. Null when capacity is null. */
  seatsLeft: number | null;
  /** True when capacity is set and fully taken. */
  isFull: boolean;
}
