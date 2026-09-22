// POST /api/cron/media-sweeper   (EventBridge every ~5 min; Bearer CRON_SECRET)
//
// Refunds GPU media reservations whose deadline has passed but which never settled
// (a lost webhook / crashed worker), so points are never stuck. Mirrors the
// class-summaries cron auth.

import { NextRequest, NextResponse } from 'next/server';
import { sweepExpired } from '@/lib/media/mediaJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && (auth === `Bearer ${secret}` || req.headers.get('x-cron-token') === secret)) return true;
  if (!secret) return process.env.NODE_ENV !== 'production'; // dev convenience, mirrors daily-report
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const result = await sweepExpired();
  return NextResponse.json({ ok: true, ...result });
}
