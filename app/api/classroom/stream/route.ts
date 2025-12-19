import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid') || 'default';

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: any) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (e) {
          console.warn('Failed to enqueue message:', e);
        }
      };

      const unregister = registerClient(uuid, send);

      // Send initial connection message
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
        try {
          clearInterval(keepAliveInterval);
          unregister();
        } catch (e) {}
        try { controller.close(); } catch (e) {}
      };

      try {
        // @ts-ignore next-runtime signal
        const s = (req as any).signal;
        if (s && typeof s.addEventListener === 'function') {
          s.addEventListener('abort', onAbort);
        }
      } catch (e) {
        console.warn('Failed to set up abort listener:', e);
      }
    },
    cancel() {
      // noop — cleanup handled in start via abort
    },
  });

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
}
