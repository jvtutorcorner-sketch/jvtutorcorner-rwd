import { NextRequest } from 'next/server';
import { broadcastToUuid, normalizeUuid } from '../stream/route';
import { getWhiteboardState, saveWhiteboardState } from '@/lib/whiteboardService';

export async function POST(req: NextRequest) {
  try {
    // Read raw text once and parse robustly. Some Windows clients wrap JSON
    // in extra quotes which makes a direct JSON.parse fail.
    const text = await req.text();
    const now = Date.now();
    console.log(`[WB Event Server] [${new Date(now).toISOString()}] Raw body length:`, text?.length ?? 0);

    // ... (headers logging omitted for brevity in search, will include in replace) ...
    
    let body: any;
    try {
      body = JSON.parse(text);
    } catch (err) {
      const trimmed = (text || '').trim();
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        try {
          body = JSON.parse(trimmed.slice(1, -1));
        } catch (err2) {
          console.error('[WB Event Server] JSON parse failed after stripping quotes', { err: String(err), err2: String(err2) });
          return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 });
        }
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 });
      }
    }

    const { uuid: rawUuid = 'default', event } = body as any;
    const uuid = normalizeUuid(rawUuid); // Standardize early!

    if (!event) {
      return new Response(JSON.stringify({ ok: false, error: 'no event' }), { status: 400 });
    }
    
    // 1. IMPORTANT: Broadcast FIRST (this updates in-memory roomStates)
    try {
      broadcastToUuid(uuid, event);
    } catch (e) {
      console.warn('[WB Event Server] Broadcast failed:', e);
    }

    // 2. Update DynamoDB asynchronously/best-effort (don't block for long if possible)
    try {
      // Fetching current state from DynamoDB can be slow. 
      // Ideally we would use the in-memory state if we are the primary node.
      const currentState = await getWhiteboardState(uuid) || { strokes: [], pdf: null, updatedAt: 0 };
      let newStrokes = [...(currentState.strokes || [])];
      let newPdf = currentState.pdf || null;
      
      if (event.type === 'stroke-start') {
        if (event.stroke && event.stroke.id) newStrokes.push(event.stroke);
      } else if (event.type === 'stroke-update') {
        const idx = newStrokes.findIndex((s: any) => s.id === event.strokeId);
        if (idx >= 0) {
          newStrokes[idx] = { ...newStrokes[idx], points: event.points };
        } else {
          newStrokes.push({ id: event.strokeId, points: event.points, stroke: '#000', strokeWidth: 2, mode: 'draw' });
        }
      } else if (event.type === 'undo') {
        newStrokes = newStrokes.filter((s: any) => s.id !== event.strokeId);
      } else if (event.type === 'clear') {
        newStrokes = [];
      } else if (event.type === 'pdf-set') {
        newPdf = event.pdf || event;
      }
      
      await saveWhiteboardState(uuid, newStrokes, newPdf);
    } catch (e) {
      console.error('[WB Event Server] DynamoDB update failed:', { uuid, error: String(e) });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('[WB Event Server] Unexpected error:', String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
