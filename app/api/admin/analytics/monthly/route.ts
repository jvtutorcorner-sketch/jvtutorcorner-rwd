// GET /api/admin/analytics/monthly?month=yyyymm[&format=csv]
// AI benefit KPIs for one UTC month (docs/ai-platform/ai-feature-benefit-
// assessment-2026-09-27.md §2–§4). Defaults to the current month.
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { monthlyReport } from '@/lib/analytics/reports';
import { csvResponse, monthlyCsv, NO_STORE } from '@/lib/analytics/csv';
import { currentMonthKey, isMonthKey } from '@/lib/analytics/periods';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || currentMonthKey();
  if (!isMonthKey(month)) {
    return NextResponse.json({ ok: false, error: 'month 必須是 yyyymm' }, { status: 400, headers: NO_STORE });
  }

  const data = await monthlyReport(month);
  if (url.searchParams.get('format') === 'csv') {
    return csvResponse(`ai-monthly-${month}.csv`, monthlyCsv(data.report, data.fx));
  }
  return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
}

export const GET = withAdmin(handleGet);
