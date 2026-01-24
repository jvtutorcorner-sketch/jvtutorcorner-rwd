import { NextRequest } from 'next/server';
import { broadcastToUuid, normalizeUuid } from '../stream/route';
import { getWhiteboardState, saveWhiteboardState } from '@/lib/whiteboardService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid: rawUuid, pdf } = body;
    const uuid = normalizeUuid(rawUuid);

    if (!pdf) {
      return new Response(JSON.stringify({ ok: false, error: 'No PDF data' }), { status: 400 });
    }

    // Get current state
    const currentState = await getWhiteboardState(uuid) || { strokes: [], pdf: null, updatedAt: 0 };
    
    // Update PDF in state
    const pdfData = {
      name: pdf.name,
      data: pdf.data,
      size: pdf.size,
      type: pdf.type,
      currentPage: 1,
      uploadedAt: Date.now()
    };

    // Save to DynamoDB
    await saveWhiteboardState(uuid, currentState.strokes || [], pdfData);

    // Broadcast to all connected clients
    broadcastToUuid(uuid, {
      type: 'pdf-uploaded',
      pdf: pdfData
    });

    return new Response(JSON.stringify({ ok: true, pdf: pdfData }), { status: 200 });
  } catch (e) {
    console.error('[PDF Upload] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const rawUuid = url.searchParams.get('uuid');
    const uuid = normalizeUuid(rawUuid);

    const state = await getWhiteboardState(uuid);
    const pdf = state?.pdf || null;

    return new Response(JSON.stringify({ ok: true, pdf }), { status: 200 });
  } catch (e) {
    console.error('[PDF Get] Error:', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}
