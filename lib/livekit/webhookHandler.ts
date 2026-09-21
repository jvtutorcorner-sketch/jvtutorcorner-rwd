// lib/livekit/webhookHandler.ts
//
// Phase 4：接收並處理 LiveKit webhook 事件，把「實際上課 / 下課時間」寫回 DynamoDB，
// 作為教師薪資結算與學生點數釋放的事實依據。
//
// 為什麼時長要以 webhook 為準：LiveKit server 送出的事件帶的是 server 端時間戳，
// 前端無法竄改；而前端自報的上下課時間可能因分頁關閉、當機、時鐘不準而失真。
//
// 設計原則：
//   * 冪等：LiveKit 是 at-least-once 投遞。markSessionStarted/Completed 皆為條件式
//     單寫入，presenceLog 以事件 uuid 為 key，releaseEscrow 只動 HOLDING —— 事件重送
//     不會重複計算或重複付款。
//   * 不信任 client：房間 → 課程的對應一律由 DynamoDB 反查（findSessionByRoomId，
//     或 cs_<id> 前綴 fallback），不看 webhook 內的 metadata 決定要付誰錢。
//   * 保守結算：room_finished 時，只有「老師實際在場且師生同時在場達門檻」才釋放
//     escrow。老師沒到 / 課太短 → escrow 維持 HOLDING 交人工判斷，絕不自動付款，
//     也不自動退款（退款是 admin 決策）。
//
// 這個模組不碰 HTTP，Next.js route 與獨立 Lambda 共用。簽章驗證見 verifyWebhook()。

import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { getLiveKitConfig } from './config';
import { parseIdentity } from './token';
import {
  findSessionByRoomId,
  getCourseSession,
  markSessionStarted,
  markSessionCompleted,
  recordPresenceEvent,
  setSessionRoomSid,
  saveSessionSettlement,
  type SessionDurations,
} from '@/lib/courseSessionService';
import { listEnrollmentsByCourse } from '@/lib/enrollmentService';
import { getEscrowByOrder, releaseEscrow } from '@/lib/pointsEscrow';
import type { CourseSession } from '@/lib/types/courseSession';

// ── 簽章驗證 ──────────────────────────────────────────────────────────────────

let receiver: WebhookReceiver | null = null;
function getReceiver(): WebhookReceiver {
  if (!receiver) {
    const cfg = getLiveKitConfig();
    receiver = new WebhookReceiver(cfg.apiKey, cfg.apiSecret);
  }
  return receiver;
}

/**
 * 驗證 webhook 簽章並解析事件。
 * body 必須是「原始字串」（不可先 JSON.parse），簽章是對 raw body 算的。
 */
export async function verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent> {
  const cfg = getLiveKitConfig();
  return getReceiver().receive(rawBody, authHeader, false, cfg.webhookClockToleranceSec);
}

// ── 結果型別 ──────────────────────────────────────────────────────────────────

export interface WebhookHandleResult {
  handled: boolean;
  event: string;
  sessionId?: string;
  action?: string;
  detail?: Record<string, unknown>;
}

// ── 事件時間工具 ──────────────────────────────────────────────────────────────

/** WebhookEvent.createdAt 是「秒」的 bigint；轉成 ISO 字串。缺值時退回現在時間。 */
function eventTimeIso(ev: WebhookEvent): string {
  const sec = ev.createdAt ? Number(ev.createdAt) : NaN;
  const ms = Number.isFinite(sec) && sec > 0 ? sec * 1000 : Date.now();
  return new Date(ms).toISOString();
}

// ── 課程對應：房間名 → course session ─────────────────────────────────────────

async function resolveSession(roomName: string | undefined): Promise<CourseSession | null> {
  if (!roomName) return null;
  // 1. 先用 roomId GSI 反查
  const byRoom = await findSessionByRoomId(roomName);
  if (byRoom) return byRoom;
  // 2. fallback：token route 產生的預設房名是 cs_<sessionId>
  if (roomName.startsWith('cs_')) {
    const sessionId = roomName.slice(3);
    return getCourseSession(sessionId);
  }
  return null;
}

