import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('[SSE] GET request received');
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid') || 'default';

    console.log('[SSE] creating ReadableStream');
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        console.log('[SSE] ReadableStream start called');
        const send = (payload: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch (e) {
            console.warn('Failed to enqueue message:', e);
          }
        };

        console.log('[SSE] registering client');
        const unregister = registerClient(uuid, send);

        // Send initial connection message
        console.log('[SSE] sending initial connection message');
        send({ type: 'connected', uuid, timestamp: Date.now() });

        // Set up keep-alive ping every 30 seconds
        const keepAliveInterval = setInterval(() => {
          try {
            send({ type: 'ping', timestamp: Date.now() });
          } catch (e) {
            console.warn('Keep-alive ping failed:', e);
            clearInterval(keepAliveInterval);
          }
        }, 30000);

        // When client disconnects, unregister and close controller
        const onAbort = () => {
          console.log('[SSE] client disconnecting, cleaning up');
          clearInterval(keepAliveInterval);
          if (unregister) unregister();
          try { controller.close(); } catch (e) {}
        };

        if (req.signal) {
          console.log('[SSE] setting up abort listener');
          req.signal.addEventListener('abort', onAbort);
        } else {
          console.log('[SSE] no signal available, using timeout fallback');
          setTimeout(onAbort, 5 * 60 * 1000);
        }
      },
      cancel() {
        console.log('[SSE] ReadableStream cancel called');
      },
    });

    console.log('[SSE] returning Response');
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    try {
      const err: any = error;
      const errorId = (typeof (globalThis as any).crypto?.randomUUID === 'function') ? (globalThis as any).crypto.randomUUID() : `err-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      console.error(`[SSE] ErrorId=${errorId} RequestURL=${req?.url ?? 'unknown'} Error:`, err && err.stack ? err.stack : err);
      // Returning a small JSON payload with masked message and errorId helps correlate logs.
      const payload = JSON.stringify({ message: 'SSE server error', errorId });
      return new Response(payload, { status: 500, headers: { 'Content-Type': 'application/json' } });
    } catch (logErr) {
      console.error('[SSE] Failed while logging error:', logErr);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}
