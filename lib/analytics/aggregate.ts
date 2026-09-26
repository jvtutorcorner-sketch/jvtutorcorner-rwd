// lib/analytics/aggregate.ts
//
// Pure report builders for the AI benefit KPIs (weekly / monthly / quarterly).
// Inputs are already-loaded rows plus each source's load status; nothing here
// does I/O, so every formula is covered by scripts/verify-analytics.mjs.
//
// Rules (doc §1, §6):
//   - a KPI whose source failed to load is `unavailable` (value null), never 0;
//   - a ratio with an empty denominator is `no_denominator` (shown "—");
//   - a KPI whose measurement window (e.g. +7 days) is still open is `partial`;
//   - all periods are UTC days, matching the ledger's partition key.

import type { AnalyticsEvent, AnalyticsEventType, RecArm } from './events';
import type { ManualMetric } from './eventStore';
import {
  KPI_DEFS,
  kpiDef,
  MANUAL_DEFS,
  CHAT_FEATURES,
  LINE_FEATURES,
  LESSON_AI_FEATURES,
  type KpiDef,
  type ManualDef,
} from './kpiCatalog';
import { DAY, addDays, monthRange } from './periods';
import {
  LOW_SAMPLE_THRESHOLD,
  type KpiRow,
  type LedgerRow,
  type Loaded,
  type SessionRow,
  type SourceStatus,
  type SrcStatus,
} from './types';

// ── Event helpers ─────────────────────────────────────────────────────────────

export type EventOf<T extends AnalyticsEventType> = Extract<AnalyticsEvent, { type: T }>;

export function ofType<T extends AnalyticsEventType>(events: AnalyticsEvent[], type: T): EventOf<T>[] {
  return events.filter((e): e is EventOf<T> => e.type === type);
}

