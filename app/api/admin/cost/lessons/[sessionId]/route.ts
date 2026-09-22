// GET /api/admin/cost/lessons/<sessionId> — per-lesson AI/RTC cost meter.
// Reads the LESSON#<sessionId> rollup (lib/ai/gateway/ledger.ts).
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { getRollup } from '@/lib/ai/gateway/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FX = Number.parseFloat(process.env.FX_USD_TWD || '32');

async function handleGet(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const r = await getRollup(`LESSON#${sessionId}`);
  if (!r) return NextResponse.json({ ok: true, sessionId, rollup: null });
  return NextResponse.json({
    ok: true,
    sessionId,
    rollup: {
      total_musd: r.total_musd || 0,
      ai_musd: r.ai_musd || 0,
      platform_musd: r.platform_musd || 0,
      requests: r.requests || 0,
      total_nt: Math.round(((r.total_musd || 0) / 1_000_000) * FX * 100) / 100,
    },
  });
}

export const GET = withAdmin(handleGet);
