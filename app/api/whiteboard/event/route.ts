import { NextRequest } from 'next/server';
import { broadcastToUuid, getRoomState } from '../stream/route';

export async function POST(req: NextRequest) {
  try {
    // Read raw text once and parse robustly. Some Windows clients wrap JSON
    // in extra quotes which makes a direct JSON.parse fail.
    const text = await req.text();
    const now = Date.now();
    console.log(`[WB Event Server] [${new Date(now).toISOString()}] Raw body length:`, text?.length ?? 0);
    try { console.log('[WB Event Server] Raw body preview:', (text || '').slice(0, 400)); } catch (logErr) { console.warn('[WB Event Server] Raw body preview failed', String(logErr)); }

    // Log some request metadata (safe, non-sensitive headers only)
    try {
      const hdr = req.headers;
      const headerPreview: Record<string,string|null> = {
        host: hdr.get('host'),
        'x-forwarded-for': hdr.get('x-forwarded-for'),
        'x-real-ip': hdr.get('x-real-ip'),
        via: hdr.get('via'),
        'user-agent': hdr.get('user-agent')?.slice(0,200) ?? null,
        referer: hdr.get('referer')?.slice(0,200) ?? null,
      };
      console.log('[WB Event Server] Request headers preview:', headerPreview);
      // Also log query params if present
      try {
        const qs = new URL(req.url).searchParams.toString();
        if (qs) console.log('[WB Event Server] Query params:', qs);
      } catch (e) {}
    } catch (e) {
      console.warn('[WB Event Server] Failed to read headers for debug', e);
    }

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
    console.log('[WB Event Server] Raw uuid from client:', uuid);
    try {
      // Log a concise event summary without dumping large payloads
      const evtSummary: any = { type: event?.type, clientId: event?.clientId ?? event?.clientID ?? null };
      if (event?.type === 'stroke-start' && event.stroke) {
        evtSummary.strokeId = event.stroke.id || null;
        evtSummary.points = Array.isArray(event.stroke.points) ? event.stroke.points.length / 2 : null;
      } else if (event?.type === 'stroke-update') {
        evtSummary.strokeId = event.strokeId || null;
        evtSummary.points = Array.isArray(event.points) ? event.points.length / 2 : null;
      } else if (event?.type === 'pdf-set' || event?.type === 'pdf') {
        // Avoid logging large data URLs; log length instead
        if (event.pdf?.dataUrl) evtSummary.pdfDataUrlLength = String(event.pdf.dataUrl).length;
        if (event.dataUrl) evtSummary.pdfDataUrlLength = String(event.dataUrl).length;
        evtSummary.pdfName = event.name || event.pdf?.name || null;
      }
      console.log('[WB Event Server] Received event summary:', { uuid, ...evtSummary });
    } catch (e) {
      console.warn('[WB Event Server] Failed to summarize event for logs', e);
    }

    // Broadcast to connected SSE clients (best-effort) and log how many clients received it
    try {
      const sent = broadcastToUuid(uuid, event);
      console.log(`[WB Event Server] broadcastToUuid sent=${sent} for uuid=${uuid}, eventType=${event?.type}`);
      try {
        // diagnostic: log current in-memory room state summary so server logs
        const state = getRoomState(uuid);
        const lastEvent = (state as any)?.lastEvent ?? null;
        console.log('[WB Event Server] Post-broadcast room state summary:', { uuid, strokes: Array.isArray(state?.strokes) ? state.strokes.length : 0, lastEvent });
      } catch (e) {
        console.warn('[WB Event Server] Failed to read room state for diagnostic', e);
      }
    } catch (e) {
      console.error('[WB Event Server] Broadcast failed:', e && (e as Error).stack ? (e as Error).stack : e);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    const errStr = String(e);
    console.error('[WB Event Server] Unexpected error:', errStr);
    return new Response(JSON.stringify({ ok: false, error: errStr }), { status: 500 });
  }
}