/** Drop repeats of the same (type, eventId) — a retry can land on a different UTC day. */
export function dedupeEvents(events: AnalyticsEvent[]): AnalyticsEvent[] {
  const seen = new Set<string>();
  const out: AnalyticsEvent[] = [];
  for (const e of events) {
    const k = `${e.type}#${e.eventId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

const dayOf = (ts: string | undefined): string => (ts || '').slice(0, 10);
const inRange = (ts: string | undefined, from: string, to: string): boolean => {
  const d = dayOf(ts);
  return d >= from && d <= to;
};
const costOf = (r: LedgerRow): number => Math.round(Number(r.actualCostMusd) || 0);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** The window [start, end-day + extraDays] has not fully elapsed at `now`. */
export function windowOpen(endDay: string, extraDays: number, now: Date): boolean {
  return Date.parse(`${addDays(endDay, extraDays + 1)}T00:00:00.000Z`) > now.getTime();
}

// ── Status merging ────────────────────────────────────────────────────────────

const SRC_RANK: Record<SourceStatus, number> = { ok: 0, memory: 1, unavailable: 2 };

export function mergeSources(...srcs: SrcStatus[]): SourceStatus {
  return srcs.reduce<SourceStatus>((worst, s) => (SRC_RANK[s.status] > SRC_RANK[worst] ? s.status : worst), 'ok');
}

function baseRow(def: KpiDef): Omit<KpiRow, 'value' | 'status'> {
  return { id: def.id, section: def.section, name: def.name, tier: def.tier, unit: def.unit, formula: def.formula, ...(def.note ? { note: def.note } : {}) };
}

export function fixedKpi(def: KpiDef): KpiRow {
  return { ...baseRow(def), value: null, status: def.fixedStatus ?? 'not_instrumented' };
}

export function valueKpi(id: string, srcs: SrcStatus[], value: number, opts: { partial?: boolean } = {}): KpiRow {
  const def = kpiDef(id);
  const s = mergeSources(...srcs);
  if (s === 'unavailable') return { ...baseRow(def), value: null, status: 'unavailable' };
  return { ...baseRow(def), value, status: s === 'memory' ? 'memory' : opts.partial ? 'partial' : 'ok' };
}

export function ratioKpi(
  id: string,
  srcs: SrcStatus[],
  numerator: number,
  denominator: number,
  opts: { partial?: boolean } = {}
): KpiRow {
  const def = kpiDef(id);
  const s = mergeSources(...srcs);
  const base = { ...baseRow(def), numerator, denominator };
  if (s === 'unavailable') return { ...base, value: null, status: 'unavailable', numerator: undefined, denominator: undefined };
  if (!denominator) return { ...base, value: null, status: 'no_denominator' };
  const lowSample = def.unit === 'pct' && denominator < LOW_SAMPLE_THRESHOLD;
  return {
    ...base,
    value: numerator / denominator,
    status: s === 'memory' ? 'memory' : opts.partial ? 'partial' : 'ok',
    ...(lowSample ? { lowSample } : {}),
  };
}

export function manualKpi(def: ManualDef, manual: Loaded<ManualMetric>, period: string): KpiRow {
  const kdef = kpiDef(def.kpiId);
  if (manual.src.status === 'unavailable') return { ...baseRow(kdef), value: null, status: 'unavailable' };
  const row = manual.rows.find((m) => m.metricKey === def.metricKey && m.period === period);
  if (!row) return { ...baseRow(kdef), value: null, status: 'manual_missing' };
  const status = manual.src.status === 'memory' ? 'memory' : 'ok';
  if (def.kind === 'value') return { ...baseRow(kdef), value: Number(row.value), status };
  const den = Number(row.sampleSize) || 0;
  if (!den) return { ...baseRow(kdef), value: null, status: 'no_denominator', numerator: Number(row.value), denominator: 0 };
  return { ...baseRow(kdef), value: Number(row.value) / den, numerator: Number(row.value), denominator: den, status };
}

// ── Weekly ────────────────────────────────────────────────────────────────────

export interface WeeklyCell {
  requests: number;
  musd: number;
  errors: number;
}

export interface WeeklyReport {
  from: string;
  to: string;
  days: string[];
  features: string[];
  /** feature → day → cell */
  grid: Record<string, Record<string, WeeklyCell>>;
  daily: Record<string, WeeklyCell & { widgetMessages: number; lineMessages: number }>;
  featureTotals: Array<WeeklyCell & { feature: string; errorRate: number | null }>;
  totals: WeeklyCell & { widgetMessages: number; lineMessages: number };
  /**
   * A feature-day whose cost exceeds ANOMALY_FACTOR × that feature's average on
   * the OTHER days of the window. Days with no spend elsewhere are not flagged,
   * so a feature used once in the week is not reported as a spike.
   */
  anomalies: Array<{ feature: string; day: string; musd: number; avgMusd: number }>;
}

export const ANOMALY_FACTOR = 3;

export function aggregateWeekly(days: string[], ledger: LedgerRow[], events: AnalyticsEvent[]): WeeklyReport {
  const daySet = new Set(days);
  const grid: WeeklyReport['grid'] = {};
  const cell = (f: string, d: string): WeeklyCell => {
    const byDay = (grid[f] ??= {});
    return (byDay[d] ??= { requests: 0, musd: 0, errors: 0 });
  };

  for (const r of ledger) {
    const d = dayOf(r.createdAt);
    if (!daySet.has(d)) continue;
    const c = cell(r.feature || 'unknown', d);
    c.requests += 1;
    c.musd += costOf(r);
  }
  for (const e of ofType(events, 'ai_error')) {
    const d = dayOf(e.ts);
    if (daySet.has(d)) cell(e.feature || 'unknown', d).errors += 1;
  }

  const daily: WeeklyReport['daily'] = {};
  for (const d of days) daily[d] = { requests: 0, musd: 0, errors: 0, widgetMessages: 0, lineMessages: 0 };
  for (const byDay of Object.values(grid)) {
    for (const [d, c] of Object.entries(byDay)) {
      daily[d].requests += c.requests;
      daily[d].musd += c.musd;
      daily[d].errors += c.errors;
    }
  }
  for (const e of events) {
    const d = dayOf(e.ts);
    if (!daySet.has(d)) continue;
    if (e.type === 'chat_message') daily[d].widgetMessages += 1;
    else if (e.type === 'line_message') daily[d].lineMessages += 1;
  }

  const features = Object.keys(grid).sort();
  const featureTotals = features.map((feature) => {
    const cells = Object.values(grid[feature]);
    const requests = sum(cells.map((c) => c.requests));
    const errors = sum(cells.map((c) => c.errors));
    return { feature, requests, musd: sum(cells.map((c) => c.musd)), errors, errorRate: requests + errors > 0 ? errors / (requests + errors) : null };
  });

  const anomalies: WeeklyReport['anomalies'] = [];
  if (days.length >= 3) {
    for (const feature of features) {
      const total = sum(days.map((d) => grid[feature][d]?.musd ?? 0));
      for (const d of days) {
        const musd = grid[feature][d]?.musd ?? 0;
        const avgMusd = (total - musd) / (days.length - 1);
        if (avgMusd > 0 && musd > ANOMALY_FACTOR * avgMusd) anomalies.push({ feature, day: d, musd, avgMusd });
      }
    }
  }

  const totals = Object.values(daily).reduce(
    (t, c) => ({
      requests: t.requests + c.requests,
      musd: t.musd + c.musd,
      errors: t.errors + c.errors,
      widgetMessages: t.widgetMessages + c.widgetMessages,
      lineMessages: t.lineMessages + c.lineMessages,
    }),
    { requests: 0, musd: 0, errors: 0, widgetMessages: 0, lineMessages: 0 }
  );

  return { from: days[0] ?? '', to: days[days.length - 1] ?? '', days, features, grid, daily, featureTotals, totals, anomalies };
}

// ── Chat conversations ────────────────────────────────────────────────────────

export interface Conversation {
  userId: string;
  day: string;
  first: string;
  last: string;
}

/** A conversation = one user's widget messages within one UTC day. */
export function buildConversations(messages: EventOf<'chat_message'>[]): Conversation[] {
  const byKey = new Map<string, Conversation>();
  for (const m of messages) {
    if (!m.userId) continue;
    const day = dayOf(m.ts);
    const k = `${m.userId}#${day}`;
    const c = byKey.get(k);
    if (!c) byKey.set(k, { userId: m.userId, day, first: m.ts, last: m.ts });
    else {
      if (m.ts < c.first) c.first = m.ts;
      if (m.ts > c.last) c.last = m.ts;
    }
  }
  return [...byKey.values()];
}