// ── 主分派 ────────────────────────────────────────────────────────────────────

export async function handleWebhookEvent(ev: WebhookEvent): Promise<WebhookHandleResult> {
  const event = ev.event;
  const roomName = ev.room?.name;

  const session = await resolveSession(roomName);
  if (!session) {
    // 房間對不到任何 course session（例如測試房、已刪除的課）→ 回 200 但不動作，
    // 讓 LiveKit 不要一直重送。
    console.info('[livekit/webhook] no session for room', roomName, 'event', event);
    return { handled: false, event };
  }

  switch (event) {
    case 'room_started': {
      if (ev.room?.sid) await setSessionRoomSid(session.id, ev.room.sid);
      const r = await markSessionStarted(session.id, roomName);
      return {
        handled: true,
        event,
        sessionId: session.id,
        action: r.ok ? 'session_started' : 'session_start_noop',
        detail: r.ok ? undefined : { reason: r.error },
      };
    }

    case 'participant_joined':
    case 'participant_left': {
      const identity = ev.participant?.identity;
      const parsed = identity ? parseIdentity(identity) : null;
      if (!identity || !parsed) {
        return { handled: false, event, sessionId: session.id, detail: { reason: 'unparseable identity', identity } };
      }
      const kind = event === 'participant_joined' ? 'join' : 'leave';
      await recordPresenceEvent(session.id, ev.id, {
        identity,
        role: parsed.role,
        kind,
        at: eventTimeIso(ev),
      });
      return { handled: true, event, sessionId: session.id, action: `presence_${kind}`, detail: { role: parsed.role } };
    }

    case 'room_finished': {
      // 1. 標記完成（冪等；第二次會因條件失敗回 not-ok，但仍往下做結算，
      //    靠 releaseEscrow 的 HOLDING 條件保證不重複付款）。
      const completed = await markSessionCompleted(session.id);

      // 2. 讀最新 session（含完整 presenceLog）重新計算，避免用到過期快照。
      const fresh = (await getCourseSession(session.id)) || session;
      const durations = computeDurations(fresh, eventTimeIso(ev));

      // 3. 保守結算 escrow。
      const settlement = await settleEscrow(fresh, durations);

      await saveSessionSettlement(session.id, durations, settlement);

      return {
        handled: true,
        event,
        sessionId: session.id,
        action: completed.ok ? 'session_completed' : 'session_completed_retry',
        detail: {
          durations,
          released: settlement.released.length,
          skipped: settlement.skipped.length,
        },
      };
    }

    default:
      // track_published / egress_* 等目前不處理
      return { handled: false, event, sessionId: session.id };
  }
}

// ── 時長計算 ──────────────────────────────────────────────────────────────────

interface Interval {
  start: number;
  end: number;
}

/** 把重疊 / 相鄰的區間合併成聯集，回傳排序後不重疊的區間。 */
function unionIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

function totalSec(intervals: Interval[]): number {
  return Math.round(intervals.reduce((s, i) => s + (i.end - i.start), 0) / 1000);
}

/** 兩組聯集區間的交集總長（毫秒區間 → 秒）。 */
function intersectionSec(a: Interval[], b: Interval[]): number {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) out.push({ start, end });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return totalSec(out);
}

/**
 * 從 presenceLog 把每個角色的 join/leave 配對成在場區間。
 * 沒有對應 leave 的 join（例如當機、或到 room_finished 仍在線）→ 收在 roomEndMs。
 */
