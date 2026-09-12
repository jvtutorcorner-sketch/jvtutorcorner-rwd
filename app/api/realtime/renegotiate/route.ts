// app/api/realtime/renegotiate/route.ts
//
// PUT /api/realtime/renegotiate
// Body: { courseSessionId, sessionId, sessionDescription: { type: 'answer', sdp } }
//
// 拉軌道時 SFU 會回一個 offer（requiresImmediateRenegotiation），瀏覽器產生 answer 後經這裡送回。

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getRealtimeConfig, RealtimeConfigError } from '@/lib/realtime/config';
import { sfuApi, SfuApiError } from '@/lib/realtime/sfuApi';
import { resolveBoundSession } from '@/lib/realtime/guard';
import { parseSessionDescription } from '@/lib/realtime/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = withAuth(async (req: AuthedRequest) => {
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
      return NextResponse.json({ ok: false, reason: 'REALTIME_NOT_CONFIGURED' }, { status: 503 });
    }
    throw err;
  }

  try {
    const bound = await resolveBoundSession(body.courseSessionId, body.sessionId, req.session.userId, {
      graceMinutes: cfg.graceMinutes,
    });
    if (!bound.ok) {
      return NextResponse.json({ ok: false, reason: bound.reason, message: bound.message }, { status: bound.status });
    }

    const sd = parseSessionDescription(body.sessionDescription, 'answer');
    if (!sd.ok || !sd.value) {
      return NextResponse.json(
        { ok: false, reason: 'BAD_REQUEST', message: sd.ok ? 'sessionDescription is required' : sd.message },
        { status: 400 }
      );
    }

    const res = await sfuApi.renegotiate(cfg, body.sessionId as string, { sessionDescription: sd.value });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err instanceof SfuApiError) {
      console.error('[realtime/renegotiate] SFU error', err.status, err.body);
      return NextResponse.json({ ok: false, reason: 'SFU_ERROR', message: 'Video service error' }, { status: 502 });
    }
    console.error('[realtime/renegotiate] unexpected error', err);
    return NextResponse.json({ ok: false, reason: 'INTERNAL' }, { status: 500 });
  }
});
