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
  try {
    const { searchParams } = new URL(req.url);
    const rawUuid = searchParams.get('uuid') || 'default';
    const uuid = normalizeUuid(rawUuid);
    console.log('[WB SSE Server] New client connecting, raw:', rawUuid, 'normalized:', uuid);

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Ensure a ReadableStream implementation is available in this runtime.
    let RS: any = (globalThis as any).ReadableStream;
    if (!RS) {
      try {
        const mod = await import('stream/web');
        RS = mod.ReadableStream;
      } catch (e) {
        console.warn('[WB SSE Server] stream/web import failed:', e);
      }
    }

    if (!RS) {
      console.error('[WB SSE Server] No ReadableStream available in this runtime; cannot open SSE stream.');
      return new Response('Server does not support SSE in this runtime', { status: 500 });
    }

    function encodeSSE(obj: any) {
      try { return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { return new TextEncoder().encode(`data: {}\n\n`); }
    }

    const stream = new RS({
      start(controller: any) {
        // send connected ping
        try { controller.enqueue(encodeSSE({ type: 'connected', timestamp: Date.now() })); } catch (e) {}

        // Register client controller to clients map
        let set = clients.get(uuid);
        if (!set) { set = new Set(); clients.set(uuid, set); }
        const client = { controller };
        set.add(client);
        try { console.log(`[WB SSE Server] Client registered. UUID: ${uuid}, Total clients: ${set.size}`); } catch (e) {}

        // If we have a last payload for this uuid, send it so new clients can catch up
        try {
          const last = lastPayload.get(uuid);
          if (last) {
            if (last.type === 'pdf-set' && typeof last.dataUrl === 'string' && last.dataUrl.length > 20000) {
              try { controller.enqueue(encodeSSE({ type: 'state-available', stateType: 'pdf-set' })); } catch (e) {}
            } else {
              try { controller.enqueue(encodeSSE(last)); } catch (e) {}
            }
          }
        } catch (e) {}

        // On cancel/close remove (guard if signal exists)
        try {
          if (req.signal && typeof (req.signal as any).addEventListener === 'function') {
            (req.signal as any).addEventListener('abort', () => {
              try {
                set!.delete(client);
                console.log(`[WB SSE Server] Client disconnected. UUID: ${uuid}, Remaining: ${set!.size}`);
              } catch (e) {}
            });
          }
        } catch (e) {}
      }
    });

    return new Response(stream, { headers });
  } catch (err: any) {
    console.error('[WB SSE Server] GET handler error:', err);
    try { console.error(err?.stack ?? String(err)); } catch (_) {}
    return new Response('Internal server error', { status: 500 });
  }

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

  try {
    // avoid storing massive data URLs in-memory; keep a lightweight manifest instead
    let toStore = payload;
    if (payload && payload.type === 'pdf-set' && typeof payload.dataUrl === 'string' && payload.dataUrl.length > 20000) {
      toStore = { type: 'pdf-set', name: payload.name, size: payload.dataUrl.length, large: true };
    }
    lastPayload.set(normalized, toStore);
  } catch (e) {}
}
