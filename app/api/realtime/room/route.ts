// app/api/realtime/room/route.ts
//
// GET  /api/realtime/room?courseSessionId=&sessionId=
//   目前在場、可以拉的其他參與者：[{ sessionId, identity, role, tracks, joinedAt }]
//   前端每 3 秒輪詢一次；只讀，不寫資料庫。
//
// POST /api/realtime/room
//   Body: { courseSessionId, sessionId, leaving?: boolean }
//   心跳（每 15 秒）或明確離開。離開時寫 leftAt 與出席紀錄 leave（伺服器時間）。
//   沒有明確離開（關分頁、斷網）的人，由 lastSeenAt 逾時推論——結算時以最後心跳為準。

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { recordPresenceEvent } from '@/lib/courseSessionService';
import { getRealtimeConfig, RealtimeConfigError } from '@/lib/realtime/config';
import { resolveBoundSession } from '@/lib/realtime/guard';
import { activeParticipants, markSfuSessionLeft, touchSfuSession } from '@/lib/realtime/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function configOr503() {
  try {
    return { cfg: getRealtimeConfig(), error: null as Response | null };
  } catch (err) {
    if (err instanceof RealtimeConfigError) {
      return { cfg: null, error: NextResponse.json({ ok: false, reason: 'REALTIME_NOT_CONFIGURED' }, { status: 503 }) };
    }
    throw err;
  }
}

export const GET = withAuth(async (req: AuthedRequest) => {
  const { cfg, error } = configOr503();
  if (!cfg) return error!;

  const url = new URL(req.url);
  try {
    const bound = await resolveBoundSession(
      url.searchParams.get('courseSessionId'),
      url.searchParams.get('sessionId'),
      req.session.userId,
      { graceMinutes: cfg.graceMinutes }
    );
    if (!bound.ok) {
      return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
    }

    const participants = activeParticipants(bound.courseSession, {
      excludeUserId: req.session.userId,
      nowMs: Date.now(),
      heartbeatTimeoutSec: cfg.heartbeatTimeoutSec,
    });
    return NextResponse.json(
      { ok: true, participants },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[realtime/room] GET failed', err);
    return NextResponse.json({ ok: false, reason: 'INTERNAL' }, { status: 500 });
  }
});

export const POST = withAuth(async (req: AuthedRequest) => {
  const { cfg, error } = configOr503();
  if (!cfg) return error!;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST', message: 'Body must be JSON' }, { status: 400 });
  }
  const leaving = body.leaving === true;

  try {
    const bound = await resolveBoundSession(body.courseSessionId, body.sessionId, req.session.userId, {
      graceMinutes: cfg.graceMinutes,
      allowLeft: leaving, // 重複送出「離開」要冪等
    });
    if (!bound.ok) {
      return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
    }

    const courseSessionId = bound.courseSession.id;
    const sfuSessionId = body.sessionId as string;

    if (leaving) {
      if (!bound.entry.leftAt) {
        const at = await markSfuSessionLeft(courseSessionId, sfuSessionId);
        await recordPresenceEvent(courseSessionId, `sfu_${sfuSessionId}_leave`, {
          identity: bound.entry.identity,
          role: bound.entry.role,
          kind: 'leave',
          at,
        });
      }
      return NextResponse.json({ ok: true, left: true });
    }

    await touchSfuSession(courseSessionId, sfuSessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[realtime/room] POST failed', err);
    return NextResponse.json({ ok: false, reason: 'INTERNAL' }, { status: 500 });
  }
});