function presenceIntervals(
  session: CourseSession,
  role: 'teacher' | 'student',
  roomEndMs: number
): Interval[] {
  const log = session.presenceLog || {};
  const events = Object.values(log)
    .filter((e) => e.role === role)
    .map((e) => ({ ...e, ms: Date.parse(e.at) }))
    .filter((e) => Number.isFinite(e.ms))
    .sort((a, b) => a.ms - b.ms);

  const intervals: Interval[] = [];
  // 以「在場人數」計數，支援同角色多裝置 / 重連（identity 去重後仍以事件配對）。
  const openStack: Record<string, number> = {};
  let openStart: number | null = null;
  let openCount = 0;

  for (const e of events) {
    const before = openCount;
    if (e.kind === 'join') {
      openStack[e.identity] = (openStack[e.identity] || 0) + 1;
      openCount++;
    } else {
      if (openStack[e.identity]) {
        openStack[e.identity]--;
        openCount = Math.max(0, openCount - 1);
      }
    }
    if (before === 0 && openCount > 0) openStart = e.ms;
    if (before > 0 && openCount === 0 && openStart !== null) {
      intervals.push({ start: openStart, end: e.ms });
      openStart = null;
    }
  }
  // 還開著的區間收在房間結束時間
  if (openCount > 0 && openStart !== null) {
    intervals.push({ start: openStart, end: roomEndMs });
  }
  return unionIntervals(intervals);
}

export function computeDurations(session: CourseSession, roomEndIso: string): SessionDurations {
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const endMs = Date.parse(roomEndIso);
  const actualDurationSec =
    Number.isFinite(startedMs) && Number.isFinite(endMs) && endMs > startedMs
      ? Math.round((endMs - startedMs) / 1000)
      : 0;

  const roomEndMs = Number.isFinite(endMs) ? endMs : Date.now();
  const teacher = presenceIntervals(session, 'teacher', roomEndMs);
  const student = presenceIntervals(session, 'student', roomEndMs);

  return {
    actualDurationSec,
    teacherPresenceSec: totalSec(teacher),
    studentPresenceSec: totalSec(student),
    billableSec: intersectionSec(teacher, student),
  };
}

// ── Escrow 結算 ───────────────────────────────────────────────────────────────

async function settleEscrow(
  session: CourseSession,
  durations: SessionDurations
): Promise<NonNullable<CourseSession['escrowSettlement']>> {
  const cfg = getLiveKitConfig();
  const at = new Date().toISOString();
  const released: Array<{ orderId: string; escrowId: string; points: number }> = [];
  const skipped: Array<{ orderId: string; reason: string }> = [];

  // 品質門檻：老師要實際在場，且師生同時在場達最低時數，才付款。
  const qualifies =
    durations.teacherPresenceSec >= cfg.minTeacherPresenceSec &&
    durations.billableSec >= cfg.minBillableSec;

  // 找出這場課「本梯次」的有效報名（舊資料無梯次 → 併入）。
  const enrollments = (
    await listEnrollmentsByCourse(session.courseId, { statuses: ['PAID', 'ACTIVE'] })
  ).filter((e) => !e.courseSessionId || e.courseSessionId === session.id);

  for (const enr of enrollments) {
    const orderId = enr.orderId || undefined;
    if (!orderId) {
      skipped.push({ orderId: enr.id, reason: 'enrollment has no orderId' });
      continue;
    }
    if (!qualifies) {
      skipped.push({
        orderId,
        reason: `below threshold (teacher=${durations.teacherPresenceSec}s billable=${durations.billableSec}s)`,
      });
      continue;
    }
    try {
      const escrow = await getEscrowByOrder(orderId);
      if (!escrow) {
        skipped.push({ orderId, reason: 'no escrow for order' });
        continue;
      }
      if (escrow.status !== 'HOLDING') {
        skipped.push({ orderId, reason: `escrow already ${escrow.status}` });
        continue;
      }
      const r = await releaseEscrow(escrow.escrowId);
      if (r.ok) {
        released.push({ orderId, escrowId: escrow.escrowId, points: escrow.points });
      } else {
        skipped.push({ orderId, reason: r.error });
      }
    } catch (err: any) {
      console.error('[livekit/webhook] settleEscrow error for order', orderId, err);
      skipped.push({ orderId, reason: err?.message || 'settlement error' });
    }
  }

  console.info('[livekit/webhook] settlement', {
    sessionId: session.id,
    qualifies,
    released: released.length,
    skipped: skipped.length,
  });

  return { at, released, skipped };
}
