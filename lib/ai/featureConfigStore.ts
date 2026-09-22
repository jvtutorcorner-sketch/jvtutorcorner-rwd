// lib/ai/featureConfigStore.ts
//
// DB-backed store for ai-feature-config rows (one row per featureId × scope).
// Read path is cached 60s PER FEATURE (config only — never the usage/remaining
// counters, which live in cost-rollups and must stay live). Follows the
// seed+DB-override cache pattern of lib/ai/skillsStore.ts.

import { QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const AI_FEATURE_CONFIG_TABLE =
  process.env.DYNAMODB_TABLE_AI_FEATURE_CONFIG || 'jvtutorcorner-ai-feature-config';

const useDynamo =
  process.env.NODE_ENV === 'production' ||
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);

export type EnabledState = 'on' | 'off' | 'inherit';

export interface FeatureConfigRow {
  featureId: string;
  scope: string; // GLOBAL | TENANT#<id> | PLAN#<id> | TEACHER#<id> | COURSE#<id> | LESSON#<id> | USER#<id>
  enabled?: EnabledState;
  locked?: boolean;
  pointCost?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  perLessonLimit?: number;
  maxCostPerRequestMusd?: number;
  requiredPlan?: string;
  syncOrAsync?: 'sync' | 'async';
  modelPolicy?: Record<string, unknown>;
  updatedBy?: string;
  updatedAt?: string;
}

// In-memory store for dev/tests without AWS.
export const LOCAL_FEATURE_CONFIG: FeatureConfigRow[] = [];

const cache = new Map<string, { rows: FeatureConfigRow[]; ts: number }>();
const TTL = 60_000;

/** All config rows for one feature, cached 60s. */
export async function getFeatureRows(featureId: string): Promise<FeatureConfigRow[]> {
  const hit = cache.get(featureId);
  if (hit && Date.now() - hit.ts < TTL) return hit.rows;

  let rows: FeatureConfigRow[];
  if (useDynamo) {
    const res = await ddbDocClient.send(
      new QueryCommand({
        TableName: AI_FEATURE_CONFIG_TABLE,
        KeyConditionExpression: 'featureId = :f',
        ExpressionAttributeValues: { ':f': featureId },
      })
    );
    rows = (res.Items ?? []) as FeatureConfigRow[];
  } else {
    rows = LOCAL_FEATURE_CONFIG.filter((r) => r.featureId === featureId);
  }
  cache.set(featureId, { rows, ts: Date.now() });
  return rows;
}

export function invalidateFeature(featureId: string) {
  cache.delete(featureId);
}
export function _clearCache() {
  cache.clear();
}

/** Upsert a config row (admin). Invalidates the feature's cache. */
export async function putFeatureRow(row: FeatureConfigRow, actor?: string): Promise<void> {
  const item: FeatureConfigRow = { ...row, updatedBy: actor, updatedAt: new Date().toISOString() };
  if (useDynamo) {
    await ddbDocClient.send(new PutCommand({ TableName: AI_FEATURE_CONFIG_TABLE, Item: item }));
  } else {
    const i = LOCAL_FEATURE_CONFIG.findIndex((r) => r.featureId === row.featureId && r.scope === row.scope);
    if (i >= 0) LOCAL_FEATURE_CONFIG[i] = item;
    else LOCAL_FEATURE_CONFIG.push(item);
  }
  invalidateFeature(row.featureId);
}

export async function deleteFeatureRow(featureId: string, scope: string): Promise<void> {
  if (useDynamo) {
    await ddbDocClient.send(new DeleteCommand({ TableName: AI_FEATURE_CONFIG_TABLE, Key: { featureId, scope } }));
  } else {
    const i = LOCAL_FEATURE_CONFIG.findIndex((r) => r.featureId === featureId && r.scope === scope);
    if (i >= 0) LOCAL_FEATURE_CONFIG.splice(i, 1);
  }
  invalidateFeature(featureId);
}
