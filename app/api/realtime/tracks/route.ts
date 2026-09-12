// app/api/realtime/tracks/route.ts
//
// POST /api/realtime/tracks   推（local）或拉（remote）軌道
//   Body: { courseSessionId, sessionId, sessionDescription?, tracks: [...] }
// PUT  /api/realtime/tracks   關閉軌道
//   Body: { courseSessionId, sessionId, tracks: [{ mid }], sessionDescription?, force? }
//
// 授權：sessionId 必須是呼叫者在這堂課建立的（resolveBoundSession）；
// 拉軌道時來源 session 必須是同一堂課目前在場的其他參與者（sanitizeTracksRequest）。
// 只轉送白名單欄位給 SFU。

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getRealtimeConfig, RealtimeConfigError, type RealtimeConfig } from '@/lib/realtime/config';
import { sfuApi, SfuApiError } from '@/lib/realtime/sfuApi';
import { resolveBoundSession } from '@/lib/realtime/guard';
import { activeParticipants, setSfuTracks, touchSfuSession } from '@/lib/realtime/registry';
import { sanitizeCloseRequest, sanitizeTracksRequest } from '@/lib/realtime/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Handler = (req: AuthedRequest, cfg: RealtimeConfig, body: Record<string, unknown>) => Promise<Response>;

function withRealtime(handler: Handler) {
  return withAuth(async (req: AuthedRequest) => {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, reason: 'BAD_REQUEST', message: 'Body must be JSON' }, { status: 400 });
    }
    let cfg: RealtimeConfig;
    try {
      cfg = getRealtimeConfig();
    } catch (err) {
      if (err instanceof RealtimeConfigError) {
        return NextResponse.json({ ok: false, reason: 'REALTIME_NOT_CONFIGURED' }, { status: 503 });
      }
      throw err;
    }
    try {
      return await handler(req, cfg, body);
    } catch (err) {
      if (err instanceof SfuApiError) {
        console.error('[realtime/tracks] SFU error', err.status, err.body);
        return NextResponse.json({ ok: false, reason: 'SFU_ERROR', message: 'Video service error' }, { status: 502 });
      }
      console.error('[realtime/tracks] unexpected error', err);
      return NextResponse.json({ ok: false, reason: 'INTERNAL' }, { status: 500 });
    }
  });
}

export const POST = withRealtime(async (req, cfg, body) => {
  const bound = await resolveBoundSession(body.courseSessionId, body.sessionId, req.session.userId, {
    graceMinutes: cfg.graceMinutes,
  });
  if (!bound.ok) {
    return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
  }

  const ownSessionId = body.sessionId as string;
  const remoteSessions: Record<string, string[]> = {};
  for (const p of activeParticipants(bound.courseSession, {
    excludeUserId: req.session.userId,
    nowMs: Date.now(),
    heartbeatTimeoutSec: cfg.heartbeatTimeoutSec,
  })) {
    remoteSessions[p.sessionId] = p.tracks;
  }

  const parsed = sanitizeTracksRequest(body, {
    ownSessionId,
    remoteSessions,
    canPublish: bound.entry.role !== 'admin',
  });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST', message: parsed.message }, { status: 400 });
  }

  const res = await sfuApi.newTracks(cfg, ownSessionId, {
    ...(parsed.value.sessionDescription ? { sessionDescription: parsed.value.sessionDescription } : {}),
    tracks: parsed.value.tracks,
  });

  if (parsed.value.kind === 'local') {
    // 只登錄 SFU 回報成功的軌道，對方才不會去拉一條不存在的軌道
    const failed = new Set(
      (res.tracks || []).filter((t) => t.errorCode).map((t) => t.trackName)
    );
    const published = parsed.value.localTrackNames.filter((n) => !failed.has(n));
    await setSfuTracks(bound.courseSession.id, ownSessionId, published);
  } else {
    await touchSfuSession(bound.courseSession.id, ownSessionId);
  }

  return NextResponse.json({ ok: true, ...res });
});

export const PUT = withRealtime(async (req, cfg, body) => {
  const bound = await resolveBoundSession(body.courseSessionId, body.sessionId, req.session.userId, {
    graceMinutes: cfg.graceMinutes,
    allowLeft: true, // 離開後仍允許關閉自己的軌道
  });
  if (!bound.ok) {
    return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
  }

  const parsed = sanitizeCloseRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST', message: parsed.message }, { status: 400 });
  }

  const res = await sfuApi.closeTracks(cfg, body.sessionId as string, parsed.value);
  return NextResponse.json({ ok: true, ...res });
});
