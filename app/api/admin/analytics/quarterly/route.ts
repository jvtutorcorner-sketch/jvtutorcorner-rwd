// GET /api/admin/analytics/quarterly?quarter=2026Q4[&format=csv]
// Quarterly review: recommendation holdout vs treatment, repurchase, and the
// three monthly KPI sets side by side. Defaults to the current quarter (UTC).
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { quarterlyReport } from '@/lib/analytics/reports';
import { csvResponse, quarterlyCsv, NO_STORE } from '@/lib/analytics/csv';
import { currentQuarterKey, isQuarterKey } from '@/lib/analytics/periods';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: Request) {
  const url = new URL(req.url);
  const quarter = url.searchParams.get('quarter') || currentQuarterKey();
  if (!isQuarterKey(quarter)) {
    return NextResponse.json({ ok: false, error: 'quarter 必須是 yyyyQn,例如 2026Q4' }, { status: 400, headers: NO_STORE });
  }

  const data = await quarterlyReport(quarter);
  if (url.searchParams.get('format') === 'csv') {
    return csvResponse(`ai-quarterly-${quarter}.csv`, quarterlyCsv(data.report, data.fx));
  }
  return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
}

export const GET = withAdmin(handleGet);
