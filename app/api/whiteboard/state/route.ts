import { NextRequest } from 'next/server';
import { getRoomState } from '../stream/route';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    try {
      const headerPreview: Record<string,string|null> = {
        host: req.headers.get('host'),
        'x-forwarded-for': req.headers.get('x-forwarded-for'),
        'user-agent': req.headers.get('user-agent')?.slice(0,200) ?? null,
      };
      console.log('[WB State] GET state request for uuid:', rawUuid, 'headers:', headerPreview);
    } catch (e) {
      console.warn('[WB State] Failed to build header preview', e);
    }
    const state = getRoomState(rawUuid);
    return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
  } catch (e) {
    console.error('[WB State] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
