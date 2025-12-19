import { NextRequest } from 'next/server';
import { broadcastToUuid } from '../stream/route';

export async function POST(req: NextRequest) {
  try {
    // Read raw text once and parse robustly. Some Windows clients wrap JSON
    // in extra quotes which makes a direct JSON.parse fail.
    const text = await req.text();
    console.log('[WB Event Server] Raw body length:', text?.length ?? 0);
    try { console.log('[WB Event Server] Raw body preview:', (text || '').slice(0, 200)); } catch (logErr) { console.warn('[WB Event Server] Raw body preview failed', String(logErr)); }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch (err) {
      const trimmed = (text || '').trim();
      // If body is wrapped in single or double quotes, strip them and retry.
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        try {
          body = JSON.parse(trimmed.slice(1, -1));
        } catch (err2) {
          console.error('[WB Event Server] JSON parse failed after stripping quotes', { err: String(err), err2: String(err2), preview: trimmed.slice(0, 200) });
          return new Response(JSON.stringify({ ok: false, error: 'invalid json', details: String(err2), rawPreview: trimmed.slice(0, 200) }), { status: 400 });
        }
      } else {
        console.error('[WB Event Server] JSON parse failed', err);
        return new Response(JSON.stringify({ ok: false, error: 'invalid json', details: String(err), rawPreview: (text || '').slice(0, 200) }), { status: 400 });
      }
    }

    const { uuid = 'default', event } = body as any;
    if (!event) {
      console.warn('[WB Event Server] Missing event in parsed body, preview:', (text || '').slice(0, 200));
      return new Response(JSON.stringify({ ok: false, error: 'no event', rawPreview: (text || '').slice(0, 200) }), { status: 400 });
    }
    console.log('[WB Event Server] Received event:', { uuid, eventType: event?.type });

    // Broadcast to connected SSE clients (best-effort)
    try {
      broadcastToUuid(uuid, event);
    } catch (e) {
      console.error('[WB Event Server] Broadcast failed:', e);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    const errStr = String(e);
    console.error('[WB Event Server] Unexpected error:', errStr);
    return new Response(JSON.stringify({ ok: false, error: errStr }), { status: 500 });
  }
}
