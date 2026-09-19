// lib/livekit/authorizeJoin.ts
//
// 進教室授權核心：在簽發 LiveKit Token 之前，先用 DynamoDB 上的紀錄回答三個問題
//
//   1. 這個 room 屬於哪一場課？          → jvtutorcorner-course-sessions (PK id / GSI byRoomId)
//   2. 這個人是這場課的老師還是學生？    → profiles (老師身分) / enrollments (學生報名) / licenses (企業席次)
//   3. 現在可以進去嗎？                  → session.status + startTime/endTime ± 緩衝
//
// 這個模組完全不碰 HTTP 與 LiveKit SDK，所以 Next.js route 和獨立 Lambda 都能共用，
// 單元測試也只需要 mock DynamoDB service。
//
// 設計原則：
//   * Room 名稱一律由「伺服器端」決定（courseSession.roomId 或 cs_<sessionId>），
//     絕不信任 client 傳來的 room 字串，避免拿到別人教室的 token。
//   * 回傳結果永遠是 Discriminated Union：呼叫端必須處理 ok=false 的每一種原因，
//     方便前端顯示對應訊息（太早、已結束、未報名…）。

import { getProfileById } from '@/lib/profilesService';
import { findPurchasedEnrollment, findValidSeatLicense } from '@/lib/accessControl';
import {
  findSessionByRoomId,
  getCourseSession,
  setSessionRoom,
} from '@/lib/courseSessionService';
import type { CourseSession } from '@/lib/types/courseSession';

// ─── 輸入 / 輸出型別 ──────────────────────────────────────────────────────────

/** 呼叫端已驗證過身分後提供的最小資訊（來自 session table 或 Cognito claims）。 */
export interface JoinRequester {
  userId: string;
  email?: string;
  /** 平台角色：'teacher' | 'student' | 'admin' | 'system' | ... */
  role: string;
}

export interface JoinRequest {
  /** 二擇一：優先用 courseSessionId；沒有時用 roomId 反查。 */
  courseSessionId?: string | null;
  roomId?: string | null;
}

export type ClassroomParticipantRole = 'teacher' | 'student' | 'admin';

export interface JoinAuthorization {
  ok: true;
  courseSession: CourseSession;
  /** 伺服器決定的 LiveKit room 名稱。 */
  roomName: string;
  participantRole: ClassroomParticipantRole;
  /** 顯示在教室 UI 的名字。 */
  displayName: string;
  /** 這個 Token 應該在什麼時候失效（Unix 秒）。 */
  tokenExpiresAt: number;
}

export type JoinDenialReason =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CANCELLED'
  | 'SESSION_COMPLETED'
  | 'TOO_EARLY'
  | 'TOO_LATE'
  | 'NOT_TEACHER_OF_SESSION'
  | 'NOT_ENROLLED'
  | 'ENROLLED_IN_OTHER_SESSION'
  | 'BAD_REQUEST';

export interface JoinDenial {
  ok: false;
  reason: JoinDenialReason;
  message: string;
  /** 建議的 HTTP status，route / lambda 直接沿用。 */
  httpStatus: 400 | 403 | 404;
  /** 讓前端可以倒數「還有幾分鐘開放」。 */
  opensAt?: string;
}

export type JoinDecision = JoinAuthorization | JoinDenial;

export interface AuthorizeJoinOptions {
  /** 開課前幾分鐘可進入（預設 15）。 */
  earlyJoinMinutes: number;
  /** 下課後幾分鐘內仍可重連（預設 30）。 */
  graceMinutes: number;
  /** Token 最長存活秒數（預設 3h），避免 endTime 資料錯誤時簽出超長 token。 */
  maxTokenTtlSec: number;
  /** 測試注入用；預設 Date.now()。 */
  now?: () => number;
}

// ─── 工具 ────────────────────────────────────────────────────────────────────

const deny = (
  reason: JoinDenialReason,
  message: string,
  httpStatus: JoinDenial['httpStatus'],
  extra?: Partial<JoinDenial>
): JoinDenial => ({ ok: false, reason, message, httpStatus, ...extra });

