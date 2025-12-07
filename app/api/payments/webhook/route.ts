import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, status } = body || {};

    if (!orderId || !status) {
      return NextResponse.json({ ok: false, error: 'orderId and status required' }, { status: 400 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const data = await res.json().catch(() => ({}));

    return NextResponse.json({ ok: true, proxied: data }, { status: 200 });
  } catch (err) {
    console.error('[payments webhook] error:', err);
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 500 });
  }
}
