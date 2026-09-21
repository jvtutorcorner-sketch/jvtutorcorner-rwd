import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getWhiteboardState, saveWhiteboardState, normalizeUuid } from '@/lib/whiteboardService';

// 先前完全沒有 auth：白板的教材 PDF、房間狀態與事件端點任何人都能存取／改寫。
async function handlePost(req: AuthedRequest) {
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

    // Snapshot write: overwrite the single room item with the whole board. In
    // snapshot mode this is the ONLY write — one item per room, no per-stroke /
    // per-point event rows ever persisted (the DB stays a scene snapshot, not a log).
    if (event.type === 'snapshot') {
      try {
        await saveWhiteboardState(uuid, Array.isArray(event.strokes) ? event.strokes : [], event.pdf ?? null);
      } catch (e) {
        console.error('[WB Event Server] snapshot write failed:', { uuid, error: String(e) });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Append-only path (WB_APPEND_ONLY=1): one small item per stroke, so each
    // write is ~1 WCU regardless of board size (vs the legacy single-growing-item
    // model whose writes cost WCU ∝ board size).
    if (process.env.WB_APPEND_ONLY === '1') {
      try {
        const s = await import('@/lib/whiteboardStrokes');
        if (event.type === 'stroke-start' && event.stroke?.id) {
          await s.appendStroke(uuid, event.stroke);
        } else if (event.type === 'stroke-update') {
          await s.updateStrokePoints(uuid, event.strokeId, event.points);
        } else if (event.type === 'clear') {
          await s.clearStrokes(uuid);
        }
      } catch (e) {
        console.error('[WB Event Server] append-only path failed:', { uuid, error: String(e) });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Update DynamoDB using Atomic Operations to prevent race conditions in Lambda
    try {
      if (event.type === 'stroke-start') {
        if (event.stroke && event.stroke.id) {
          const { addStrokeAtomic } = await import('@/lib/whiteboardService');
          await addStrokeAtomic(uuid, event.stroke);
        }
      } else if (event.type === 'stroke-update') {
        const { updateStrokeInList } = await import('@/lib/whiteboardService');
        await updateStrokeInList(uuid, event.strokeId, event.points);
      } else if (event.type === 'undo' || event.type === 'clear' || event.type === 'pdf-set' || event.type === 'set-page') {
        // These are less frequent or require full state context, use the safer read-modify-write for now
        const currentState = await getWhiteboardState(uuid) || { strokes: [], pdf: null, updatedAt: 0 };
        let newStrokes = [...(currentState.strokes || [])];
        let newPdf = currentState.pdf || null;
        
        if (event.type === 'undo') {
          newStrokes = newStrokes.filter((s: any) => s.id !== event.strokeId);
        } else if (event.type === 'clear') {
          newStrokes = [];
        } else if (event.type === 'pdf-set') {
          newPdf = event.pdf || event;
        } else if (event.type === 'set-page') {
          if (newPdf) {
            newPdf.currentPage = event.page;
          }
        }
        await saveWhiteboardState(uuid, newStrokes, newPdf);
      }
    } catch (e) {
      console.error('[WB Event Server] DynamoDB update failed:', { uuid, error: String(e) });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('[WB Event Server] Unexpected error:', String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}

export const POST = withAuth(handlePost);
