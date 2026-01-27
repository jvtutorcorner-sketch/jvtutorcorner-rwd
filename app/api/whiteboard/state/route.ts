import { NextRequest } from 'next/server';
import { getWhiteboardState } from '@/lib/whiteboardService';
import { roomStates, normalizeUuid } from '../stream/route';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    const uuid = normalizeUuid(rawUuid);
    
    // In serverless (Amplify/Lambda), roomStates is not shared across instances.
    // We MUST use DynamoDB as the source of truth for full state sync.
    // memory state is still useful as a cache or for local dev.
    
    let state: any = { strokes: [], pdf: null };
    let source = 'none';

    // 1. Fetch state from DynamoDB first (Strongly Consistent Read)
    try {
      const dbState = await getWhiteboardState(uuid);
      if (dbState) {
        state = dbState;
        source = 'dynamodb';
        // Hydrate memory cache for this specific instance
        roomStates.set(uuid, { strokes: dbState.strokes || [], pdf: dbState.pdf || null });
      } else {
        // 2. Fallback to memory if DB is empty/fails
        const memState = roomStates.get(uuid);
        if (memState) {
          state = memState;
          source = 'memory';
        }
      }
    } catch (e) {
      console.warn('[WB State] DB Fetch error, falling back to memory:', e);
      const memState = roomStates.get(uuid);
      if (memState) {
        state = memState;
        source = 'memory';
      }
    }

    // Safely serialize state to avoid throwing on circular references or huge data URLs.
    try {
      const MAX_STRING = 50000; // truncate extremely large strings (pdf dataUrls etc.)
      const seen = new WeakSet();
      const bodyText = JSON.stringify({ ok: true, state, source }, function (k, v) {
        if (typeof v === 'string' && v.length > MAX_STRING) return '(large-string)';
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
      return new Response(bodyText, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[WB State] Serialization failed for uuid=', uuid, e);
      // Fallback: return minimal safe state
      return new Response(JSON.stringify({ ok: true, state: { strokes: [], pdf: null }, source }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    console.error('[WB State] Unexpected Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
