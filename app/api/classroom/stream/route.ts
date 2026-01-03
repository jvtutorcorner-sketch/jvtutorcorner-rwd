import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid');
  
  if (!uuid) {
    return new Response(JSON.stringify({ error: 'Missing uuid parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  try {
    const stream = new ReadableStream({
      start(controller) {
        console.log(`[SSE] Stream starting for uuid: ${uuid}`);

        const send = (payload: any) => {
          try {
            const data = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (e) {
            // This can happen if the client disconnects abruptly.
            // The cleanup function will handle unregistering.
            console.warn(`[SSE] Failed to send data for uuid: ${uuid}. Controller may be closed.`, e);
          }
        };

        let unregister: (() => void) | null = null;
        
        const cleanup = () => {
          console.log(`[SSE] Cleaning up connection for uuid: ${uuid}`);
          clearInterval(keepAliveInterval);
          if (unregister) {
            try {
              unregister();
            } catch (e) {
              console.error(`[SSE] Error during unregister for uuid ${uuid}:`, e);
            }
          }
          // It's important to check if the controller is still active before closing.
          // Closing an already-closed controller can throw an error.
          if (controller.desiredSize !== null) {
              try {
                controller.close();
              } catch(e) {
                console.error(`[SSE] Error closing controller for uuid ${uuid}:`, e);
              }
          }
        };

        try {
          unregister = registerClient(uuid, send);
          console.log(`[SSE] Client registered for uuid: ${uuid}`);
        } catch (err) {
          console.error(`[SSE] CRITICAL: Failed to register client for uuid: ${uuid}.`, err);
          // If registration fails, we can't proceed. Close the stream.
          cleanup();
          return;
        }
        
        // Listen for the client disconnecting
        req.signal.addEventListener('abort', cleanup);

        // Send a confirmation message
        send({ type: 'connected', uuid, timestamp: Date.now() });

        // Keep the connection alive with periodic pings
        const keepAliveInterval = setInterval(() => {
          send({ type: 'ping', timestamp: Date.now() });
        }, 20000);

      },
      cancel(reason) {
        // This is called if the stream is cancelled programmatically or by the client.
        console.log(`[SSE] Stream explicitly cancelled for uuid: ${uuid}. Reason:`, reason);
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error(`[SSE] Fatal error creating stream for uuid=${uuid}:`, error);
    return new Response(JSON.stringify({ error: 'SSE setup failed', message: error?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
