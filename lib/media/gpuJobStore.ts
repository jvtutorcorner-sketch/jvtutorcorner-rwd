// lib/media/gpuJobStore.ts
//
// DynamoDB access for Phase 5 GPU media jobs. Server-only.
//   gpu-jobs  PK jobId; GSI byUser (userId,createdAt); byStatus (status,expiresAt)
//
// The guarded status flip (flipStatus) is the concurrency + idempotency gate for
// the reserve→settle/refund lifecycle, mirroring pointsEscrow.settleEscrow.

import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import type { MediaWorkflow, MediaFeatureId } from './mediaPricing';
import type { PointBucket } from '@/lib/pointsLedger';

export const GPU_JOBS_TABLE = process.env.DYNAMODB_TABLE_GPU_JOBS || 'jvtutorcorner-gpu-jobs';

export type GpuJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface GpuJob {
  jobId: string;
  userId: string;
  status: GpuJobStatus;
  createdAt: string;
  expiresAt: string; // reservation deadline (byStatus range key; always set)
  updatedAt: string;
  workflow: MediaWorkflow;
  feature: MediaFeatureId;
  bucket: PointBucket;
  reservedCredits: number;
  quotedPrice: number;
  provider: string;
  providerJobId?: string;
  courseId?: string;
  sessionId?: string;
  teacherId?: string;
  inputRef?: string;
  outputKey?: string;
  actualCostMusd?: number;
  gpuSeconds?: number;
  attempts: number;
  error?: string;
  settlementToken: string; // proves "this settle/refund was mine" on a lost race
  meta?: Record<string, unknown>;
}

export async function createJobRow(job: GpuJob): Promise<void> {
  await ddbDocClient.send(
    new PutCommand({
      TableName: GPU_JOBS_TABLE,
      Item: job,
      ConditionExpression: 'attribute_not_exists(jobId)',
    })
  );
}

export async function getJob(jobId: string): Promise<GpuJob | null> {
  if (!jobId) return null;
  const res = await ddbDocClient.send(new GetCommand({ TableName: GPU_JOBS_TABLE, Key: { jobId } }));
  return (res.Item as GpuJob) || null;
}

export async function listJobsByUser(userId: string, limit = 50): Promise<GpuJob[]> {
  if (!userId) return [];
  const res = await ddbDocClient.send(
    new QueryCommand({
      TableName: GPU_JOBS_TABLE,
      IndexName: 'byUser',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
      ScanIndexForward: false, // newest first
      Limit: limit,
    })
  );
  return (res.Items || []) as GpuJob[];
}

/** Open jobs (QUEUED/RUNNING) whose reservation deadline has passed — sweeper input. */
export async function listExpiring(nowIso: string, limit = 25): Promise<GpuJob[]> {
  const out: GpuJob[] = [];
  for (const status of ['QUEUED', 'RUNNING'] as const) {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: GPU_JOBS_TABLE,
        IndexName: 'byStatus',
        KeyConditionExpression: '#s = :st AND expiresAt < :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':st': status, ':now': nowIso },
        Limit: limit,
      })
    );
    out.push(...((res.Items || []) as GpuJob[]));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/**
 * Guarded status transition. Succeeds only from one of `from` — that condition is
 * the single-writer/idempotency gate. Returns the updated row, or null when the
 * condition fails (already in another state).
 */
export async function flipStatus(
  jobId: string,
  from: GpuJobStatus[],
  to: GpuJobStatus,
  patch: Partial<Pick<GpuJob, 'providerJobId' | 'outputKey' | 'actualCostMusd' | 'gpuSeconds' | 'error'>> = {}
): Promise<GpuJob | null> {
  const now = new Date().toISOString();
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':to': to, ':now': now };
  const sets = ['#s = :to', 'updatedAt = :now'];
  from.forEach((f, i) => (values[`:f${i}`] = f));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  const fromCond = from.map((_, i) => `#s = :f${i}`).join(' OR ');
  try {
    const res = await ddbDocClient.send(
      new UpdateCommand({
        TableName: GPU_JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: `attribute_exists(jobId) AND (${fromCond})`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return (res.Attributes as GpuJob) || null;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}
