import { NextRequest } from 'next/server';
import { getWhiteboardState } from '@/lib/whiteboardService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    
    // Fetch state from DynamoDB instead of in-memory
    const state = await getWhiteboardState(rawUuid);
    
    return new Response(JSON.stringify({ ok: true, state: state || { strokes: [], pdf: null } }), { status: 200 });
  } catch (e) {
    console.error('[WB State] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