/** Resolved = no handoff by the same user from the first message until 24h after the last. */
export function selfResolve(convs: Conversation[], handoffs: EventOf<'chat_handoff'>[]): { resolved: number; total: number } {
  let resolved = 0;
  for (const c of convs) {
    const end = Date.parse(c.last) + DAY;
    const handedOff = handoffs.some((h) => h.userId === c.userId && h.ts >= c.first && Date.parse(h.ts) <= end);
    if (!handedOff) resolved += 1;
  }
  return { resolved, total: convs.length };
}

// ── Conversions ───────────────────────────────────────────────────────────────

export const CONVERSION_WINDOW_DAYS = 7;

/** Clicks followed by a purchase of the SAME course by the same user within the window. */
export function clickToPurchase(
  clicks: EventOf<'course_click'>[],
  purchases: EventOf<'course_purchase'>[],
  windowMs: number = CONVERSION_WINDOW_DAYS * DAY
): { converted: number; total: number } {
  let converted = 0;
  for (const c of clicks) {
    const t0 = Date.parse(c.ts);
    const hit = purchases.some((p) => {
      if (p.userId !== c.userId || p.courseId !== c.courseId) return false;
      const dt = Date.parse(p.ts) - t0;
      return dt >= 0 && dt <= windowMs;
    });
    if (hit) converted += 1;
  }
  return { converted, total: clicks.length };
}

/** Users who bought any course within the window after their start time. */
export function usersPurchasingWithin(
  startByUser: Map<string, string>,
  purchases: EventOf<'course_purchase'>[],
  windowMs: number = CONVERSION_WINDOW_DAYS * DAY
): { converted: number; total: number } {
  let converted = 0;
  for (const [userId, start] of startByUser) {
    const t0 = Date.parse(start);
    const hit = purchases.some((p) => {
      if (p.userId !== userId) return false;
      const dt = Date.parse(p.ts) - t0;
      return dt >= 0 && dt <= windowMs;
    });
    if (hit) converted += 1;
  }
  return { converted, total: startByUser.size };
}

function firstTsByUser(events: Array<{ userId?: string; ts: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of events) {
    if (!e.userId) continue;
    const cur = m.get(e.userId);
    if (!cur || e.ts < cur) m.set(e.userId, e.ts);
  }
  return m;
}

// ── Monthly ───────────────────────────────────────────────────────────────────

export interface MonthlyInput {
  month: string; // yyyymm
  now: Date;
  /** Ledger rows of the month. */
  ledger: Loaded<LedgerRow>;
  /** Events from the month's first day to its last day + CONVERSION_WINDOW_DAYS. */
  events: Loaded<AnalyticsEvent>;
  /** COMPLETED course sessions that started in the month. */
  sessions: Loaded<SessionRow>;
  manual: Loaded<ManualMetric>;
}

export interface LessonCostStats {
  lessons: number;
  totalMusd: number;
  avgMusd: number;
  medianMusd: number;
  p90Musd: number;
}

