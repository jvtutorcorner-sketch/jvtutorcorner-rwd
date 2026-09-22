// POST /api/webhooks/runpod?jobId=<jobId>
//
// GPU provider completion webhook for the async RunPod path (Phase 5). Gated: it
// only acts when RUNPOD_WEBHOOK_SECRET is set (RunPod is not wired in this build,
// so it is unset → 501). Settles/refunds the job by its status. The stub provider
// completes synchronously and never calls this.
//
// Body: { status: 'succeeded'|'failed'|'running', outputKey?, actualCostMusd?, gpuSeconds?, error? }

import { NextResponse } from 'next/server';
import { markRunning, settleJobSuccess, refundJob } from '@/lib/media/mediaJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.RUNPOD_WEBHOOK_SECRET;
  if (!secret) {
    // RunPod integration is gated; nothing should call this yet.
    return NextResponse.json({ ok: false, error: 'RunPod webhook not configured' }, { status: 501 });
  }
  if (req.headers.get('x-webhook-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get('jobId') || '';
  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId is required' }, { status: 400 });

  let body: { status?: unknown; outputKey?: unknown; actualCostMusd?: unknown; gpuSeconds?: unknown; error?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  switch (body.status) {
    case 'succeeded': {
      const s = await settleJobSuccess(jobId, { outputKey: str(body.outputKey), actualCostMusd: num(body.actualCostMusd), gpuSeconds: num(body.gpuSeconds) });
      return NextResponse.json({ ok: s.ok, status: s.job?.status });
    }
    case 'failed': {
      const r = await refundJob(jobId, { reason: str(body.error) || 'provider reported failure' });
      return NextResponse.json({ ok: r.ok, status: r.job?.status });
    }
    case 'running': {
      await markRunning(jobId).catch(() => {});
      return NextResponse.json({ ok: true, status: 'RUNNING' });
    }
    default:
      return NextResponse.json({ ok: false, error: 'Unknown status' }, { status: 400 });
  }
}
