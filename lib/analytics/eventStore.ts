// lib/analytics/eventStore.ts
//
// Append-only analytics events + manually entered metrics, one DynamoDB table
// (`jvtutorcorner-analytics-events`, see scripts/lib/schema.mjs analyticsEvents).
//
//   event row   pk `EVT#yyyy-mm-dd` (UTC)   sk `${type}#${eventId}`
//   manual row  pk `MANUAL#<metricKey>`     sk period (2026-W40 | 202609 | 2026Q4 | label)
//
// recordEvent() NEVER throws and is bounded by a timeout: analytics must not
// break or slow down the request it describes. Callers should still await it —
// on serverless compute an un-awaited promise can be frozen after the response.
//
// Without DynamoDB credentials (or with ANALYTICS_STORE=memory) rows live in a
// process-global array shared across route bundles and dev reloads.

import { randomUUID } from 'crypto';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { currentAppEnv, type AnalyticsEvent, type AnalyticsEventInput } from './events';
import { dayKey } from './periods';

export function analyticsTable(): string {
  return process.env.DYNAMODB_TABLE_ANALYTICS_EVENTS || 'jvtutorcorner-analytics-events';
}

export type StoreMode = 'dynamo' | 'memory';

/** Decided per call so tests (and ANALYTICS_STORE) can switch modes. */
export function storeMode(): StoreMode {
  if (process.env.ANALYTICS_STORE === 'memory') return 'memory';
  const hasCreds = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);
  return process.env.NODE_ENV === 'production' || hasCreds ? 'dynamo' : 'memory';
}

type LocalRows = Map<string, Record<string, unknown>>;
function localRows(): LocalRows {
  const g = globalThis as { __jvAnalyticsLocal?: LocalRows };
  return (g.__jvAnalyticsLocal ??= new Map());
}
const localKey = (pk: string, sk: string) => `${pk}|${sk}`;

/** Test helper: drop all in-memory rows. */
export function _resetLocalAnalytics(): void {
  localRows().clear();
}

const RECORD_TIMEOUT_MS = 1500;

export interface RecordResult {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

/**
 * Append one event. `dedupeKey` makes the write idempotent (e.g. orderId for a
 * purchase reported by both a webhook and a return URL on the same day).
 */
export async function recordEvent(
  input: AnalyticsEventInput,
  opts: { dedupeKey?: string; now?: Date } = {}
): Promise<RecordResult> {
  try {
    const ts = (opts.now ?? new Date()).toISOString();
    const eventId = opts.dedupeKey ? String(opts.dedupeKey).slice(0, 200) : randomUUID();
    const row: AnalyticsEvent = {
      ...input,
      pk: `EVT#${dayKey(ts)}`,
      sk: `${input.type}#${eventId}`,
      eventId,
      ts,
      appEnv: currentAppEnv(),
    };

    if (storeMode() === 'memory') {
      const rows = localRows();
      const k = localKey(row.pk, row.sk);
      if (rows.has(k)) return { ok: true, duplicate: true };
      rows.set(k, row as unknown as Record<string, unknown>);
      return { ok: true };
    }

    const write = ddbDocClient
      .send(
        new PutCommand({
          TableName: analyticsTable(),
          Item: row,
          ConditionExpression: 'attribute_not_exists(sk)',
        })
      )
      .then((): RecordResult => ({ ok: true }))
      .catch((err: unknown): RecordResult => {
        if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') return { ok: true, duplicate: true };
        return { ok: false, error: (err as Error)?.message || String(err) };
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<RecordResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), RECORD_TIMEOUT_MS);
    });
    const res = await Promise.race([write, timeout]);
    if (timer) clearTimeout(timer);
    if (!res.ok) console.warn('[analytics] recordEvent failed', { type: input.type, error: res.error });
    return res;
  } catch (err) {
    console.warn('[analytics] recordEvent threw', { type: input?.type, error: (err as Error)?.message });
    return { ok: false, error: (err as Error)?.message || String(err) };
  }
}

/** Every row of one DynamoDB partition, following pagination. Throws on error. */
async function queryPartition(pk: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let esk: Record<string, unknown> | undefined;
  do {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: analyticsTable(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ExclusiveStartKey: esk,
      })
    );
    out.push(...((res.Items || []) as Record<string, unknown>[]));
    esk = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (esk);
  return out;
}

function localPartition(pk: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of localRows().values()) if (row.pk === pk) out.push(row);
  return out;
}

/** All events of one UTC day. Throws on a DynamoDB error (the caller reports the source status). */
export async function queryEventsForDay(day: string): Promise<AnalyticsEvent[]> {
  const pk = `EVT#${day}`;
  const rows = storeMode() === 'memory' ? localPartition(pk) : await queryPartition(pk);
  return rows as unknown as AnalyticsEvent[];
}

export interface ManualMetric {
  metricKey: string;
  period: string;
  value: number;
  sampleSize?: number;
  note?: string;
  updatedBy: string;
  updatedAt: string;
}

export async function putManualMetric(m: ManualMetric): Promise<void> {
  const item = { pk: `MANUAL#${m.metricKey}`, sk: m.period, ...m };
  if (storeMode() === 'memory') {
    localRows().set(localKey(item.pk, item.sk), item);
    return;
  }
  await ddbDocClient.send(new PutCommand({ TableName: analyticsTable(), Item: item }));
}

/** Every recorded period of one manual metric. Throws on a DynamoDB error. */
export async function listManualMetric(metricKey: string): Promise<ManualMetric[]> {
  const pk = `MANUAL#${metricKey}`;
  const rows = storeMode() === 'memory' ? localPartition(pk) : await queryPartition(pk);
  return rows as unknown as ManualMetric[];
}
