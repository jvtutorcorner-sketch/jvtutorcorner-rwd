// GET /api/admin/cost/summary?scope=GLOBAL&month=yyyymm  (or ?scopeKey=LESSON#<id>)
// Reads the pre-aggregated cost-rollups (lib/ai/gateway/ledger.ts getRollup).
// Costs are micro-USD; we also return a NT$ convenience using FX_USD_TWD.
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { getRollup } from '@/lib/ai/gateway/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FX = Number.parseFloat(process.env.FX_USD_TWD || '32');

function musdToNt(musd: number): number {
  return Math.round(((musd / 1_000_000) * FX) * 100) / 100;
}

async function handleGet(req: Request) {
  const url = new URL(req.url);
  const explicit = url.searchParams.get('scopeKey');
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7).replace('-', '');
  const scope = url.searchParams.get('scope') || 'GLOBAL';

  // Which rollup scope keys to fetch.
  const keys: string[] = explicit
    ? [explicit]
    : scope === 'GLOBAL'
      ? [`GLOBAL#${month}`]
      : [`${scope}#${month}`];

  const rollups: Record<string, { total_musd: number; ai_musd: number; platform_musd: number; requests: number; total_nt: number } | null> = {};
  for (const k of keys) {
    const r = await getRollup(k);
    rollups[k] = r
      ? {
          total_musd: r.total_musd || 0,
          ai_musd: r.ai_musd || 0,
          platform_musd: r.platform_musd || 0,
          requests: r.requests || 0,
          total_nt: musdToNt(r.total_musd || 0),
        }
      : null;
  }
  return NextResponse.json({ ok: true, month, fx: FX, rollups });
}

export const GET = withAdmin(handleGet);
