import { NextRequest, NextResponse } from 'next/server';

// POST /api/agora/whiteboard/close
// body: { uuid: string }

const NETLESS_API_BASE = process.env.NETLESS_API_BASE || 'https://api.netless.link';
const NETLESS_REGION = process.env.NETLESS_REGION || 'sg';
const NETLESS_SDK_TOKEN = process.env.NETLESS_SDK_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    if (!NETLESS_SDK_TOKEN) {
      return NextResponse.json({ error: 'NETLESS_SDK_TOKEN not configured' }, { status: 500 });
    }

    // Attempt to delete the room via Netless admin API
    const res = await fetch(`${NETLESS_API_BASE}/v5/rooms/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: {
        token: NETLESS_SDK_TOKEN,
        region: NETLESS_REGION,
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => String(res.status));
      return NextResponse.json({ error: 'Failed to delete room', detail: txt }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Whiteboard] /api/agora/whiteboard/close error:', err);
    return NextResponse.json({ error: 'Unexpected server error', detail: err?.message ?? String(err) }, { status: 500 });
  }
}
