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
        } catch (e) {}
      };

      const unregister = registerClient(uuid, send);

      // When client disconnects, unregister and close controller
      const onAbort = () => {
        try { unregister(); } catch (e) {}
        try { controller.close(); } catch (e) {}
      };

      try {
        // @ts-ignore next-runtime signal
        const s = (req as any).signal;
        if (s && typeof s.addEventListener === 'function') s.addEventListener('abort', onAbort);
      } catch (e) {}
    },
    cancel() {
      // noop — unregister handled in start via abort
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
