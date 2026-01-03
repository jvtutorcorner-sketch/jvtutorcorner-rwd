import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid') || 'default';
  const encoder = new TextEncoder();

  console.log(`[SSE] Connection request for uuid=${uuid}`);

  try {
    const stream = new ReadableStream({
      start(controller) {
        console.log(`[SSE] Stream start for uuid=${uuid}`);
        
        const send = (payload: any) => {
          try {
            const data = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (e) {
            // Controller might be closed
          }
        };

        // Register this client
        let unregister: (() => void) | null = null;
        try {
          unregister = registerClient(uuid, send);
          console.log(`[SSE] Client registered for uuid=${uuid}`);
        } catch (err) {
          console.error(`[SSE] Failed to register client for uuid=${uuid}:`, err);
        }

        // Send initial connection message
        send({ type: 'connected', uuid, timestamp: Date.now() });

        // Keep-alive ping
        const keepAliveInterval = setInterval(() => {
          send({ type: 'ping', timestamp: Date.now() });
        }, 20000);

        const cleanup = () => {
          console.log(`[SSE] Cleaning up connection for uuid=${uuid}`);
          clearInterval(keepAliveInterval);
          if (unregister) {
            try { unregister(); } catch (e) {}
          }
          try { controller.close(); } catch (e) {}
        };

        if (req.signal) {
          req.signal.addEventListener('abort', cleanup);
        } else {
          // Fallback for environments without signal
          setTimeout(cleanup, 5 * 60 * 1000);
        }
      },
      cancel() {
        console.log(`[SSE] Stream cancelled for uuid=${uuid}`);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error(`[SSE] Critical error for uuid=${uuid}:`, error);
    return new Response(JSON.stringify({ error: 'SSE failed', message: error?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
