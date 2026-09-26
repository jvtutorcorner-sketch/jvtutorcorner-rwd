// lib/analytics/reports.ts
//
// Loads the data for one report period and runs the pure aggregators.
// Periods are UTC. Days after `now` are never queried.

import { getRollup } from '@/lib/ai/gateway/ledger';
import {
  aggregateWeekly,
  buildMonthly,
  buildQuarterly,
  dedupeEvents,
  CONVERSION_WINDOW_DAYS,
  type MonthlyReport,
  type QuarterlyReport,
  type WeeklyReport,
} from './aggregate';
import { addDays, dayKey, daysBetween, monthRange, quarterRange } from './periods';
import { loadCompletedSessions, loadEvents, loadLedger, loadManual } from './sources';
import type { SrcStatus } from './types';

export const FX_USD_TWD = Number.parseFloat(process.env.FX_USD_TWD || '32') || 32;

function daysUpTo(from: string, to: string, now: Date): string[] {
  const today = dayKey(now);
  return daysBetween(from, to < today ? to : today);
}

export interface WeeklyResponse {
  generatedAt: string;
  fx: number;
  report: WeeklyReport;
  sources: { ledger: SrcStatus; events: SrcStatus };
  /** GLOBAL#yyyymmdd rollup totals, to cross-check the ledger sum. Null when not readable. */
  rollupCheck: Array<{ day: string; musd: number }> | null;
}

export async function weeklyReport(from: string, to: string, now: Date = new Date()): Promise<WeeklyResponse> {
  const days = daysUpTo(from, to, now);
  const [ledger, events] = await Promise.all([loadLedger(days), loadEvents(days)]);
  const report = aggregateWeekly(days, ledger.rows, dedupeEvents(events.rows));

  let rollupCheck: WeeklyResponse['rollupCheck'] = null;
  if (ledger.src.status !== 'unavailable') {
    try {
      rollupCheck = await Promise.all(
        days.map(async (day) => ({ day, musd: (await getRollup(`GLOBAL#${day.replace(/-/g, '')}`))?.total_musd ?? 0 }))
      );
    } catch {
      rollupCheck = null;
    }
  }
  return { generatedAt: now.toISOString(), fx: FX_USD_TWD, report, sources: { ledger: ledger.src, events: events.src }, rollupCheck };
}

export interface MonthlyResponse {
  generatedAt: string;
  fx: number;
  report: MonthlyReport;
}

export async function monthlyReport(month: string, now: Date = new Date()): Promise<MonthlyResponse> {
  const { from, to } = monthRange(month);
  const [ledger, events, sessions, manual] = await Promise.all([
    loadLedger(daysUpTo(from, to, now)),
    loadEvents(daysUpTo(from, addDays(to, CONVERSION_WINDOW_DAYS), now)),
    loadCompletedSessions(from, to),
    loadManual(),
  ]);
  const report = buildMonthly({ month, now, ledger, events, sessions, manual });
  return { generatedAt: now.toISOString(), fx: FX_USD_TWD, report };
}

export interface QuarterlyResponse {
  generatedAt: string;
  fx: number;
  report: QuarterlyReport;
}

export async function quarterlyReport(quarter: string, now: Date = new Date()): Promise<QuarterlyResponse> {
  const { from, to, months } = quarterRange(quarter);
  const [ledger, events, sessions, manual] = await Promise.all([
    loadLedger(daysUpTo(from, to, now)),
    loadEvents(daysUpTo(from, addDays(to, CONVERSION_WINDOW_DAYS), now)),
    loadCompletedSessions(from, to),
    loadManual(),
  ]);

  const monthly = months.map((month) => {
    const r = monthRange(month);
    const monthSessions = sessions.rows.filter((s) => {
      const d = String(s.startTime || '').slice(0, 10);
      return d >= r.from && d <= r.to;
    });
    return buildMonthly({
      month,
      now,
      ledger,
      events,
      sessions: { src: sessions.src, rows: monthSessions },
      manual,
    });
  });

  const report = buildQuarterly({ quarter, from, to, now, months: monthly, events });
  return { generatedAt: now.toISOString(), fx: FX_USD_TWD, report };
}
