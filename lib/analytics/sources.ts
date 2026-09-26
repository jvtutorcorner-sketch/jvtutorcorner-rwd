// lib/analytics/sources.ts
//
// Loaders for the analytics reports. Each returns rows plus a status so the
// report can tell "no data" from "could not read the data":
//   ok          — read from DynamoDB
//   memory      — dev / offline in-memory rows (not persisted)
//   unavailable — the read failed; `hint` names the likely cause
// A failed loader never returns partial rows.

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { AI_USAGE_TABLE, LOCAL_USAGE } from '@/lib/ai/gateway/ledger';
import { listSessionsByStatus } from '@/lib/courseSessionService';
import { queryEventsForDay, listManualMetric, storeMode, type ManualMetric } from './eventStore';
import { currentAppEnv, type AnalyticsEvent } from './events';
import { MANUAL_DEFS } from './kpiCatalog';
import type { LedgerRow, Loaded, SessionRow, SrcStatus } from './types';

/** Abort a report that would pull more rows than this (switch to rollups instead). */
export const MAX_REPORT_ROWS = 200_000;
const CONCURRENCY = 6;

/** Same rule as lib/ai/gateway/ledger.ts: DynamoDB in production or when credentials exist. */
function ledgerUsesDynamo(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID)
  );
}

export function describeError(err: unknown): SrcStatus {
  const e = err as { name?: string; message?: string };
  const name = e?.name || '';
  const message = e?.message || String(err);
  let hint = message;
  if (name === 'CredentialsProviderError' || /credential/i.test(message)) {
    hint = 'P-1:伺服器沒有 AWS 憑證(Amplify computeRoleArn 未設定)';
  } else if (name === 'ResourceNotFoundException') {
    hint = 'P-2:資料表尚未建立(執行 setup-db)';
  } else if (name === 'AccessDeniedException') {
    hint = 'IAM 權限不足,無法讀取此資料表';
  } else if (name === 'TooManyRows') {
    hint = `資料量超過 ${MAX_REPORT_ROWS.toLocaleString()} 列,請縮短期間或改用 rollup`;
  }
  return { status: 'unavailable', hint, error: `${name}: ${message}`.slice(0, 300) };
}

/** Run `fn` over items with a small concurrency pool, stopping at the first error. */
async function mapPool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let total = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      total += Array.isArray(out[i]) ? (out[i] as unknown[]).length : 0;
      if (total > MAX_REPORT_ROWS) throw Object.assign(new Error('too many rows'), { name: 'TooManyRows' });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

async function queryLedgerDay(day: string): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  let esk: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: AI_USAGE_TABLE,
        KeyConditionExpression: 'pk = :d',
        ExpressionAttributeValues: { ':d': day },
        // Aliased: some attribute names may be DynamoDB reserved words.
        ProjectionExpression: '#f, #c, #s, #u, #t, #cc',
        ExpressionAttributeNames: {
          '#f': 'feature',
          '#c': 'actualCostMusd',
          '#s': 'sessionId',
          '#u': 'userId',
          '#t': 'createdAt',
          '#cc': 'costCenter',
        },
        ExclusiveStartKey: esk,
      })
    );
    rows.push(...((res.Items || []) as LedgerRow[]));
    esk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (esk);
  return rows;
}

/** AI usage-ledger rows for the given UTC days (ledger pk = `yyyy-mm-dd`). */
export async function loadLedger(days: string[]): Promise<Loaded<LedgerRow>> {
  if (!ledgerUsesDynamo()) {
    const set = new Set(days);
    const rows = (LOCAL_USAGE as LedgerRow[]).filter((r) => set.has(String(r.createdAt || '').slice(0, 10)));
    return { src: { status: 'memory', rows: rows.length }, rows };
  }
  try {
    const rows = (await mapPool(days, queryLedgerDay)).flat();
    return { src: { status: 'ok', rows: rows.length }, rows };
  } catch (err) {
    return { src: describeError(err), rows: [] };
  }
}

/**
 * Analytics events for the given UTC days. In a production deployment only
 * production events count; developer traffic written from `next dev` against
 * the same table is dropped.
 */
export async function loadEvents(days: string[]): Promise<Loaded<AnalyticsEvent>> {
  const mode = storeMode();
  try {
    let rows = (await mapPool(days, queryEventsForDay)).flat();
    if (currentAppEnv() === 'production') rows = rows.filter((e) => e.appEnv === 'production');
    return { src: { status: mode === 'memory' ? 'memory' : 'ok', rows: rows.length }, rows };
  } catch (err) {
    return { src: describeError(err), rows: [] };
  }
}

/** COMPLETED course sessions whose startTime falls in [from, to] (UTC days). */
export async function loadCompletedSessions(from: string, to: string): Promise<Loaded<SessionRow>> {
  try {
    const sessions = await listSessionsByStatus('COMPLETED', {
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
    });
    const rows: SessionRow[] = sessions.map((s) => ({ id: s.id, teacherId: s.teacherId, startTime: s.startTime }));
    return { src: { status: 'ok', rows: rows.length }, rows };
  } catch (err) {
    return { src: describeError(err), rows: [] };
  }
}

/** Every recorded period of every manual metric in the catalog. */
export async function loadManual(): Promise<Loaded<ManualMetric>> {
  const mode = storeMode();
  try {
    const rows = (await Promise.all(MANUAL_DEFS.map((d) => listManualMetric(d.metricKey)))).flat();
    return { src: { status: mode === 'memory' ? 'memory' : 'ok', rows: rows.length }, rows };
  } catch (err) {
    return { src: describeError(err), rows: [] };
  }
}