export interface MonthlyReport {
  month: string;
  from: string;
  to: string;
  kpis: KpiRow[];
  featureCosts: Array<{ feature: string; requests: number; musd: number }>;
  lessonCost: LessonCostStats | null;
  featureUsage: Array<{ feature: string; lessons: number }>;
  sources: { ledger: SrcStatus; events: SrcStatus; sessions: SrcStatus; manual: SrcStatus };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function lessonCostStats(ledger: LedgerRow[]): LessonCostStats | null {
  const bySession = new Map<string, number>();
  for (const r of ledger) {
    if (!r.sessionId) continue;
    bySession.set(r.sessionId, (bySession.get(r.sessionId) ?? 0) + costOf(r));
  }
  if (bySession.size === 0) return null;
  const costs = [...bySession.values()].sort((a, b) => a - b);
  const totalMusd = sum(costs);
  return {
    lessons: costs.length,
    totalMusd,
    avgMusd: totalMusd / costs.length,
    medianMusd: percentile(costs, 0.5),
    p90Musd: percentile(costs, 0.9),
  };
}

export function buildMonthly(input: MonthlyInput): MonthlyReport {
  const { month, now } = input;
  const { from, to } = monthRange(month);
  const L = input.ledger.src;
  const E = input.events.src;
  const S = input.sessions.src;

  const ledger = input.ledger.rows.filter((r) => inRange(r.createdAt, from, to));
  const all = dedupeEvents(input.events.rows);
  const inMonth = all.filter((e) => inRange(e.ts, from, to));
  const purchases = ofType(all, 'course_purchase');
  const conversionOpen = windowOpen(to, CONVERSION_WINDOW_DAYS, now);

  // Ledger per feature
  const featMap = new Map<string, { requests: number; musd: number }>();
  for (const r of ledger) {
    const f = r.feature || 'unknown';
    const cur = featMap.get(f) ?? { requests: 0, musd: 0 };
    cur.requests += 1;
    cur.musd += costOf(r);
    featMap.set(f, cur);
  }
  const featureCosts = [...featMap.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.musd - a.musd);
  const costFor = (fs: readonly string[]) => sum(fs.map((f) => featMap.get(f)?.musd ?? 0));
  const reqFor = (fs: readonly string[]) => sum(fs.map((f) => featMap.get(f)?.requests ?? 0));

  const kpis = new Map<string, KpiRow>();
  const put = (row: KpiRow) => kpis.set(row.id, row);

  // §2 AI Chat
  const widgetMsgs = ofType(inMonth, 'chat_message');
  const lineMsgs = ofType(inMonth, 'line_message');
  put(ratioKpi('chat_cost_per_msg_widget', [L, E], costFor(['chat-assistant']), widgetMsgs.length));
  put(ratioKpi('chat_cost_per_msg_line', [L], costFor(LINE_FEATURES), reqFor(LINE_FEATURES)));
  put(valueKpi('chat_monthly_cost', [L], costFor(CHAT_FEATURES)));
  put(valueKpi('widget_msg_volume', [E], widgetMsgs.length));
  put(valueKpi('line_msg_volume', [E], lineMsgs.length));
  const convs = buildConversations(widgetMsgs);
  const sr = selfResolve(convs, ofType(all, 'chat_handoff'));
  put(ratioKpi('chat_self_resolve', [E], sr.resolved, sr.total, { partial: windowOpen(to, 1, now) }));
  const chatConv = usersPurchasingWithin(firstTsByUser(widgetMsgs), purchases);
  put(ratioKpi('chat_to_purchase_7d', [E], chatConv.converted, chatConv.total, { partial: conversionOpen }));

  // §3 教師專區
  const completed = new Set(input.sessions.rows.map((s) => s.id));
  const usageBySession = new Map<string, Set<string>>();
  for (const r of ledger) {
    if (!r.sessionId || !(LESSON_AI_FEATURES as readonly string[]).includes(r.feature || '')) continue;
    const set = usageBySession.get(r.sessionId) ?? new Set<string>();
    set.add(r.feature as string);
    usageBySession.set(r.sessionId, set);
  }
  const usedCompleted = [...completed].filter((id) => usageBySession.has(id)).length;
  put(ratioKpi('teacher_feature_usage', [L, S], usedCompleted, completed.size));
  const featureUsage = LESSON_AI_FEATURES.map((feature) => ({
    feature,
    lessons: [...completed].filter((id) => usageBySession.get(id)?.has(feature)).length,
  }));
  const lessonCost = lessonCostStats(ledger);
  put(ratioKpi('teacher_cost_per_lesson', [L], lessonCost?.totalMusd ?? 0, lessonCost?.lessons ?? 0));
  const generated = ofType(inMonth, 'assessment_generated');
  const adopted = ofType(inMonth, 'assessment_dispatched').filter((d) => !!d.generateRequestId);
  put(ratioKpi('assessment_adoption', [E], adopted.length, generated.length));
  const teachers = new Set(input.sessions.rows.map((s) => s.teacherId).filter(Boolean));
  put(valueKpi('active_teachers', [S], teachers.size));
  put(ratioKpi('sessions_per_teacher', [S], completed.size, teachers.size));

  // §4 課程分析
  const impressions = ofType(inMonth, 'rec_impression');
  const cards = sum(impressions.map((i) => i.courseIds.length));
  const clicks = ofType(inMonth, 'course_click');
  const recClicks = clicks.filter((c) => c.src === 'recommendation');
  const catClicks = clicks.filter((c) => c.src === 'catalog');
  put(valueKpi('rec_impressions', [E], cards));
  put(ratioKpi('rec_ctr', [E], recClicks.length, cards));
  const recConv = clickToPurchase(recClicks, purchases);
  const catConv = clickToPurchase(catClicks, purchases);
  put(ratioKpi('rec_to_purchase_7d', [E], recConv.converted, recConv.total, { partial: conversionOpen }));
  put(ratioKpi('catalog_to_purchase_7d', [E], catConv.converted, catConv.total, { partial: conversionOpen }));
  put(diffKpi('rec_vs_catalog_diff', [E], recConv, catConv, conversionOpen));
  const served = ofType(inMonth, 'rec_served');
  put(ratioKpi('personalization_coverage', [E], served.filter((s) => s.personalized).length, served.length));
  put(ratioKpi('popularity_signal_validity', [E], sum(served.map((s) => s.popNonDefault)), sum(served.map((s) => s.n))));

  // Manual metrics for this month
  for (const md of MANUAL_DEFS) put(manualKpi(md, input.manual, month));

  const ordered = KPI_DEFS.filter((d) => !d.quarterOnly).map((d) => kpis.get(d.id) ?? fixedKpi(d));

  return {
    month,
    from,
    to,
    kpis: ordered,
    featureCosts,
    lessonCost,
    featureUsage,
    sources: { ledger: L, events: E, sessions: S, manual: input.manual.src },
  };
}

/** Difference of two conversion rates in percentage points. */
function diffKpi(
  id: string,
  srcs: SrcStatus[],
  a: { converted: number; total: number },
  b: { converted: number; total: number },
  partial: boolean
): KpiRow {
  const def = kpiDef(id);
  const s = mergeSources(...srcs);
  const base = baseRow(def);
  if (s === 'unavailable') return { ...base, value: null, status: 'unavailable' };
  if (!a.total || !b.total) return { ...base, value: null, status: 'no_denominator' };
  const value = (a.converted / a.total - b.converted / b.total) * 100;
  const lowSample = a.total < LOW_SAMPLE_THRESHOLD || b.total < LOW_SAMPLE_THRESHOLD;
  return { ...base, value, status: s === 'memory' ? 'memory' : partial ? 'partial' : 'ok', ...(lowSample ? { lowSample } : {}) };
}

// ── Quarterly ─────────────────────────────────────────────────────────────────

/** Two-proportion z statistic; null when either group is empty or the pooled variance is 0. */
export function zTwoProp(x1: number, n1: number, x2: number, n2: number): number | null {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  return (x1 / n1 - x2 / n2) / se;
}

export interface ArmStats {
  arm: RecArm;
  users: number;
  impressions: number;
  cards: number;
  recClicks: number;
  ctr: number | null;
  recPurchase: { converted: number; total: number; rate: number | null };
  anyPurchase: { converted: number; total: number; rate: number | null };
  lowSample: boolean;
}

const rate = (x: { converted: number; total: number }) => ({ ...x, rate: x.total ? x.converted / x.total : null });

/**
 * Holdout vs treatment over [from, to]. A user's arm is the arm stamped on
 * their first impression, so a mid-quarter percentage change can't move them.
 * `events` must extend CONVERSION_WINDOW_DAYS past `to`.
 */
export function armComparison(events: AnalyticsEvent[], from: string, to: string) {
  const all = dedupeEvents(events);
  const impressions = ofType(all, 'rec_impression').filter((i) => inRange(i.ts, from, to)).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const armOf = new Map<string, RecArm>();
  const firstImpression = new Map<string, string>();
  for (const i of impressions) {
    if (!armOf.has(i.userId)) {
      armOf.set(i.userId, i.arm);
      firstImpression.set(i.userId, i.ts);
    }
  }
  const recClicks = ofType(all, 'course_click').filter((c) => c.src === 'recommendation' && inRange(c.ts, from, to));
  const purchases = ofType(all, 'course_purchase');

  const arms: ArmStats[] = (['treatment', 'holdout'] as RecArm[]).map((arm) => {
    const users = [...armOf.entries()].filter(([, a]) => a === arm).map(([u]) => u);
    const userSet = new Set(users);
    const imps = impressions.filter((i) => armOf.get(i.userId) === arm);
    const cards = sum(imps.map((i) => i.courseIds.length));
    const clicks = recClicks.filter((c) => userSet.has(c.userId));
    const starts = new Map(users.map((u) => [u, firstImpression.get(u) as string]));
    return {
      arm,
      users: users.length,
      impressions: imps.length,
      cards,
      recClicks: clicks.length,
      ctr: cards ? clicks.length / cards : null,
      recPurchase: rate(clickToPurchase(clicks, purchases)),
      anyPurchase: rate(usersPurchasingWithin(starts, purchases)),
      lowSample: users.length < LOW_SAMPLE_THRESHOLD,
    };
  });
  const [t, h] = arms;
  return {
    arms,
    zCtr: zTwoProp(t.recClicks, t.cards, h.recClicks, h.cards),
    zAnyPurchase: zTwoProp(t.anyPurchase.converted, t.anyPurchase.total, h.anyPurchase.converted, h.anyPurchase.total),
  };
}

export interface QuarterlyInput {
  quarter: string;
  from: string;
  to: string;
  now: Date;
  months: MonthlyReport[];
  /** Events from the quarter's first day to its last day + CONVERSION_WINDOW_DAYS. */
  events: Loaded<AnalyticsEvent>;
}

export interface QuarterlyReport {
  quarter: string;
  from: string;
  to: string;
  months: MonthlyReport[];
  arms: ArmStats[];
  zCtr: number | null;
  zAnyPurchase: number | null;
  repurchase: KpiRow;
  warnings: string[];
  eventsSource: SrcStatus;
}

export function buildQuarterly(input: QuarterlyInput): QuarterlyReport {
  const { from, to, now } = input;
  const E = input.events.src;
  const warnings: string[] = [];
  const cmp =
    E.status === 'unavailable'
      ? { arms: [] as ArmStats[], zCtr: null, zAnyPurchase: null }
      : armComparison(input.events.rows, from, to);

  if (E.status === 'unavailable') warnings.push('事件資料源不可用,無法比較 holdout。');
  else {
    if (cmp.arms.some((a) => a.lowSample)) warnings.push(`任一組少於 ${LOW_SAMPLE_THRESHOLD} 位使用者:只看趨勢,不下結論(doc §1.2)。`);
    if (cmp.arms.find((a) => a.arm === 'holdout')?.users === 0) warnings.push('holdout 組沒有曝光資料。');
    const served = ofType(dedupeEvents(input.events.rows), 'rec_served').filter((s) => inRange(s.ts, from, to) && s.arm === 'treatment');
    const personalized = served.filter((s) => s.personalized).length;
    if (!served.length || personalized / served.length < 0.05) {
      warnings.push('treatment 組個人化覆蓋率接近 0:行為資料尚未累積,兩組結果會相同,比較沒有意義(doc §4.3)。');
    }
  }

  // Repurchase: users with ≥ 2 course purchases inside the quarter.
  const inQ = ofType(dedupeEvents(input.events.rows), 'course_purchase').filter((p) => inRange(p.ts, from, to));
  const perUser = new Map<string, number>();
  for (const p of inQ) perUser.set(p.userId, (perUser.get(p.userId) ?? 0) + 1);
  const repeaters = [...perUser.values()].filter((n) => n >= 2).length;
  const repurchase = ratioKpi('repurchase_in_quarter', [E], repeaters, perUser.size, { partial: windowOpen(to, 0, now) });

  return {
    quarter: input.quarter,
    from,
    to,
    months: input.months,
    arms: cmp.arms,
    zCtr: cmp.zCtr,
    zAnyPurchase: cmp.zAnyPurchase,
    repurchase,
    warnings,
    eventsSource: E,
  };
}
