import { NextRequest } from 'next/server';
import { broadcastToUuid } from '../stream/route';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid = 'default', event } = body as any;
    if (!event) return new Response(JSON.stringify({ ok: false, error: 'no event' }), { status: 400 });

    // Broadcast to connected SSE clients
    try { broadcastToUuid(uuid, event); } catch (e) {}

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
