// app/api/realtime/session/route.ts
//
// POST /api/realtime/session
// Body: { roomId?: string; courseSessionId?: string }
//
// 進教室的第一步（NEXT_PUBLIC_RTC_PROVIDER=cloudflare-sfu）：
//   withAuth → authorizeJoin（與 LiveKit 共用：課程 session、老師身分、學生報名、時間窗）
//   → SFU sessions/new → 登錄 session 歸屬 → 出席紀錄 join（伺服器時間）→ 產生 TURN 憑證
//
// 回應：
//   200 { ok, sessionId, courseSessionId, identity, role, iceServers, expiresAt, heartbeatIntervalSec }
//   400 / 403 / 404 { ok: false, reason, message, opensAt? }
//   502 { ok: false, reason: 'SFU_ERROR' }
//   503 { ok: false, reason: 'REALTIME_NOT_CONFIGURED' }

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { authorizeJoin } from '@/lib/livekit/authorizeJoin';
import { markSessionStarted, recordPresenceEvent } from '@/lib/courseSessionService';
import { getRealtimeConfig, RealtimeConfigError } from '@/lib/realtime/config';
import { sfuApi, SfuApiError } from '@/lib/realtime/sfuApi';
import { fetchIceServers } from '@/lib/realtime/ice';
import { identityFor, registerSfuSession } from '@/lib/realtime/registry';
import { isValidSfuSessionId } from '@/lib/realtime/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ICE credentials are minted short-lived and refreshed on reconnect via
// GET /api/realtime/ice — not once for the whole (up to 3h) session, so an ICE
// restart on a long class never runs with expired TURN credentials.
const ICE_TTL_SEC = 600;

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST', message: 'Body must be JSON' }, { status: 400 });
  }

  let cfg;
  try {
    cfg = getRealtimeConfig();
  } catch (err) {
    if (err instanceof RealtimeConfigError) {
      console.error('[realtime/session]', err.message);
      return NextResponse.json(
        { ok: false, reason: 'REALTIME_NOT_CONFIGURED', message: 'Video service is not configured' },
        { status: 503 }
      );
    }
    throw err;
  }

  const requester = { userId: req.session.userId, email: req.session.email, role: req.session.role };

  try {
    const decision = await authorizeJoin(
      requester,
      { courseSessionId: asOptionalString(body.courseSessionId), roomId: asOptionalString(body.roomId) },
      { earlyJoinMinutes: cfg.earlyJoinMinutes, graceMinutes: cfg.graceMinutes, maxTokenTtlSec: cfg.maxTokenTtlSec }
    );

    if (!decision.ok) {
      console.info('[realtime/session] denied', { userId: requester.userId, role: requester.role, reason: decision.reason });
      return NextResponse.json(
        {
          ok: false,
          reason: decision.reason,
          message: decision.message,
          ...(decision.opensAt ? { opensAt: decision.opensAt } : {}),
        },
        { status: decision.httpStatus }
      );
    }

    const courseSession = decision.courseSession;
    const role = decision.participantRole;
    const identity = identityFor(role, requester.userId);

    const { sessionId } = await sfuApi.newSession(cfg);
    if (!isValidSfuSessionId(sessionId)) {
      throw new SfuApiError('SFU returned an unexpected sessionId', 502, { sessionId });
    }

    const nowIso = new Date().toISOString();
    await registerSfuSession(courseSession.id, sessionId, {
      identity,
      userId: requester.userId,
      role,
      joinedAt: nowIso,
      lastSeenAt: nowIso,
      tracks: {},
    });

    // 出席紀錄：與 LiveKit webhook 同一格式，將來的結算可直接重用 computeDurations。
    // event id 以 SFU session 為基礎，天生冪等。
    await recordPresenceEvent(courseSession.id, `sfu_${sessionId}_join`, { identity, role, kind: 'join', at: nowIso });

    // 老師或學生進場才算開課；觀察者（admin）進來不改變課程狀態。
    if (role !== 'admin') {
      await markSessionStarted(courseSession.id, decision.roomName).catch((err) =>
        console.warn('[realtime/session] markSessionStarted failed', courseSession.id, err)
      );
    }

    const { iceServers, degraded } = await fetchIceServers(cfg, ICE_TTL_SEC);
    if (degraded) console.warn('[realtime/session] ICE degraded to STUN-only', { courseSessionId: courseSession.id });

    console.info('[realtime/session] joined', { userId: requester.userId, role, courseSessionId: courseSession.id });

    return NextResponse.json({
      ok: true,
      sessionId,
      courseSessionId: courseSession.id,
      identity,
      role,
      iceServers,
      iceDegraded: degraded,
      iceTtlSec: ICE_TTL_SEC,
      expiresAt: decision.tokenExpiresAt,
      heartbeatIntervalSec: cfg.heartbeatIntervalSec,
    });
  } catch (err) {
    if (err instanceof SfuApiError) {
      console.error('[realtime/session] SFU error', err.status, err.body);
      return NextResponse.json({ ok: false, reason: 'SFU_ERROR', message: 'Video service error' }, { status: 502 });
    }
    console.error('[realtime/session] unexpected error', err);
    return NextResponse.json({ ok: false, reason: 'INTERNAL', message: 'Failed to open media session' }, { status: 500 });
  }
});
