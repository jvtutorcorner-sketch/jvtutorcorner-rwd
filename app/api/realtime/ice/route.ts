// app/api/realtime/ice/route.ts
//
// GET /api/realtime/ice?courseSessionId=&sessionId=
//
// Fresh short-lived ICE credentials for an *existing* SFU session, so an ICE restart
// on a long class doesn't run with the expired credentials minted at join time. Guarded
// by the same session-binding check as tracks/renegotiate — only the participant who
// created this SFU session may refresh its ICE.
//
// Response: 200 { ok, iceServers, degraded, ttlSec } | 400/403/404 | 503

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getRealtimeConfig, RealtimeConfigError } from '@/lib/realtime/config';
import { resolveBoundSession } from '@/lib/realtime/guard';
import { fetchIceServers } from '@/lib/realtime/ice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ICE_TTL_SEC = 600;

export const GET = withAuth(async (req: AuthedRequest) => {
  let cfg;
  try {
    cfg = getRealtimeConfig();
  } catch (err) {
    if (err instanceof RealtimeConfigError) {
      return NextResponse.json({ ok: false, reason: 'REALTIME_NOT_CONFIGURED' }, { status: 503 });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const bound = await resolveBoundSession(
    searchParams.get('courseSessionId'),
    searchParams.get('sessionId'),
    req.session.userId,
    { graceMinutes: cfg.graceMinutes }
  );
  if (!bound.ok) {
    return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
  }

  const { iceServers, degraded } = await fetchIceServers(cfg, ICE_TTL_SEC);
  return NextResponse.json({ ok: true, iceServers, degraded, ttlSec: ICE_TTL_SEC });
});
