// lib/analytics/periods.ts
//
// UTC calendar helpers for analytics reports. The AI ledger partitions by UTC
// day (`yyyy-mm-dd`) and rollups by UTC month (`yyyymm`), so every report period
// is UTC too. Pure — no I/O.

const DAY_MS = 86_400_000;

/** `yyyy-mm-dd` (UTC) of a Date or ISO string. */
export function dayKey(d: Date | string): string {
  return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
}

export function isDayKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(`${s}T00:00:00.000Z`) === s;
}

export function addDays(day: string, n: number): string {
  return dayKey(new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS));
}

/** Inclusive list of UTC days from `from` to `to`. Empty when from > to. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The last `n` complete UTC days before `now` (today excluded). */
export function lastFullDays(n: number, now: Date = new Date()): { from: string; to: string } {
  const to = addDays(dayKey(now), -1);
  return { from: addDays(to, -(n - 1)), to };
}

export function isMonthKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}(0[1-9]|1[0-2])$/.test(s);
}

/** `202609` → first/last UTC day of that month. */
export function monthRange(yyyymm: string): { from: string; to: string } {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6));
  const from = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-${String(last).padStart(2, '0')}` };
}

export function currentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7).replace('-', '');
}

export function isQuarterKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}Q[1-4]$/.test(s);
}

/** `2026Q4` → its three month keys and first/last UTC day. */
export function quarterRange(q: string): { from: string; to: string; months: string[] } {
  const y = q.slice(0, 4);
  const first = (Number(q.slice(5)) - 1) * 3 + 1;
  const months = [0, 1, 2].map((i) => `${y}${String(first + i).padStart(2, '0')}`);
  return { from: monthRange(months[0]).from, to: monthRange(months[2]).to, months };
}

export function currentQuarterKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

/** ISO-8601 week label, e.g. `2026-W40` (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeekLabel(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  const dow = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Milliseconds between two ISO timestamps (b - a). */
export function msBetween(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

export const DAY = DAY_MS;
