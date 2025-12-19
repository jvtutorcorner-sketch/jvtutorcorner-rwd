import { NextRequest, NextResponse } from 'next/server';

// Create or return an Agora-compatible whiteboard room and room token.
// POST /api/agora/whiteboard
// body: { uuid?: string, name?: string, role?: 'admin'|'writer'|'reader', lifespanMs?: number }

const NETLESS_API_BASE = process.env.NETLESS_API_BASE || 'https://api.netless.link';
const NETLESS_REGION = process.env.NETLESS_REGION || 'sg';
const NETLESS_SDK_TOKEN = process.env.NETLESS_SDK_TOKEN; // optional

const AGORA_WB_AK = process.env.AGORA_WB_AK;
const AGORA_WB_SK = process.env.AGORA_WB_SK;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid: incomingUuid, name = 'Classroom Room', role = 'writer', lifespanMs = 0 } = body || {};

    let uuid = incomingUuid;

    // Debug: Log environment variables (remove after debugging)
    console.log('[Whiteboard API] Environment check:', {
      hasSdkToken: !!NETLESS_SDK_TOKEN,
      sdkTokenLength: NETLESS_SDK_TOKEN?.length,
      hasWbAk: !!AGORA_WB_AK,
      hasWbSk: !!AGORA_WB_SK,
      region: NETLESS_REGION,
      apiBase: NETLESS_API_BASE
    });

    // 1) create room if uuid not provided and SDK token available
    if (!uuid) {
      if (!NETLESS_SDK_TOKEN) {
        console.error('[Whiteboard API] NETLESS_SDK_TOKEN not found in environment');
        return NextResponse.json({ error: 'No uuid provided and NETLESS_SDK_TOKEN not configured to create a room' }, { status: 400 });
      }

      // Try creating room. Some Netless deployments disallow certain fields like `name`.
      let createRoomRes = await fetch(`${NETLESS_API_BASE}/v5/rooms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          token: NETLESS_SDK_TOKEN,
          region: NETLESS_REGION,
        },
        body: JSON.stringify({ name, isRecord: false, limit: 0 }),
      });

      if (!createRoomRes.ok) {
        // inspect error; if server rejects `name`, retry with minimal payload
        const txt = await createRoomRes.text();
        console.warn('[Whiteboard] Create room initial attempt failed, retrying with minimal payload:', createRoomRes.status, txt);

        createRoomRes = await fetch(`${NETLESS_API_BASE}/v5/rooms`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            token: NETLESS_SDK_TOKEN,
            region: NETLESS_REGION,
          },
          body: JSON.stringify({}),
        });
      }

      if (!createRoomRes.ok) {
        const txt = await createRoomRes.text();
        console.error('[Whiteboard] Create room failed:', createRoomRes.status, txt);
        return NextResponse.json({ error: 'Failed to create room', detail: txt }, { status: 500 });
      }

      const roomInfo = await createRoomRes.json();
      uuid = roomInfo.uuid;
    }

    // 2) generate room token
    let roomToken: string | null = null;

    // Prefer server-side generation using AGORA_WB_AK/AGORA_WB_SK via available helper packages
    if (AGORA_WB_AK && AGORA_WB_SK) {
      try {
        // try common netless-token packages (they often support createToken with appId/secret)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let mod: any = null;
        const tryRequire = (name: string) => {
          try {
            // eslint-disable-next-line no-eval
            return eval('require')(name);
          } catch (e) {
            return null;
          }
        };

        mod = tryRequire('netless-token') || tryRequire('@netless/token') || tryRequire('@netless/netless-token');

        if (mod) {
          const fn = (mod.default || mod.createToken || mod.generateToken || mod.generateRoomToken || mod.generate) as any;
          if (typeof fn === 'function') {
            const maybe = await fn({
              uuid,
              role,
              lifespan: lifespanMs,
              appId: AGORA_WB_AK,
              secret: AGORA_WB_SK,
              region: NETLESS_REGION,
            });

            roomToken = typeof maybe === 'string' ? maybe : (maybe && (maybe.token || maybe.roomToken)) || null;
          }
        }
      } catch (err) {
        console.warn('[Whiteboard] local token generation with AGORA_WB_AK/SK failed', err);
        roomToken = null;
      }
    }

    // fallback: use NETLESS_SDK_TOKEN to request token from Netless admin
    if (!roomToken) {
      if (!NETLESS_SDK_TOKEN) {
        return NextResponse.json({ error: 'Cannot generate room token: AGORA_WB_AK/AGORA_WB_SK or NETLESS_SDK_TOKEN required' }, { status: 500 });
      }

      const createTokenRes = await fetch(`${NETLESS_API_BASE}/v5/tokens/rooms/${uuid}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          token: NETLESS_SDK_TOKEN,
          region: NETLESS_REGION,
        },
        body: JSON.stringify({ lifespan: lifespanMs, role }),
      });

      if (!createTokenRes.ok) {
        const txt = await createTokenRes.text();
        console.error('[Whiteboard] Create room token failed:', createTokenRes.status, txt);
        return NextResponse.json({ error: 'Failed to generate room token', detail: txt }, { status: 500 });
      }

      roomToken = await createTokenRes.text();
    }

    // sanitize token: some backends return quoted string
    if (typeof roomToken === 'string') {
      roomToken = roomToken.trim();
      const m = roomToken.match(/^"([\s\S]*)"$/);
      if (m) roomToken = m[1];
    }

    // use NETLESS_APP_ID as whiteboard app identifier, fallback to AGORA_WB_AK if not set
    const whiteboardAppId = process.env.NETLESS_APP_ID || AGORA_WB_AK || null;

    console.log('[Whiteboard API] Returning:', { whiteboardAppId, uuid, hasRoomToken: !!roomToken, region: NETLESS_REGION });

    return NextResponse.json({ whiteboardAppId, uuid, roomToken, region: NETLESS_REGION });
  } catch (err: any) {
    console.error('[Whiteboard] /api/agora/whiteboard error:', err);
    return NextResponse.json({ error: 'Unexpected server error', detail: err?.message ?? String(err) }, { status: 500 });
  }
}
