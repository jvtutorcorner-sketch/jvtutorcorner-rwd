// lib/analytics/types.ts
//
// Shapes shared by the analytics aggregators, report APIs and admin page.

/** Where a data source's rows came from. `unavailable` means the read failed — never treat it as zero. */
export type SourceStatus = 'ok' | 'memory' | 'unavailable';

export interface SrcStatus {
  status: SourceStatus;
  /** Human-readable cause when unavailable (e.g. missing AWS credentials, table not created). */
  hint?: string;
  error?: string;
  rows?: number;
}

export interface Loaded<T> {
  src: SrcStatus;
  rows: T[];
}

export type KpiStatus =
  | 'ok'
  | 'memory'           // computed, but from in-memory dev data
  | 'partial'          // the measurement window has not fully elapsed yet
  | 'unavailable'      // a source failed to load
  | 'no_denominator'   // ratio with nothing to divide by — shown as "—", never 0%
  | 'not_instrumented' // no data source yet (待補)
  | 'not_applicable'   // the product has no such behaviour (不適用)
  | 'manual_missing';  // manual metric not entered for this period (待填)

export type KpiUnit = 'musd' | 'pct' | 'pp' | 'count' | 'hours' | 'minutes';

/** 🟢 measurable now / 🟡 needed instrumentation / 🔴 manual — doc §1.3. */
export type KpiTier = 'G' | 'Y' | 'R';

export type KpiSection = 'chat' | 'teacher' | 'course';

export interface KpiRow {
  id: string;
  section: KpiSection;
  name: string;
  tier: KpiTier;
  unit: KpiUnit;
  value: number | null;
  numerator?: number;
  denominator?: number;
  status: KpiStatus;
  formula: string;
  note?: string;
  /** Fewer than LOW_SAMPLE_THRESHOLD in the denominator: read as a trend only (doc §1.2). */
  lowSample?: boolean;
}

export const LOW_SAMPLE_THRESHOLD = 300;

/** One AI usage-ledger row (lib/ai/gateway/ledger.ts buildLedgerItem), as far as reports need it. */
export interface LedgerRow {
  feature?: string;
  actualCostMusd?: number;
  sessionId?: string;
  userId?: string;
  createdAt?: string;
  costCenter?: string;
}

/** A completed course session (lib/courseSessionService.ts), as far as reports need it. */
export interface SessionRow {
  id: string;
  teacherId?: string;
  startTime?: string;
}
