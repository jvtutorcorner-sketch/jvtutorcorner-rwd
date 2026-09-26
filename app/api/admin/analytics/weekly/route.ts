// GET /api/admin/analytics/weekly?from=yyyy-mm-dd&to=yyyy-mm-dd[&format=csv]
// AI weekly ops report: per-feature daily cost / requests / errors and message
// volume. Defaults to the last 7 complete UTC days; at most 31 days.
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { weeklyReport } from '@/lib/analytics/reports';
import { csvResponse, weeklyCsv, NO_STORE } from '@/lib/analytics/csv';
import { daysBetween, isDayKey, lastFullDays } from '@/lib/analytics/periods';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DAYS = 31;

async function handleGet(req: Request) {
  const url = new URL(req.url);
  const def = lastFullDays(7);
  const from = url.searchParams.get('from') || def.from;
  const to = url.searchParams.get('to') || def.to;
  if (!isDayKey(from) || !isDayKey(to) || from > to) {
    return NextResponse.json({ ok: false, error: 'from/to 必須是 yyyy-mm-dd 且 from ≤ to' }, { status: 400, headers: NO_STORE });
  }
  if (daysBetween(from, to).length > MAX_DAYS) {
    return NextResponse.json({ ok: false, error: `期間最多 ${MAX_DAYS} 天` }, { status: 400, headers: NO_STORE });
  }

  const data = await weeklyReport(from, to);
  if (url.searchParams.get('format') === 'csv') {
    return csvResponse(`ai-weekly-${from}_${to}.csv`, weeklyCsv(data.report, data.fx));
  }
  return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
}

export const GET = withAdmin(handleGet);
