// lib/realtime/guard.ts
//
// 除了建立 session 那一次要跑完整的 authorizeJoin，其餘請求（推／拉軌道、重新協商、心跳）
// 只需要確認「這個 SFU session 是這位登入者在這堂課裡建立的」——綁定是在 authorizeJoin
// 通過之後才寫入的，所以綁定成立就代表當初的授權成立。這樣心跳每 15 秒一次也不必重查
// 報名與老師身分。

import { getCourseSession } from '@/lib/courseSessionService';
import type { CourseSession } from '@/lib/types/courseSession';
import { isValidCourseSessionId, isValidSfuSessionId } from './validate';
import type { SfuSessionEntry } from './participants';

export type BoundSession =
  | { ok: true; courseSession: CourseSession; entry: SfuSessionEntry }
  | { ok: false; status: 400 | 403 | 404; reason: string; message: string };

export async function resolveBoundSession(
  courseSessionId: unknown,
  sfuSessionId: unknown,
  userId: string,
  opts: { graceMinutes: number; allowLeft?: boolean; nowMs?: number }
): Promise<BoundSession> {
  if (!isValidCourseSessionId(courseSessionId) || !isValidSfuSessionId(sfuSessionId)) {
    return { ok: false, status: 400, reason: 'BAD_REQUEST', message: 'courseSessionId and sessionId are required' };
  }

  const courseSession = await getCourseSession(courseSessionId);
  if (!courseSession) {
    return { ok: false, status: 404, reason: 'SESSION_NOT_FOUND', message: 'Course session not found' };
  }
  if (courseSession.status === 'CANCELLED' || courseSession.status === 'COMPLETED') {
    return { ok: false, status: 403, reason: `SESSION_${courseSession.status}`, message: 'This class is not open' };
  }

  const entry = courseSession.sfuSessions?.[sfuSessionId];
  if (!entry) {
    return { ok: false, status: 404, reason: 'SFU_SESSION_NOT_FOUND', message: 'Media session not found' };
  }
  if (entry.userId !== userId) {
    return { ok: false, status: 403, reason: 'NOT_SESSION_OWNER', message: 'This media session belongs to someone else' };
  }
  if (entry.leftAt && !opts.allowLeft) {
    return { ok: false, status: 403, reason: 'SFU_SESSION_CLOSED', message: 'This media session has ended' };
  }

  // 綁定在時間窗內建立，但連線可能拖過下課 + 緩衝；超過就不再允許新的媒體操作。
  const endMs = Date.parse(courseSession.endTime);
  const nowMs = opts.nowMs ?? Date.now();
  if (entry.role !== 'admin' && Number.isFinite(endMs) && nowMs > endMs + opts.graceMinutes * 60_000) {
    return { ok: false, status: 403, reason: 'TOO_LATE', message: 'The join window for this class has closed' };
  }

  return { ok: true, courseSession, entry };
}
