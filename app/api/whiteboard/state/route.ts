import { NextRequest } from 'next/server';
import { getRoomState } from '../stream/route';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    const state = getRoomState(rawUuid);
    return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
  } catch (e) {
    console.error('[WB State] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
