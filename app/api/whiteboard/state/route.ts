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

    return new Response(JSON.stringify({ ok: true, state, source }), { status: 200 });
  } catch (e) {
    console.error('[WB State] Unexpected Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
