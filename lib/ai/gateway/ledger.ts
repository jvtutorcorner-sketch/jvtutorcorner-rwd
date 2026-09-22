// lib/ai/gateway/ledger.ts
//
// AI / RTC usage cost meter. recordUsage() appends one immutable ledger row and
// atomically bumps the pre-aggregated cost-rollups counters for every scope the
// request belongs to (lesson, tenant-month, teacher, course, student, feature,
// global) in ONE DynamoDB transaction, so dashboards and per-lesson budget
// checks read a single rollup item instead of scanning the ledger.
//
// Amounts are integer MICRO-USD (1 USD = 1_000_000) to avoid float drift.
// No consumers yet: the AI Gateway (Phase 2) and the RTC cost meter (Phase 1)
// call this. Kept dependency-light and offline-testable.

import { TransactWriteCommand, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const AI_USAGE_TABLE =
  process.env.DYNAMODB_TABLE_AI_USAGE_LEDGER || 'jvtutorcorner-ai-usage-ledger';
export const COST_ROLLUPS_TABLE =
  process.env.DYNAMODB_TABLE_COST_ROLLUPS || 'jvtutorcorner-cost-rollups';

const useDynamo =
  process.env.NODE_ENV === 'production' ||
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);

export type CostCenter = 'platform' | 'ai';

export interface UsageEntry {
  requestId: string; // globally unique; dedupes a retried record
  costCenter: CostCenter;
  actualCostMusd: number; // integer micro-USD actually incurred
  estimatedCostMusd?: number;
  feature?: string;
  model?: string;
  provider?: string;
  // dimensions
  orgId?: string;
  userId?: string;
  teacherId?: string;
  courseId?: string;
  sessionId?: string;
  segmentId?: string;
  tenantMonth?: string; // `${orgId}#yyyymm`
  // measures (all optional; stored as given)
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  gpuType?: string;
  gpuSeconds?: number;
  imageCount?: number;
  videoSeconds?: number;
  rtcParticipantMinutes?: number;
  rtcGb?: number;
  creditsConsumed?: number;
  status?: string;
  meta?: Record<string, string | number | boolean | null>;
}

// In-memory fallback (dev / offline tests without fake DDB)
export const LOCAL_USAGE: Record<string, unknown>[] = [];
export const LOCAL_ROLLUPS: Record<string, Record<string, number>> = {};

/** Scope keys a usage entry rolls up into. Pure. */
export function rollupScopeKeys(e: UsageEntry, yyyymm: string): string[] {
  const keys: string[] = [`GLOBAL#${yyyymm}`, `FEATURE#${e.feature ?? 'unknown'}#${yyyymm}`];
  if (e.sessionId) keys.push(`LESSON#${e.sessionId}`);
  if (e.orgId) keys.push(`TENANT#${e.orgId}#${yyyymm}`);
  if (e.teacherId) keys.push(`TEACHER#${e.teacherId}#${yyyymm}`);
  if (e.courseId) keys.push(`COURSE#${e.courseId}#${yyyymm}`);
  if (e.userId) keys.push(`STUDENT#${e.userId}#${yyyymm}`);
  return keys;
}

function buildLedgerItem(e: UsageEntry, createdAt: string) {
  const date = createdAt.slice(0, 10);
  const item: Record<string, unknown> = {
    pk: date,
    sk: e.requestId, // deterministic → attribute_not_exists dedupes a retry
    requestId: e.requestId,
    costCenter: e.costCenter,
    actualCostMusd: Math.round(e.actualCostMusd),
    createdAt,
  };
  const copy: (keyof UsageEntry)[] = [
    'estimatedCostMusd', 'feature', 'model', 'provider', 'orgId', 'userId', 'teacherId',
    'courseId', 'sessionId', 'segmentId', 'tenantMonth', 'inputTokens', 'outputTokens',
    'reasoningTokens', 'gpuType', 'gpuSeconds', 'imageCount', 'videoSeconds',
    'rtcParticipantMinutes', 'rtcGb', 'creditsConsumed', 'status', 'meta',
  ];
  for (const k of copy) if (e[k] !== undefined) item[k] = e[k];
  // GSI keys must be present (non-null) to index; omit otherwise.
  if (e.sessionId) item.sessionId = e.sessionId;
  if (e.userId) item.userId = e.userId;
  if (e.tenantMonth) item.tenantMonth = e.tenantMonth;
  return item;
}

