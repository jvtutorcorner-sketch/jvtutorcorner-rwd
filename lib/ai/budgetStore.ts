// lib/ai/budgetStore.ts
//
// Config store for per-scope AI spend budgets (Phase 6). One row per scope
// (GLOBAL | TENANT#<orgId>) in the ai-budgets table, 60s cached like
// featureConfigStore. In-memory fallback when no AWS creds (dev / offline tests).

import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const AI_BUDGETS_TABLE = process.env.DYNAMODB_TABLE_AI_BUDGETS || 'jvtutorcorner-ai-budgets';

export interface BudgetConfig {
  scopeKey: string; // GLOBAL | TENANT#<orgId>
  monthlyCapMusd?: number; // integer micro-USD; the AI monthly cap
  dailyCapMusd?: number;
  hardStop?: boolean; // true = deny over-budget calls; false = allow but flag
  note?: string;
  updatedBy?: string;
  updatedAt?: string;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; row: BudgetConfig | null }>();
const LOCAL: Record<string, BudgetConfig> = {};
const useDynamo =
  process.env.NODE_ENV === 'production' ||
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);

export async function getBudget(scopeKey: string): Promise<BudgetConfig | null> {
  const c = cache.get(scopeKey);
  if (c && Date.now() - c.at < CACHE_MS) return c.row;
  let row: BudgetConfig | null = null;
  if (useDynamo) {
    try {
      const res = await ddbDocClient.send(new GetCommand({ TableName: AI_BUDGETS_TABLE, Key: { scopeKey } }));
      row = (res.Item as BudgetConfig) || null;
    } catch (e) {
      console.warn('[budgetStore] get failed', e);
      row = null;
    }
  } else {
    row = LOCAL[scopeKey] ?? null;
  }
  cache.set(scopeKey, { at: Date.now(), row });
  return row;
}

export async function setBudget(cfg: BudgetConfig): Promise<BudgetConfig> {
  const row: BudgetConfig = { ...cfg, updatedAt: new Date().toISOString() };
  if (useDynamo) await ddbDocClient.send(new PutCommand({ TableName: AI_BUDGETS_TABLE, Item: row }));
  else LOCAL[cfg.scopeKey] = row;
  cache.set(cfg.scopeKey, { at: Date.now(), row });
  return row;
}

export async function listBudgets(): Promise<BudgetConfig[]> {
  if (!useDynamo) return Object.values(LOCAL);
  const out: BudgetConfig[] = [];
  let esk: Record<string, unknown> | undefined;
  do {
    const res: any = await ddbDocClient.send(new ScanCommand({ TableName: AI_BUDGETS_TABLE, ExclusiveStartKey: esk }));
    out.push(...((res.Items || []) as BudgetConfig[]));
    esk = res.LastEvaluatedKey;
  } while (esk);
  return out;
}

/** Test seam. */
export function _clearBudgetCache() {
  cache.clear();
}
