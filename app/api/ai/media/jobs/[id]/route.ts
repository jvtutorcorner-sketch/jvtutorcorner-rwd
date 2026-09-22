// GET /api/ai/media/jobs/[id] — job status + output. Owner or admin only.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getJob } from '@/lib/media/gpuJobStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  const isAdmin = req.session.role === 'admin' || req.session.role === 'system';
  if (job.userId !== req.session.userId && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, job });
}

export const GET = withAuth(handleGet);
