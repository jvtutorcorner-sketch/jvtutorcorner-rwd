// /api/admin/analytics/manual
//   GET — manual metric definitions + every recorded value
//   PUT — { metricKey, period, value, sampleSize?, note? } upsert one value
// Manual metrics are the 🔴 KPIs (support hours, teacher post-class minutes,
// sampled answer / grading quality) that no system event can measure.
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import type { AuthedRequest } from '@/lib/auth/apiGuard';
import { MANUAL_DEFS, manualDef } from '@/lib/analytics/kpiCatalog';
import { describeError, loadManual } from '@/lib/analytics/sources';
import { putManualMetric } from '@/lib/analytics/eventStore';
import { writeAuditLog } from '@/lib/auditLogService';
import { NO_STORE } from '@/lib/analytics/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet() {
  const manual = await loadManual();
  const rows = [...manual.rows].sort((a, b) => (a.metricKey + b.period < b.metricKey + a.period ? -1 : 1));
  return NextResponse.json({ ok: true, defs: MANUAL_DEFS, rows, source: manual.src }, { headers: NO_STORE });
}

async function handlePut(req: AuthedRequest) {
  const body = await req.json().catch(() => null);
  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400, headers: NO_STORE });
  if (!body || typeof body !== 'object') return bad('Invalid JSON body');

  const def = typeof body.metricKey === 'string' ? manualDef(body.metricKey) : undefined;
  if (!def) return bad('未知的 metricKey');
  const period = typeof body.period === 'string' ? body.period.trim() : '';
  if (!/^[\w-]{1,20}$/.test(period)) return bad('period 只能是英數字、底線或連字號(最多 20 字),例如 202609、2026-W39、baseline');
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0) return bad('value 必須是 ≥ 0 的數字');

  let sampleSize: number | undefined;
  if (def.kind === 'ratio') {
    sampleSize = Number(body.sampleSize);
    if (!Number.isInteger(sampleSize) || sampleSize <= 0) return bad('抽樣數必須是正整數');
    if (value > sampleSize) return bad('數值不能大於抽樣數');
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : undefined;

  const metric = {
    metricKey: def.metricKey,
    period,
    value,
    ...(sampleSize !== undefined ? { sampleSize } : {}),
    ...(note ? { note } : {}),
    updatedBy: req.session.userId,
    updatedAt: new Date().toISOString(),
  };
  try {
    await putManualMetric(metric);
  } catch (err) {
    const src = describeError(err);
    return NextResponse.json({ ok: false, error: src.hint }, { status: 503, headers: NO_STORE });
  }
  await writeAuditLog({
    actorId: req.session.userId,
    action: 'analytics.manual_metric.put',
    targetType: 'analytics_manual_metric',
    targetId: `${def.metricKey}#${period}`,
    metadata: { value, sampleSize: sampleSize ?? null },
  });
  return NextResponse.json({ ok: true, metric }, { headers: NO_STORE });
}

export const GET = withAdmin(handleGet);
export const PUT = withAdmin(handlePut);
