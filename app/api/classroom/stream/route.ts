import { NextRequest } from 'next/server';
import { registerClient } from '@/lib/classroomSSE';

export const dynamic = 'force-dynamic';
// NOTE: Setting runtime to 'edge' is not a solution here because the in-memory `clients` map
// in `classroomSSE.ts` would still not be shared across different edge function instances.
// The fundamental issue is the lack of a shared state store (like Redis), not the runtime environment.
export const runtime = 'nodejs';

// The original SSE implementation, now isolated into a separate function.
// This function should only be called in a local development environment.
async function runDevSse(req: NextRequest) {
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
        console.log(`[SSE-DEV] Stream starting for uuid: ${uuid}`);

        const send = (payload: any) => {
          try {
            const data = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (e) {
            console.warn(`[SSE-DEV] Failed to send data for uuid: ${uuid}. Controller may be closed.`, e);
          }
        };

        let unregister: (() => void) | null = null;
        
        const cleanup = () => {
          console.log(`[SSE-DEV] Cleaning up connection for uuid: ${uuid}`);
          clearInterval(keepAliveInterval);
          if (unregister) {
            try {
              unregister();
            } catch (e) {
              console.error(`[SSE-DEV] Error during unregister for uuid ${uuid}:`, e);
            }
          }
          if (controller.desiredSize !== null) {
              try {
                controller.close();
              } catch(e) {
                console.error(`[SSE-DEV] Error closing controller for uuid ${uuid}:`, e);
              }
          }
        };

        try {
          unregister = registerClient(uuid, send);
          console.log(`[SSE-DEV] Client registered for uuid: ${uuid}`);
        } catch (err) {
          console.error(`[SSE-DEV] CRITICAL: Failed to register client for uuid: ${uuid}.`, err);
          cleanup();
          return;
        }
        
        req.signal.addEventListener('abort', cleanup);
        send({ type: 'connected', uuid, timestamp: Date.now() });

        const keepAliveInterval = setInterval(() => {
          send({ type: 'ping', timestamp: Date.now() });
        }, 20000);
      },
      cancel(reason) {
        console.log(`[SSE-DEV] Stream explicitly cancelled. Reason:`, reason);
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
    console.error(`[SSE-DEV] Fatal error creating stream for uuid=${uuid}:`, error);
    return new Response(JSON.stringify({ error: 'SSE setup failed', message: error?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// The new GET handler for the /api/classroom/stream route.
export async function GET(req: NextRequest) {
  // In a serverless/production environment, SSE with in-memory state is not viable.
  // Immediately return a non-streaming error response to prevent infrastructure errors
  // on platforms like Amplify that may not handle Node.js streaming well.
  // This allows the client to gracefully fall back to its polling mechanism.
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'SSE is not supported in this server environment. Please use polling.' }), {
      status: 503, // Use 503 to indicate the service is intentionally unavailable.
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // In local development, use the original SSE implementation.
  return runDevSse(req);
}
