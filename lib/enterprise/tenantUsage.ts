// lib/enterprise/tenantUsage.ts
//
// Shared tenant AI usage/cost report used by the admin tenant report and the HMAC
// enterprise usage API. Reads the TENANT#<org>#<month> cost-rollup, the tenant
// budget, and (on detail) aggregates the usage ledger by feature. Server-only.

import { getRollup, queryTenantMonthUsage } from '@/lib/ai/gateway/ledger';
import { getBudget } from '@/lib/ai/budgetStore';
import { toCsv } from './csv';

const FX = Number.parseFloat(process.env.FX_USD_TWD || '32');
export const musdToNt = (m: number): number => Math.round((((m || 0) / 1_000_000) * FX) * 100) / 100;

export interface TenantUsageReport {
  orgId: string;
  month: string;
  fx: number;
  rollup: { total_musd: number; ai_musd: number; platform_musd: number; requests: number; total_nt: number } | null;
  budget:
    | { monthlyCapMusd: number; monthly_nt: number; hardStop: boolean; spent_musd: number; remaining_musd: number; over: boolean }
    | null;
  byFeature: Array<{ feature: string; requests: number; ai_musd: number; nt: number }>;
}

export async function buildTenantUsage(orgId: string, month: string, opts: { detail?: boolean } = {}): Promise<TenantUsageReport> {
  const r = await getRollup(`TENANT#${orgId}#${month}`);
  const b = await getBudget(`TENANT#${orgId}`);

  const rollup = r
    ? {
        total_musd: r.total_musd || 0,
        ai_musd: r.ai_musd || 0,
        platform_musd: r.platform_musd || 0,
        requests: r.requests || 0,
        total_nt: musdToNt(r.total_musd || 0),
      }
    : null;

  const spent = r?.ai_musd || 0;
  const budget =
    b && b.monthlyCapMusd != null
      ? {
          monthlyCapMusd: b.monthlyCapMusd,
          monthly_nt: musdToNt(b.monthlyCapMusd),
          hardStop: !!b.hardStop,
          spent_musd: spent,
          remaining_musd: Math.max(0, b.monthlyCapMusd - spent),
          over: spent > b.monthlyCapMusd,
        }
      : null;

  let byFeature: TenantUsageReport['byFeature'] = [];
  if (opts.detail) {
    const rows = await queryTenantMonthUsage(orgId, month);
    const agg = new Map<string, { requests: number; ai_musd: number }>();
    for (const row of rows) {
      const f = String((row as { feature?: unknown }).feature ?? 'unknown');
      const cur = agg.get(f) || { requests: 0, ai_musd: 0 };
      cur.requests += 1;
      cur.ai_musd += Number((row as { actualCostMusd?: unknown }).actualCostMusd) || 0;
      agg.set(f, cur);
    }
    byFeature = [...agg.entries()]
      .map(([feature, v]) => ({ feature, requests: v.requests, ai_musd: v.ai_musd, nt: musdToNt(v.ai_musd) }))
      .sort((a, b2) => b2.ai_musd - a.ai_musd);
  }

  return { orgId, month, fx: FX, rollup, budget, byFeature };
}

export function tenantUsageCsv(report: TenantUsageReport): string {
  const headers = ['orgId', 'month', 'feature', 'requests', 'ai_musd', 'ai_nt'];
  const rows: Array<Array<string | number>> = [];
  if (report.byFeature.length) {
    for (const f of report.byFeature) rows.push([report.orgId, report.month, f.feature, f.requests, f.ai_musd, f.nt]);
  }
  // Always include a TOTAL line from the rollup.
  rows.push([
    report.orgId,
    report.month,
    'TOTAL',
    report.rollup?.requests ?? 0,
    report.rollup?.ai_musd ?? 0,
    musdToNt(report.rollup?.ai_musd ?? 0),
  ]);
  return toCsv(headers, rows);
}
