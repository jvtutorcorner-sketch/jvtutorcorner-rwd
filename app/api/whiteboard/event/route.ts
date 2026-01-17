import { NextRequest } from 'next/server';
import { broadcastToUuid } from '../stream/route';
import { getWhiteboardState, saveWhiteboardState } from '@/lib/whiteboardService';

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
    
    // Update State in DynamoDB (Persistence)
    try {
      const currentState = await getWhiteboardState(uuid) || { strokes: [], pdf: null, updatedAt: 0 };
      const newState = { ...currentState };
      const beforeCount = newState.strokes.length;
      
      if (event.type === 'stroke-start') {
        if (!event.stroke || !event.stroke.id) {
          console.warn('[WB Event Server] Invalid stroke-start: missing stroke or stroke.id', { event, uuid });
        } else {
          newState.strokes.push(event.stroke);
          console.log('[WB Event Server] Added stroke-start:', { uuid, strokeId: event.stroke.id, totalStrokes: newState.strokes.length });
        }
      } else if (event.type === 'stroke-update') {
        const idx = newState.strokes.findIndex((s: any) => s.id === event.strokeId);
        if (idx >= 0) {
          newState.strokes[idx].points = event.points;
          console.log('[WB Event Server] Updated stroke:', { uuid, strokeId: event.strokeId, pointCount: event.points.length });
        } else {
          // Fallback: create if missing
          newState.strokes.push({ id: event.strokeId, points: event.points, stroke: '#000', strokeWidth: 2, mode: 'draw' });
          console.warn('[WB Event Server] Stroke not found, created fallback:', { uuid, strokeId: event.strokeId });
        }
      } else if (event.type === 'undo') {
        const beforeUndo = newState.strokes.length;
        newState.strokes = newState.strokes.filter((s: any) => s.id !== event.strokeId);
        console.log('[WB Event Server] Undo:', { uuid, strokeId: event.strokeId, before: beforeUndo, after: newState.strokes.length });
      } else if (event.type === 'clear') {
        console.log('[WB Event Server] Clear all strokes:', { uuid, strokesCleared: newState.strokes.length });
        newState.strokes = [];
      } else if (event.type === 'pdf-set') {
        newState.pdf = event.pdf || event;
        console.log('[WB Event Server] PDF set:', { uuid, pdfName: event.pdf?.name || 'unknown' });
      } else {
        console.log('[WB Event Server] Unrecognized event type:', { uuid, eventType: event.type });
      }
      
      if (newState.strokes.length !== beforeCount) {
        console.log('[WB Event Server] State changed after event:', { uuid, strokesBefore: beforeCount, strokesAfter: newState.strokes.length });
      }
      
      await saveWhiteboardState(uuid, newState.strokes, newState.pdf);
    } catch (e) {
      console.error('[WB Event Server] Failed to update DynamoDB state:', { uuid, error: String(e), eventType: event?.type });
    }

    // Broadcast to connected SSE clients (best-effort)
    try {
      broadcastToUuid(uuid, event);
    } catch (e) {}

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    const errStr = String(e);
    console.error('[WB Event Server] Unexpected error:', errStr);
    return new Response(JSON.stringify({ ok: false, error: errStr }), { status: 500 });
  }
}
