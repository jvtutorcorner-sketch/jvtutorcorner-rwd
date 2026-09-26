// lib/analytics/csv.ts
//
// CSV exports for the analytics reports. Prefixed with a UTF-8 BOM so Excel
// shows the Chinese headers correctly.

import { toCsv } from '@/lib/enterprise/csv';
import type { WeeklyReport, MonthlyReport, QuarterlyReport } from './aggregate';
import type { KpiRow } from './types';

const BOM = '﻿';

export const STATUS_LABEL: Record<KpiRow['status'], string> = {
  ok: '正常',
  memory: '記憶體模式(資料未落地)',
  partial: '期間未完整',
  unavailable: '資料源不可用',
  no_denominator: '無分母',
  not_instrumented: '待補',
  not_applicable: '不適用',
  manual_missing: '待填',
};

export const TIER_LABEL: Record<KpiRow['tier'], string> = { G: '🟢 現在就能量', Y: '🟡 需先埋點', R: '🔴 人工' };

/** Micro-USD → USD. */
export const musdToUsd = (musd: number): number => musd / 1_000_000;

function kpiValueText(k: KpiRow, fx: number): string {
  if (k.value === null) return '';
  switch (k.unit) {
    case 'musd':
      return `$${musdToUsd(k.value).toFixed(6)} / NT$${(musdToUsd(k.value) * fx).toFixed(4)}`;
    case 'pct':
      return `${(k.value * 100).toFixed(1)}%`;
    case 'pp':
      return `${k.value.toFixed(1)} pp`;
    default:
      return String(Math.round(k.value * 100) / 100);
  }
}

export function kpiRowsCsv(rows: KpiRow[], fx: number, period?: string): string {
  const headers = [...(period ? ['期間'] : []), '區塊', 'KPI', '分級', '數值', '分子', '分母', '狀態', '樣本不足', '公式', '備註'];
  const section = { chat: 'AI Chat', teacher: '教師專區', course: '課程分析' } as const;
  return (
    BOM +
    toCsv(
      headers,
      rows.map((k) => [
        ...(period ? [period] : []),
        section[k.section],
        k.name,
        TIER_LABEL[k.tier],
        kpiValueText(k, fx),
        k.numerator ?? '',
        k.denominator ?? '',
        STATUS_LABEL[k.status],
        k.lowSample ? '是' : '',
        k.formula,
        k.note ?? '',
      ])
    )
  );
}

export function weeklyCsv(r: WeeklyReport, fx: number): string {
  const rows: Array<Array<string | number>> = [];
  for (const f of r.features) {
    for (const d of r.days) {
      const c = r.grid[f][d];
      if (!c) continue;
      rows.push([d, f, c.requests, c.errors, musdToUsd(c.musd).toFixed(6), (musdToUsd(c.musd) * fx).toFixed(4)]);
    }
  }
  return BOM + toCsv(['日期(UTC)', 'feature', '成功請求數', '錯誤數', '成本 USD', '成本 NT$'], rows);
}

export function monthlyCsv(r: MonthlyReport, fx: number): string {
  return kpiRowsCsv(r.kpis, fx, r.month);
}

export function quarterlyCsv(r: QuarterlyReport, fx: number): string {
  const armRows = r.arms.map((a) => [
    a.arm,
    a.users,
    a.impressions,
    a.cards,
    a.recClicks,
    a.ctr === null ? '' : `${(a.ctr * 100).toFixed(2)}%`,
    a.recPurchase.rate === null ? '' : `${(a.recPurchase.rate * 100).toFixed(2)}%`,
    a.anyPurchase.rate === null ? '' : `${(a.anyPurchase.rate * 100).toFixed(2)}%`,
    a.lowSample ? '是' : '',
  ]);
  const armCsv = toCsv(['組別', '使用者數', '曝光次數', '卡片數', '推薦點擊', 'CTR', '推薦→7日購買率', '7日內任一購課率', '樣本不足'], armRows);
  const kpiCsv = toCsv(
    ['期間', 'KPI', '數值', '狀態'],
    r.months.flatMap((m) => m.kpis.map((k) => [m.month, k.name, kpiValueText(k, fx), STATUS_LABEL[k.status]]))
  );
  return BOM + armCsv + '\n\n' + kpiCsv;
}
