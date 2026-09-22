// Admin API for the AI feature-flag config.
//   GET  → { seeds, rows }  (code seeds + all DB override rows)
//   PUT  → upsert one { featureId, scope, ...fields }
//   DELETE ?featureId=&scope=  → remove one override row
import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { FEATURE_SEEDS } from '@/lib/ai/entitlements';
import { getFeatureRows, putFeatureRow, deleteFeatureRow, type FeatureConfigRow } from '@/lib/ai/featureConfigStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet() {
  const featureIds = Object.keys(FEATURE_SEEDS);
  const rowsByFeature: Record<string, FeatureConfigRow[]> = {};
  for (const f of featureIds) {
    try { rowsByFeature[f] = await getFeatureRows(f); } catch { rowsByFeature[f] = []; }
  }
  return NextResponse.json({ ok: true, seeds: FEATURE_SEEDS, rows: rowsByFeature });
}

async function handlePut(req: AuthedRequest) {
  const body = (await req.json().catch(() => null)) as Partial<FeatureConfigRow> | null;
  if (!body?.featureId || !body?.scope) {
    return NextResponse.json({ ok: false, error: 'featureId and scope required' }, { status: 400 });
  }
  await putFeatureRow(body as FeatureConfigRow, req.session.email);
  return NextResponse.json({ ok: true });
}

async function handleDelete(req: AuthedRequest) {
  const url = new URL(req.url);
  const featureId = url.searchParams.get('featureId');
  const scope = url.searchParams.get('scope');
  if (!featureId || !scope) return NextResponse.json({ ok: false, error: 'featureId and scope required' }, { status: 400 });
  await deleteFeatureRow(featureId, scope);
  return NextResponse.json({ ok: true });
}

export const GET = withAdmin(handleGet);
export const PUT = withAdmin(handlePut);
export const DELETE = withAdmin(handleDelete);
