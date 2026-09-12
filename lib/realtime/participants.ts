// lib/realtime/participants.ts
//
// 房間登錄的純函式：只有型別匯入、不碰資料庫與網路，可以單獨測試
// （見 scripts/verify-realtime-sfu-guards.mjs）。讀寫資料庫的部分在 registry.ts。

import type { CourseSession } from '@/lib/types/courseSession';

export type SfuSessionEntry = NonNullable<CourseSession['sfuSessions']>[string];
export type SfuParticipantRole = SfuSessionEntry['role'];

/** 與 LiveKit 相同的身分格式（lib/livekit/token.ts 的 buildIdentity），出席紀錄可共用。 */
export function identityFor(role: SfuParticipantRole, userId: string): string {
  return `${role}:${userId}`;
}

export interface ActiveParticipant {
  sessionId: string;
  identity: string;
  role: SfuParticipantRole;
  tracks: string[];
  joinedAt: string;
}

/**
 * 目前在場、別人看得到的參與者。
 *
 * - 排除已離開、心跳逾時、觀察者（admin 對其他人隱藏，與 LiveKit 的 hidden 一致）
 * - 排除呼叫者自己（依 userId，連同他重新整理前留下的舊 session）
 * - 同一個身分有多個 session 時只留最新加入的那個——重新整理頁面後，舊 session 在逾時前
 *   仍會留在登錄裡；若兩個都列出，ClientClassroom 會拿到兩個相同的 uid（它的 React key）。
 */
export function activeParticipants(
  session: Pick<CourseSession, 'sfuSessions'>,
  opts: { excludeUserId?: string; nowMs: number; heartbeatTimeoutSec: number }
): ActiveParticipant[] {
  const byIdentity = new Map<string, ActiveParticipant>();

  for (const [sessionId, e] of Object.entries(session.sfuSessions || {})) {
    if (!e || e.leftAt) continue;
    if (e.role === 'admin') continue;
    if (opts.excludeUserId && e.userId === opts.excludeUserId) continue;
    const lastSeen = Date.parse(e.lastSeenAt || e.joinedAt);
    if (!Number.isFinite(lastSeen) || opts.nowMs - lastSeen > opts.heartbeatTimeoutSec * 1000) continue;

    const candidate: ActiveParticipant = {
      sessionId,
      identity: e.identity,
      role: e.role,
      tracks: Object.keys(e.tracks || {}).sort(),
      joinedAt: e.joinedAt,
    };
    const existing = byIdentity.get(e.identity);
    if (!existing || Date.parse(existing.joinedAt) < Date.parse(candidate.joinedAt)) {
      byIdentity.set(e.identity, candidate);
    }
  }

  return [...byIdentity.values()].sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
}
