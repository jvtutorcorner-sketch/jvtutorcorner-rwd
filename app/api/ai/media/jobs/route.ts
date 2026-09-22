// POST /api/ai/media/jobs
//
// Submit an AI media generation job (Phase 5). Reserves points, creates a gpu-jobs
// row, dispatches to the media provider (stub by default; RunPod gated). On a
// synchronous provider success it settles inline; on failure it refunds; an async
// provider leaves the job RUNNING for the webhook to finish. Entitlement-gated
// (ai_image/ai_video/ai_voice/ai_digital_human — default OFF) + rate limited +
// metered. Body: { workflow, inputRef?, courseId?, sessionId?, bucket? }.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveFeature } from '@/lib/ai/entitlements';
import { checkRateLimit, rateLimitResponse, RATE_LIMIT_RULES } from '@/lib/rateLimit';
import { isMediaWorkflow, featureForWorkflow } from '@/lib/media/mediaPricing';
import { submitJob, markRunning, settleJobSuccess, refundJob } from '@/lib/media/mediaJob';
import { getMediaProvider } from '@/lib/media/providers';
import type { PointBucket } from '@/lib/pointsLedger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(req: AuthedRequest) {
  let body: { workflow?: unknown; inputRef?: unknown; courseId?: unknown; sessionId?: unknown; bucket?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isMediaWorkflow(body.workflow)) {
    return NextResponse.json({ ok: false, error: 'Unknown media workflow' }, { status: 400 });
  }
  const workflow = body.workflow;

  const rl = await checkRateLimit(RATE_LIMIT_RULES.mediaSubmitPerUser, req.session.userId);
  if (!rl.allowed) return rateLimitResponse(rl);

  const ent = await resolveFeature(featureForWorkflow(workflow), {
    userId: req.session.userId,
    planId: req.session.plan,
    courseId: typeof body.courseId === 'string' ? body.courseId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
  });
  if (!ent.enabled) {
    return NextResponse.json({ ok: false, error: '此媒體功能未開放', reason: ent.reason }, { status: 403 });
  }

  const bucket = (body.bucket === 'media_grant' ? 'media_grant' : 'general') as PointBucket;
  const submit = await submitJob({
    userId: req.session.userId,
    workflow,
    provider: getMediaProvider().name,
    inputRef: typeof body.inputRef === 'string' ? body.inputRef : undefined,
    courseId: typeof body.courseId === 'string' ? body.courseId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    bucket,
  });
  if (!submit.ok) {
    if (submit.error === 'insufficient') {
      return NextResponse.json({ ok: false, error: '點數不足', currentBalance: submit.currentBalance }, { status: 402 });
    }
    return NextResponse.json({ ok: false, error: '無法建立任務,請稍後再試' }, { status: 500 });
  }

  const job = submit.job;
  const provider = getMediaProvider();
  const origin = new URL(req.url).origin;
  try {
    const r = await provider.submit({
      jobId: job.jobId,
      workflow,
      inputRef: job.inputRef,
      webhookUrl: `${origin}/api/webhooks/runpod?jobId=${encodeURIComponent(job.jobId)}`,
    });
    if (r.status === 'succeeded') {
      await markRunning(job.jobId, r.providerJobId).catch(() => {});
      const s = await settleJobSuccess(job.jobId, { actualCostMusd: r.actualCostMusd, gpuSeconds: r.gpuSeconds, outputKey: r.outputKey });
      return NextResponse.json({ ok: true, job: s.job ?? job });
    }
    if (r.status === 'failed') {
      await refundJob(job.jobId, { reason: r.error || 'provider failed' });
      return NextResponse.json({ ok: false, error: '生成失敗,已退回點數', jobId: job.jobId }, { status: 502 });
    }
    // queued (async) → wait for the webhook
    const running = await markRunning(job.jobId, r.providerJobId);
    return NextResponse.json({ ok: true, job: running ?? job });
  } catch (err) {
    await refundJob(job.jobId, { reason: 'provider error' });
    console.error('[media/jobs] provider submit failed, refunded', err);
    return NextResponse.json({ ok: false, error: '生成服務暫時無法使用,已退回點數', jobId: job.jobId }, { status: 502 });
  }
}

export const POST = withAuth(handlePost);
