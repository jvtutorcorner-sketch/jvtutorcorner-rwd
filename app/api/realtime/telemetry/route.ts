// app/api/realtime/telemetry/route.ts
//
// POST /api/realtime/telemetry
// Body: { events: Array<{ event, at?, courseSessionId?, level?, data? }> }
//
// Client-side connection telemetry for the non-Agora RTC paths (SFU media + whiteboard
// DataChannel). Before this, every join/pull/heartbeat/ICE failure was a console.warn on
// the user's machine — there was no way to answer "how many classes failed to connect
// last week, and on which networks". Events land in keyLog (category 'classroom', TTL'd,
// queryable via the existing admin log API). Accepts a small batch; over-large or
// malformed batches are truncated/skipped rather than erroring, since this must never
// disrupt a call and is often sent via sendBeacon during teardown.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { keyLog, type KeyLogLevel } from '@/lib/keyLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_EVENTS = 20;
const KNOWN_EVENTS = new Set([
  'join_ok',
  'join_fail',
  'ice_state',
  'ice_restart',
  'ice_degraded',
  'rejoin',
  'track_repull',
  'heartbeat_fail',
  'quality_step',
  'fallback_agora',
  'net_probe',
  'session_summary',
]);

function levelFor(event: string, explicit?: unknown): KeyLogLevel {
  if (explicit === 'INFO' || explicit === 'WARN' || explicit === 'ERROR' || explicit === 'CRITICAL') return explicit;
  if (event === 'join_fail' || event === 'fallback_agora') return 'ERROR';
  if (event.endsWith('_fail') || event === 'ice_degraded' || event === 'rejoin') return 'WARN';
  return 'INFO';
}

/** Flatten arbitrary client data into the scalar-only metadata keyLog accepts. */
function toMetadata(data: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v == null) out[k] = null;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = String(v).slice(0, 200);
    if (Object.keys(out).length >= 15) break;
  }
  return out;
}

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'BAD_REQUEST' }, { status: 400 });
  }

  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  let accepted = 0;

  await Promise.all(
    events.map(async (e: any) => {
      const event = typeof e?.event === 'string' ? e.event : null;
      if (!event || !KNOWN_EVENTS.has(event)) return;
      accepted += 1;
      const meta = toMetadata(e?.data);
      const level = levelFor(event, e?.level);
      const sink = level === 'ERROR' || level === 'CRITICAL' ? keyLog.error : level === 'WARN' ? keyLog.warn : keyLog.info;
      await sink({
        category: 'classroom',
        action: `rtc_${event}`,
        summary: `RTC ${event}${meta?.transport ? ` via ${meta.transport}` : ''}`,
        userId: req.session.userId,
        entityId: typeof e?.courseSessionId === 'string' ? e.courseSessionId : undefined,
        entityType: 'courseSession',
        source: '/api/realtime/telemetry',
        metadata: meta,
      }).catch(() => {});
    })
  );

  return NextResponse.json({ ok: true, accepted });
});
