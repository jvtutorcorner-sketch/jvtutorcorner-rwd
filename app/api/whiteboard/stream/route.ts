import { NextRequest } from 'next/server';

// Simple in-memory map of uuid -> array of response-like objects
const clients: Map<string, Set<any>> = new Map();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uuid = searchParams.get('uuid') || 'default';

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

      // On cancel/close remove
      req.signal.addEventListener('abort', () => {
        try { set!.delete(client); } catch (e) {}
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
  const set = clients.get(uuid);
  if (!set) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of Array.from(set)) {
    try { c.controller.enqueue(new TextEncoder().encode(msg)); } catch (e) { try { set.delete(c); } catch (e) {} }
  }
}
