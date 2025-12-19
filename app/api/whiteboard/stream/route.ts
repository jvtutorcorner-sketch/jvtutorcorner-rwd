import { NextRequest } from 'next/server';

// Simple in-memory map of uuid -> Set of response-like client objects
const clients: Map<string, Set<any>> = new Map();

// Store last broadcasted payload per uuid so new clients can catch up
const lastPayload: Map<string, any> = new Map();

function normalizeUuid(raw?: string | null) {
  if (!raw) return 'default';
  try {
    const dec = decodeURIComponent(raw);
    if (dec.startsWith('course_')) return dec;
    const m = dec.match(/[?&]courseId=([^&]+)/);
    if (m) return `course_${m[1]}`;
    return dec;
  } catch (e) {
    return raw || 'default';
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUuid = searchParams.get('uuid') || 'default';
  const uuid = normalizeUuid(rawUuid);
  console.log('[WB SSE Server] New client connecting, raw:', rawUuid, 'normalized:', uuid);

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const stream = new ReadableStream({
    start(controller) {
      // send connected ping
      controller.enqueue(encodeSSE({ type: 'connected', timestamp: Date.now() }));

      // Register client controller to clients map
      let set = clients.get(uuid);
      if (!set) { set = new Set(); clients.set(uuid, set); }
      const client = { controller };
      set.add(client);
      console.log(`[WB SSE Server] Client registered. UUID: ${uuid}, Total clients: ${set.size}`);

      // If we have a last payload for this uuid, send it so new clients can catch up
      try {
        const last = lastPayload.get(uuid);
        if (last) controller.enqueue(encodeSSE(last));
      } catch (e) {}

      // On cancel/close remove
      req.signal.addEventListener('abort', () => {
        try { 
          set!.delete(client); 
          console.log(`[WB SSE Server] Client disconnected. UUID: ${uuid}, Remaining: ${set!.size}`);
        } catch (e) {}
      });
    }
  });

  return new Response(stream, { headers });

  function encodeSSE(obj: any) {
    try { return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { return new TextEncoder().encode(`data: {}\n\n`); }
  }
}

// Helper used by POST route to broadcast
export function broadcastToUuid(uuid: string, payload: any) {
  const normalized = normalizeUuid(uuid);
  const set = clients.get(normalized) || clients.get(uuid);
  let preview = '';
  try { preview = JSON.stringify(payload).slice(0, 200); } catch (e) { preview = String(payload).slice(0, 200); }
  console.log(`[WB SSE Server] Broadcasting to uuid: ${uuid} (normalized: ${normalized}), clients: ${set?.size || 0}, event type: ${payload?.type}, preview: ${preview}`);
  if (!set) {
    console.log('[WB SSE Server] No clients connected for this uuid');
    return;
  }
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  let successCount = 0;
  for (const c of Array.from(set)) {
    try { 
      c.controller.enqueue(new TextEncoder().encode(msg)); 
      successCount++;
    } catch (e) { 
      console.error('[WB SSE Server] Failed to send to client:', e);
      try { set.delete(c); } catch (e) {} 
    }
  }
  console.log(`[WB SSE Server] Broadcast complete. Sent to ${successCount}/${set.size} clients`);

  try { lastPayload.set(normalized, payload); } catch (e) {}
}
