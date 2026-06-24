import { NextRequest } from 'next/server';
import { getWhiteboardState, normalizeUuid } from '@/lib/whiteboardService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    const uuid = normalizeUuid(rawUuid);
    
    // DynamoDB is the single source of truth in Lambda (stateless env — no shared in-memory state)
    let state: any = { strokes: [], pdf: null };
    let source = 'none';

    try {
      const dbState = await getWhiteboardState(uuid);
      if (dbState) {
        state = dbState;
        source = 'dynamodb';
      }
    } catch (e) {
      console.warn('[WB State] DB Fetch error:', e);
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
