import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
        let unregister: () => void;
        try {
          unregister = registerClient(uuid, send);
        } catch (e) {
          console.error('Failed to register client:', e);
          controller.error(e);
          return;
        }

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
          try {
            clearInterval(keepAliveInterval);
            if (unregister) unregister();
          } catch (e) {}
          try { controller.close(); } catch (e) {}
        };

        try {
          // @ts-ignore next-runtime signal
          const s = (req as any).signal;
          if (s && typeof s.addEventListener === 'function') {
            console.log('[SSE] setting up abort listener');
            s.addEventListener('abort', onAbort);
          } else {
            console.log('[SSE] no signal available, using timeout fallback');
            // Fallback: set a timeout to clean up after 5 minutes
            setTimeout(onAbort, 5 * 60 * 1000);
          }
        } catch (e) {
          console.warn('Failed to set up abort listener, using timeout fallback:', e);
          // Fallback: set a timeout to clean up after 5 minutes
          setTimeout(onAbort, 5 * 60 * 1000);
        }
      },
      cancel() {
        console.log('[SSE] ReadableStream cancel called');
        // noop — cleanup handled in start via abort
      },
    });

    console.log('[SSE] returning Response');
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('SSE route error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
