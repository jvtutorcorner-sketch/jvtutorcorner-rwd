import { NextRequest } from 'next/server';
import { getWhiteboardState } from '@/lib/whiteboardService';
import { roomStates, normalizeUuid } from '../stream/route';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    const uuid = normalizeUuid(rawUuid);
    
    // 1. Try fetching from in-memory state FIRST (for fastest sync and resilient to DynamoDB failure)
    const memState = roomStates.get(uuid);
    if (memState && memState.strokes && memState.strokes.length > 0) {
      console.log(`[WB State] Found in-memory state for ${uuid}: ${memState.strokes.length} strokes`);
      return new Response(JSON.stringify({ ok: true, state: memState, source: 'memory' }), { status: 200 });
    }

    // 2. Fetch state from DynamoDB as fallback
    try {
      const dbState = await getWhiteboardState(uuid);
      if (dbState) {
        // Cache back to memory for next poll
        if (!roomStates.has(uuid)) {
           roomStates.set(uuid, { strokes: dbState.strokes || [], pdf: dbState.pdf || null });
        }
        return new Response(JSON.stringify({ ok: true, state: dbState, source: 'dynamodb' }), { status: 200 });
      }
    } catch (dbErr) {
      console.warn('[WB State] DynamoDB fetch failed:', dbErr);
      // continue to return empty instead of 500
    }
    
    // Return empty state if nothing found
    return new Response(JSON.stringify({ ok: true, state: memState || { strokes: [], pdf: null }, source: 'empty' }), { status: 200 });
  } catch (e) {
    console.error('[WB State] Unexpected Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
