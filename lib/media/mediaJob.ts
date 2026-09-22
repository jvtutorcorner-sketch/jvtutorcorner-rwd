// lib/media/mediaJob.ts
//
// GPU media job lifecycle (Phase 5), mirroring pointsEscrow's reserve→settle/refund:
//   submitJob    reserve points (ai_reserve, −) + create job QUEUED
//   markRunning  QUEUED → RUNNING
//   settleJobSuccess  QUEUED|RUNNING → SUCCEEDED  (+platform ai_charge, +cost meter)
//   refundJob         QUEUED|RUNNING → FAILED|EXPIRED  (+student ai_refund/reserve_expired)
//   sweepExpired  refund every open job past its reservation deadline
//
// Idempotency/concurrency: applyPointsDelta is keyed per (job,phase); the guarded
// gpu-jobs status flip (flipStatus) is the single-writer gate so settle and refund
// can race and exactly one wins. Server-only.

import { randomUUID } from 'crypto';
import { applyPointsDelta } from '@/lib/pointsStorage';
import { recordUsage } from '@/lib/ai/gateway/ledger';
import type { PointBucket } from '@/lib/pointsLedger';
import { quotePrice, featureForWorkflow, RESERVATION_TTL_MS, type MediaWorkflow } from './mediaPricing';
import { createJobRow, getJob, flipStatus, listExpiring, type GpuJob } from './gpuJobStore';

const PLATFORM_ACCOUNT = process.env.PLATFORM_REVENUE_ACCOUNT_ID;

export interface SubmitJobInput {
  userId: string;
  workflow: MediaWorkflow;
  provider?: string;
  inputRef?: string;
  bucket?: PointBucket;
  courseId?: string;
  sessionId?: string;
  teacherId?: string;
  orgId?: string;
}

export type SubmitJobResult =
  | { ok: true; job: GpuJob }
  | { ok: false; error: 'insufficient' | 'job_create_failed'; currentBalance?: number };

export async function submitJob(input: SubmitJobInput): Promise<SubmitJobResult> {
  const price = quotePrice(input.workflow);
  const jobId = randomUUID();
  const bucket = input.bucket ?? 'general';

  // 1. Reserve (deduct) — overdraft-guarded + idempotent by key.
  const reserve = await applyPointsDelta({
    userId: input.userId,
    amount: -price,
    type: 'ai_reserve',
    bucket,
    refType: 'reservation',
    refId: jobId,
    idempotencyKey: `gpu:${jobId}:reserve`,
  });
  if (!reserve.ok) return { ok: false, error: 'insufficient', currentBalance: reserve.currentBalance };

  // 2. Create the job row.
  const now = new Date();
  const job: GpuJob = {
    jobId,
    userId: input.userId,
    status: 'QUEUED',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
    updatedAt: now.toISOString(),
    workflow: input.workflow,
    feature: featureForWorkflow(input.workflow),
    bucket,
    reservedCredits: price,
    quotedPrice: price,
    provider: input.provider ?? 'stub',
    attempts: 0,
    settlementToken: randomUUID(),
    ...(input.inputRef ? { inputRef: input.inputRef } : {}),
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.teacherId ? { teacherId: input.teacherId } : {}),
    ...(input.orgId ? { meta: { orgId: input.orgId } } : {}),
  };
  try {
    await createJobRow(job);
  } catch (err) {
    // The reserve succeeded but the row didn't land — refund so points aren't stuck.
    await applyPointsDelta({
      userId: input.userId,
      amount: price,
      type: 'ai_refund',
      bucket,
      refType: 'reservation',
      refId: jobId,
      idempotencyKey: `gpu:${jobId}:refund`,
    }).catch(() => {});
    console.error('[mediaJob] job row create failed, refunded reservation', err);
    return { ok: false, error: 'job_create_failed' };
  }
  return { ok: true, job };
}

export async function markRunning(jobId: string, providerJobId?: string): Promise<GpuJob | null> {
  return flipStatus(jobId, ['QUEUED'], 'RUNNING', providerJobId ? { providerJobId } : {});
}

export interface SettleInput {
  actualCostMusd?: number;
  gpuSeconds?: number;
  outputKey?: string;
}

export async function settleJobSuccess(jobId: string, result: SettleInput = {}): Promise<{ ok: boolean; job?: GpuJob }> {
  const job = await getJob(jobId);
  if (!job) return { ok: false };
  const flipped = await flipStatus(jobId, ['QUEUED', 'RUNNING'], 'SUCCEEDED', {
    outputKey: result.outputKey,
    actualCostMusd: result.actualCostMusd,
    gpuSeconds: result.gpuSeconds,
  });
  if (!flipped) {
    // Already terminal — idempotent success only if it's already SUCCEEDED.
    const cur = await getJob(jobId);
    return { ok: cur?.status === 'SUCCEEDED', job: cur ?? undefined };
  }

  // Platform earns the reserved price (the student was already debited at reserve).
  if (PLATFORM_ACCOUNT) {
    await applyPointsDelta({
      userId: PLATFORM_ACCOUNT,
      amount: job.reservedCredits,
      type: 'ai_charge',
      bucket: 'general',
      refType: 'reservation',
      refId: jobId,
      idempotencyKey: `gpu:${jobId}:settle`,
    }).catch((e) => console.warn('[mediaJob] platform settle leg failed (non-fatal)', e));
  }
  // Cost meter for margin monitoring (idempotent on requestId).
  try {
    await recordUsage({
      requestId: `gpu:${jobId}`,
      costCenter: 'ai',
      actualCostMusd: result.actualCostMusd ?? 0,
      feature: job.feature,
      provider: job.provider,
      userId: job.userId,
      courseId: job.courseId,
      sessionId: job.sessionId,
      teacherId: job.teacherId,
      gpuSeconds: result.gpuSeconds,
      status: 'ok',
      meta: { workflow: job.workflow },
    });
  } catch (e) {
    console.warn('[mediaJob] cost meter failed (non-fatal)', e);
  }
  return { ok: true, job: flipped };
}

export async function refundJob(
  jobId: string,
  opts: { expired?: boolean; reason?: string } = {}
): Promise<{ ok: boolean; job?: GpuJob }> {
  const job = await getJob(jobId);
  if (!job) return { ok: false };
  const to = opts.expired ? 'EXPIRED' : 'FAILED';
  const flipped = await flipStatus(jobId, ['QUEUED', 'RUNNING'], to, opts.reason ? { error: opts.reason } : {});
  if (!flipped) {
    const cur = await getJob(jobId);
    return { ok: cur?.status === to, job: cur ?? undefined };
  }
  await applyPointsDelta({
    userId: job.userId,
    amount: job.reservedCredits,
    type: opts.expired ? 'reserve_expired' : 'ai_refund',
    bucket: job.bucket,
    refType: 'reservation',
    refId: jobId,
    idempotencyKey: `gpu:${jobId}:refund`,
  }).catch((e) => console.warn('[mediaJob] refund leg failed', e));
  return { ok: true, job: flipped };
}

export async function sweepExpired(nowIso = new Date().toISOString(), limit = 25): Promise<{ swept: number }> {
  const jobs = await listExpiring(nowIso, limit);
  let swept = 0;
  for (const j of jobs) {
    const r = await refundJob(j.jobId, { expired: true, reason: 'reservation expired' });
    if (r.ok) swept++;
  }
  return { swept };
}
