// GET /api/ai/features/resolve?featureId=&courseId=&sessionId=&teacherId=&orgId=
// Returns the resolved entitlement for the current user + context, so the UI can
// show "why unavailable / how many points / remaining". Server-authoritative.
import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveFeature, type EntitlementContext } from '@/lib/ai/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest) {
  const url = new URL(req.url);
  const featureId = url.searchParams.get('featureId');
  if (!featureId) return NextResponse.json({ ok: false, error: 'featureId required' }, { status: 400 });

  const ctx: EntitlementContext = {
    userId: req.session.userId,
    planId: req.session.plan,
    orgId: url.searchParams.get('orgId') || undefined,
    teacherId: url.searchParams.get('teacherId') || undefined,
    courseId: url.searchParams.get('courseId') || undefined,
    sessionId: url.searchParams.get('sessionId') || undefined,
  };
  try {
    const entitlement = await resolveFeature(featureId, ctx);
    return NextResponse.json({ ok: true, entitlement });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'resolve failed' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);
