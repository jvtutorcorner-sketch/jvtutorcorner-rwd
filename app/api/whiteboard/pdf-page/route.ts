import { NextRequest } from 'next/server';
import { broadcastToUuid, normalizeUuid } from '../stream/route';
import { getWhiteboardState, saveWhiteboardState } from '@/lib/whiteboardService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid: rawUuid, page } = body;
    const uuid = normalizeUuid(rawUuid);

    if (typeof page !== 'number' || page < 1) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid page number' }), { status: 400 });
    }

    // Get current state
    const currentState = await getWhiteboardState(uuid) || { strokes: [], pdf: null, updatedAt: 0 };
    
    if (!currentState.pdf) {
      return new Response(JSON.stringify({ ok: false, error: 'No PDF uploaded' }), { status: 400 });
    }

    // Update current page
    const updatedPdf = {
      ...currentState.pdf,
      currentPage: page
    };

    // Save to DynamoDB
    await saveWhiteboardState(uuid, currentState.strokes || [], updatedPdf);

    // Broadcast page change to all connected clients
    broadcastToUuid(uuid, {
      type: 'set-page',
      page: page
    });

    return new Response(JSON.stringify({ ok: true, page }), { status: 200 });
  } catch (e) {
    console.error('[PDF Page Change] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