/**
 * Record one usage event: ledger row + rollup counters, atomically.
 * Idempotent on requestId. Returns { ok, duplicate }.
 */
export async function recordUsage(e: UsageEntry): Promise<{ ok: boolean; duplicate: boolean; error?: string }> {
  const createdAt = new Date().toISOString();
  const yyyymm = createdAt.slice(0, 7).replace('-', '');
  const cost = Math.round(e.actualCostMusd);
  const centerAttr = e.costCenter === 'ai' ? 'ai_musd' : 'platform_musd';
  const scopeKeys = rollupScopeKeys(e, yyyymm);
  const ledgerItem = buildLedgerItem(e, createdAt);

  if (useDynamo) {
    const items: object[] = [
      {
        Put: {
          TableName: AI_USAGE_TABLE,
          Item: ledgerItem,
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      ...scopeKeys.map((scopeKey) => ({
        Update: {
          TableName: COST_ROLLUPS_TABLE,
          Key: { scopeKey },
          UpdateExpression: 'ADD #tot :c, #center :c, #req :one SET updatedAt = :at',
          ExpressionAttributeNames: { '#tot': 'total_musd', '#center': centerAttr, '#req': 'requests' },
          ExpressionAttributeValues: { ':c': cost, ':one': 1, ':at': createdAt },
        },
      })),
    ];
    try {
      await ddbDocClient.send(new TransactWriteCommand({ TransactItems: items }));
      return { ok: true, duplicate: false };
    } catch (err) {
      const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> })?.CancellationReasons;
      if ((err as { name?: string })?.name === 'TransactionCanceledException' && reasons?.[0]?.Code === 'ConditionalCheckFailed') {
        return { ok: true, duplicate: true }; // requestId already recorded
      }
      return { ok: false, duplicate: false, error: (err as Error)?.message };
    }
  }

  // In-memory (dev)
  if (LOCAL_USAGE.some((r) => r.requestId === e.requestId)) return { ok: true, duplicate: true };
  LOCAL_USAGE.push(ledgerItem);
  for (const scopeKey of scopeKeys) {
    const r = (LOCAL_ROLLUPS[scopeKey] ??= { total_musd: 0, ai_musd: 0, platform_musd: 0, requests: 0 });
    r.total_musd += cost;
    r[centerAttr] += cost;
    r.requests += 1;
  }
  return { ok: true, duplicate: false };
}

/**
 * All usage-ledger rows for one tenant-month (byTenantMonth GSI) — the detailed
 * source for a tenant cost report / CSV export. `tenantMonth` = `${orgId}#yyyymm`.
 */
export async function queryTenantMonthUsage(orgId: string, yyyymm: string): Promise<Record<string, unknown>[]> {
  if (!orgId) return [];
  const tenantMonth = `${orgId}#${yyyymm}`;
  if (!useDynamo) return LOCAL_USAGE.filter((r) => r.tenantMonth === tenantMonth);
  const out: Record<string, unknown>[] = [];
  let esk: Record<string, unknown> | undefined;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        TableName: AI_USAGE_TABLE,
        IndexName: 'byTenantMonth',
        KeyConditionExpression: 'tenantMonth = :tm',
        ExpressionAttributeValues: { ':tm': tenantMonth },
        ExclusiveStartKey: esk,
      })
    );
    out.push(...((res.Items || []) as Record<string, unknown>[]));
    esk = res.LastEvaluatedKey;
  } while (esk);
  return out;
}

/** Read a rollup scope (dashboard / budget check). */
export async function getRollup(scopeKey: string): Promise<Record<string, number> | null> {
  if (useDynamo) {
    const res = await ddbDocClient.send(new GetCommand({ TableName: COST_ROLLUPS_TABLE, Key: { scopeKey } }));
    return (res.Item as Record<string, number>) ?? null;
  }
  return LOCAL_ROLLUPS[scopeKey] ?? null;
}

// Re-exported so callers/tests can seed without importing the SDK directly.
export const _sdk = { TransactWriteCommand, UpdateCommand, PutCommand, GetCommand };
