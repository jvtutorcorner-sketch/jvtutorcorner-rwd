// /api/lessons/[sessionId]/events
//   POST  — batch-report system events (whiteboard/timer/screenshare/tick).
//   GET ?since=<sk> — poll new events (Timeline live, Phase 3b Copilot).
//
// Any authorised participant may report system events; both tracks' events feed
// the Segmenter. Zero AI cost.

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveLessonContext } from '@/lib/lessonAI/lessonContext';
import { appendLessonEvents, listLessonEvents } from '@/lib/lessonAI/lessonStore';
import { isSystemEventType, type LessonEvent } from '@/lib/lessonAI/eventTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 100;

async function handlePost(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  let body: { events?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = Array.isArray(body.events) ? body.events : [];
  if (raw.length === 0) return NextResponse.json({ ok: false, error: 'events[] is required' }, { status: 400 });
  if (raw.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: `Too many events (max ${MAX_BATCH})` }, { status: 400 });
  }

  const startMs = Date.parse(lc.courseSession.startedAt || lc.courseSession.startTime) || Date.now();
  const track: LessonEvent['track'] = lc.access.isHost ? 'teacher' : 'student';
  const actorRole: LessonEvent['actorRole'] = lc.access.isHost ? 'teacher' : 'student';

  const events: LessonEvent[] = [];
  for (const e of raw as Array<Record<string, unknown>>) {
    if (!isSystemEventType(e.type)) continue; // silently drop unknown types
    const clientTs =
      typeof e.clientTs === 'number' && Number.isFinite(e.clientTs) ? e.clientTs : Date.now();
    const offsetSec =
      typeof e.offsetSec === 'number' && Number.isFinite(e.offsetSec)
        ? Math.max(0, Math.round(e.offsetSec))
        : Math.max(0, Math.round((clientTs - startMs) / 1000));
    events.push({
      eventId: typeof e.eventId === 'string' && e.eventId ? e.eventId : randomUUID(),
      source: 'system',
      type: e.type,
      offsetSec,
      ts: clientTs,
      confidence: 1,
      actorRole,
      track,
      payload: e.payload && typeof e.payload === 'object' ? (e.payload as Record<string, unknown>) : undefined,
    });
  }
  if (events.length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid system events' }, { status: 400 });
  }

  const stored = await appendLessonEvents(sessionId, events, {
    courseId: lc.courseSession.courseId,
    createdBy: req.session.userId,
  });
  return NextResponse.json({ ok: true, count: stored.length });
}

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const lc = await resolveLessonContext(req.session, sessionId);
  if (!lc.ok) return NextResponse.json({ ok: false, error: lc.error }, { status: lc.status });

  const url = new URL(req.url);
  const since = url.searchParams.get('since') || undefined;
  const events = await listLessonEvents(sessionId, { sinceSk: since, limit: 500 });
  const cursor = events.length ? events[events.length - 1].sk : since ?? null;
  return NextResponse.json({ ok: true, events, cursor });
}

export const POST = withAuth(handlePost);
export const GET = withAuth(handleGet);
