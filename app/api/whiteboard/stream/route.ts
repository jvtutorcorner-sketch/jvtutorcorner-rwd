import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simple in-memory map of uuid -> Set of response-like client objects
const clients: Map<string, Set<any>> = new Map();

// Store full state per uuid so new clients can catch up
// state: { strokes: any[], pdf: any | null }
const roomStates: Map<string, { strokes: any[], pdf: any | null }> = new Map();

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
    const urlObj = new URL(req.url);
    const { searchParams } = urlObj;
    const rawUuid = searchParams.get('uuid') || 'default';
    const uuid = normalizeUuid(rawUuid);
    console.log('[WB SSE Server] New client connecting, raw:', rawUuid, 'normalized:', uuid);

    // In production hosts (Amplify) streaming often fails. Return a
    // single connected SSE payload (so EventSource opens cleanly) and
    // let clients fall back to polling/state fetch instead of keeping
    // a long-lived stream.
    const host = urlObj.hostname || '';
    if (host.endsWith('jvtutorcorner.com')) {
      try {
        const single = `data: ${JSON.stringify({ type: 'connected', uuid, timestamp: Date.now() })}\n\n`;
        return new Response(single, { headers });
      } catch (e) {
        console.warn('[WB SSE Server] Production short-response failed, continuing to stream fallback', e);
      }
    }

    // Note: avoid setting explicit `Connection` header because some
    // serverless/proxy environments (Amplify/CDN) reject or buffer
    // streaming responses when that header is present.
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    function encodeSSE(obj: any) {
      try { return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { return new TextEncoder().encode(`data: {}\n\n`); }
    }

    const stream = new ReadableStream({
      start(controller) {
        // send connected ping
        try { controller.enqueue(encodeSSE({ type: 'connected', timestamp: Date.now() })); } catch (e) {}

        // Register client controller to clients map
        let set = clients.get(uuid);
        if (!set) { set = new Set(); clients.set(uuid, set); }
        const client = { controller };
        set.add(client);
        try { console.log(`[WB SSE Server] Client registered. UUID: ${uuid}, Total clients: ${set.size}`); } catch (e) {}

        // Send full initial state to the new client
        try {
          const state = roomStates.get(uuid);
          if (state) {
            controller.enqueue(encodeSSE({ type: 'init-state', strokes: state.strokes, pdf: state.pdf }));
          }
        } catch (e) {
          console.error('[WB SSE Server] Failed to send initial state:', e);
        }

        // On cancel/close remove (guard if signal exists)
        if (req.signal) {
          req.signal.addEventListener('abort', () => {
            try {
              set!.delete(client);
              console.log(`[WB SSE Server] Client disconnected. UUID: ${uuid}, Remaining: ${set!.size}`);
            } catch (e) {}
          });
        }
      }
    });

    return new Response(stream, { headers });
  } catch (err: any) {
    try {
      const errorId = (typeof (globalThis as any).crypto?.randomUUID === 'function') ? (globalThis as any).crypto.randomUUID() : `err-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      console.error(`[WB SSE Server] ErrorId=${errorId} RequestURL=${req?.url ?? 'unknown'} Error:`, err && err.stack ? err.stack : err);
      const payload = JSON.stringify({ message: 'SSE server error', errorId });
      return new Response(payload, { status: 500, headers: { 'Content-Type': 'application/json' } });
    } catch (logErr) {
      console.error('[WB SSE Server] Failed while logging error:', logErr);
      return new Response('Internal server error', { status: 500 });
    }
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
    // Update in-memory state for persistence on refresh
    let state = roomStates.get(normalized);
    if (!state) {
      state = { strokes: [], pdf: null };
      roomStates.set(normalized, state);
    }

    if (payload.type === 'stroke-start') {
      state.strokes.push(payload.stroke);
    } else if (payload.type === 'stroke-update') {
      const idx = state.strokes.findIndex((s: any) => s.id === payload.strokeId);
      if (idx >= 0) {
        state.strokes[idx].points = payload.points;
      } else {
        // Fallback: if update arrives before start, create it
        state.strokes.push({ id: payload.strokeId, points: payload.points, stroke: '#000', strokeWidth: 2, mode: 'draw' });
      }
    } else if (payload.type === 'undo') {
      state.strokes = state.strokes.filter((s: any) => s.id !== payload.strokeId);
    } else if (payload.type === 'clear') {
      state.strokes = [];
    } else if (payload.type === 'pdf-set') {
      // avoid storing massive data URLs in-memory; keep a lightweight manifest instead
      if (payload.dataUrl && payload.dataUrl.length > 50000) {
        state.pdf = { ...payload, dataUrl: '(large-data-url)', large: true };
      } else {
        state.pdf = payload;
      }
    }
  } catch (e) {
    console.error('[WB SSE Server] State update failed:', e);
  }
}

// Export helper to read in-memory state for external routes
export function getRoomState(rawUuid?: string | null) {
  try {
    const normalized = normalizeUuid(rawUuid);
    const state = roomStates.get(normalized);
    if (!state) return { strokes: [], pdf: null };
    return state;
  } catch (e) {
    return { strokes: [], pdf: null };
  }
}