function parseIso(value: string | undefined | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Room 名稱只允許 LiveKit 安全字元；session id 是 UUID 所以天生合法。 */
export function defaultRoomName(courseSessionId: string): string {
  return `cs_${courseSessionId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

async function resolveDisplayName(
  requester: JoinRequester,
  fallbackRole: ClassroomParticipantRole
): Promise<string> {
  try {
    const p: any = await getProfileById(requester.userId);
    const full = [p?.lastName, p?.firstName].filter(Boolean).join('');
    const name = p?.displayName || full || p?.name;
    if (name) return String(name);
  } catch {
    // profile 讀取失敗不影響授權，只是名字退回 email / 角色
  }
  if (requester.email) return requester.email.split('@')[0];
  if (fallbackRole === 'teacher') return 'Teacher';
  if (fallbackRole === 'admin') return 'Admin';
  return 'Student';
}

/**
 * 與 lib/auth/courseOwnership.ts 的判斷一致：
 * 老師身分可能以 session.userId / profile.teacherId / profile.roid_id / profile.id 任一標記。
 */
async function isTeacherOfSession(requester: JoinRequester, session: CourseSession): Promise<boolean> {
  if (!session.teacherId) return false;
  const candidates = new Set<string>([requester.userId]);
  try {
    const p: any = await getProfileById(requester.userId);
    if (p?.teacherId) candidates.add(String(p.teacherId));
    if (p?.roid_id) candidates.add(String(p.roid_id));
    if (p?.id) candidates.add(String(p.id));
  } catch {
    // 只用 userId 比對
  }
  return candidates.has(String(session.teacherId));
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

export async function authorizeJoin(
  requester: JoinRequester,
  request: JoinRequest,
  options: AuthorizeJoinOptions
): Promise<JoinDecision> {
  const now = options.now ? options.now() : Date.now();

  // 1. 找出這場課 ------------------------------------------------------------
  const sessionId = request.courseSessionId?.trim();
  const roomId = request.roomId?.trim();
  if (!sessionId && !roomId) {
    return deny('BAD_REQUEST', 'courseSessionId or roomId is required', 400);
  }

  let session: CourseSession | null = null;
  try {
    session = sessionId ? await getCourseSession(sessionId) : await findSessionByRoomId(roomId!);
  } catch (err) {
    console.error('[livekit/authorize] DynamoDB lookup failed', err);
    throw err; // 基礎設施錯誤交給上層回 5xx，不要偽裝成 403
  }
  if (!session) {
    return deny('SESSION_NOT_FOUND', 'Course session not found', 404);
  }

  // 2. 狀態檢查 ------------------------------------------------------------
  if (session.status === 'CANCELLED') {
    return deny('SESSION_CANCELLED', 'This class has been cancelled', 403);
  }
  if (session.status === 'COMPLETED') {
    return deny('SESSION_COMPLETED', 'This class has already ended', 403);
  }

  // 3. 角色判定（先判角色，管理員可以跳過時間窗）-------------------------------
  const isAdmin = requester.role === 'admin' || requester.role === 'system';
  let participantRole: ClassroomParticipantRole;

  if (isAdmin) {
    participantRole = 'admin';
  } else if (requester.role === 'teacher') {
    if (!(await isTeacherOfSession(requester, session))) {
      return deny('NOT_TEACHER_OF_SESSION', 'You are not the teacher of this class', 403);
    }
    participantRole = 'teacher';
  } else {
    // B2C：自行購買的報名紀錄。B2B_SEAT 報名列（app/api/enroll/seat 寫入）在
    // findPurchasedEnrollment 裡被略過 —— 席次的存取權只看授權（license），
    // 否則撤銷授權後那筆報名列仍會永久放行。
    const enrollment = await findPurchasedEnrollment(requester.userId, session.courseId);
    if (enrollment) {
      // 報名紀錄若指定了梯次，就必須是同一梯次；舊資料（null）視為相容放行。
      if (enrollment.courseSessionId && enrollment.courseSessionId !== session.id) {
        return deny(
          'ENROLLED_IN_OTHER_SESSION',
          'Your enrollment belongs to a different session of this course',
          403
        );
      }
    } else {
      // B2B：沒有購買紀錄時，改用與 verifyCourseAccess 相同的席次授權判斷。
      // 席次授權涵蓋整門課（或整個組織），沒有梯次限制，授權有效即放行。
      const seat = await findValidSeatLicense(requester.userId, session.courseId);
      if (!seat) {
        return deny('NOT_ENROLLED', 'You are not enrolled in this course', 403);
      }
    }
    participantRole = 'student';
  }

  // 4. 時間窗檢查 ------------------------------------------------------------
  const startMs = parseIso(session.startTime);
  const endMs = parseIso(session.endTime);
  if (startMs === null || endMs === null) {
    console.error('[livekit/authorize] session has invalid startTime/endTime', session.id);
    return deny('BAD_REQUEST', 'Course session has an invalid schedule', 400);
  }
  const opensAtMs = startMs - options.earlyJoinMinutes * 60_000;
  const closesAtMs = endMs + options.graceMinutes * 60_000;

  if (!isAdmin) {
    if (now < opensAtMs) {
      return deny(
        'TOO_EARLY',
        `Classroom opens ${options.earlyJoinMinutes} minutes before the scheduled start`,
        403,
        { opensAt: new Date(opensAtMs).toISOString() }
      );
    }
    if (now > closesAtMs) {
      return deny('TOO_LATE', 'The join window for this class has closed', 403);
    }
  }

  // 5. Room 名稱：伺服器決定，並回寫 DynamoDB 供 Webhook 反查 ------------------
  let roomName = session.roomId || '';
  if (!roomName) {
    roomName = defaultRoomName(session.id);
    try {
      await setSessionRoom(session.id, roomName);
      session = { ...session, roomId: roomName };
    } catch (err) {
      // 回寫失敗不阻擋上課；Phase 4 webhook 會靠 cs_ 前綴 fallback 反推 session id
      console.warn('[livekit/authorize] failed to persist roomId', session.id, err);
    }
  }

  // 6. Token 有效期：到下課 + 緩衝為止，但不超過 maxTokenTtlSec -------------------
  const remainingSec = Math.floor((closesAtMs - now) / 1000);
  const ttlSec = Math.max(60, Math.min(options.maxTokenTtlSec, remainingSec));
  const tokenExpiresAt = Math.floor(now / 1000) + ttlSec;

  const displayName = await resolveDisplayName(requester, participantRole);

  return {
    ok: true,
    courseSession: session,
    roomName,
    participantRole,
    displayName,
    tokenExpiresAt,
  };
}
