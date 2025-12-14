// app/api/netless/room/route.ts
import { NextRequest, NextResponse } from 'next/server';

const NETLESS_SDK_TOKEN = process.env.NETLESS_SDK_TOKEN;
const NETLESS_REGION = process.env.NETLESS_REGION || 'sg'; // cn-hz / us-sv / eu / in-mum / sg 等
const NETLESS_API_BASE =
  process.env.NETLESS_API_BASE || 'https://api.netless.link';

// Optional local token generation (preferred if you can provide app id/secret)
const NETLESS_APP_ID = process.env.NETLESS_APP_ID;
const NETLESS_APP_SECRET = process.env.NETLESS_APP_SECRET;

// Warn if neither server-side SDK token nor app credentials are provided
if (!NETLESS_SDK_TOKEN && !(NETLESS_APP_ID && NETLESS_APP_SECRET)) {
  console.warn(
    '[Netless] NETLESS_SDK_TOKEN not set and NETLESS_APP_ID/NETLESS_APP_SECRET not provided. Please configure one in .env.local',
  );
}

/**
 * POST /api/netless/room
 *
 * Request JSON:
 * {
 *   "uuid"?: string;      // 可選：如果有既有房間 UUID，直接幫你產 Room Token
 *   "name"?: string;      // 可選：沒給 uuid 時，新房間名稱
 *   "role"?: "admin" | "writer" | "reader"; // 預設 admin
 *   "lifespanMs"?: number; // Token 有效時間（毫秒），0 表示不會過期
 *   "limit"?: number;     // 可選：最大並發人數，0 = 不限制
 *   "isRecord"?: boolean; // 可選：是否開啟錄製能力（單純白板可先不用）
 * }
 */
export async function POST(req: NextRequest) {
  try {
    if (!NETLESS_SDK_TOKEN) {
      return NextResponse.json(
        { error: 'NETLESS_SDK_TOKEN is not configured on server' },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({} as any));

    let {
      uuid,
      name = 'Classroom Room',
      role = 'admin',
      lifespanMs = 0,
      limit = 0,
      isRecord = false,
    }: {
      uuid?: string;
      name?: string;
      role?: 'admin' | 'writer' | 'reader';
      lifespanMs?: number;
      limit?: number;
      isRecord?: boolean;
    } = body || {};

    // 1. 若沒有 uuid，先建立房間
    if (!uuid) {
      const createRoomRes = await fetch(`${NETLESS_API_BASE}/v5/rooms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          token: NETLESS_SDK_TOKEN,
          region: NETLESS_REGION,
        },
        body: JSON.stringify({
          isRecord,
          limit,
          name,
        }),
      });

      if (!createRoomRes.ok) {
        const text = await createRoomRes.text();
        console.error('[Netless] Create room failed:', createRoomRes.status, text);
        return NextResponse.json(
          {
            error: 'Failed to create room',
            detail: text,
          },
          { status: 500 },
        );
      }

      const roomInfo = (await createRoomRes.json()) as {
        uuid: string;
        name: string;
        teamUUID: string;
        isRecord: boolean;
        isBan: boolean;
        limit: number;
        createdAt: string;
      };

      uuid = roomInfo.uuid;
    }

    // 2. 產生 Room Token：優先嘗試在伺服器端使用 local generator（若提供 APP ID/SECRET）
    let roomToken: string | null = null;

    if (NETLESS_APP_ID && NETLESS_APP_SECRET) {
      try {
        // Try to require a token helper package if installed (server-side only).
        // Use eval('require') to avoid bundler static analysis attempting to resolve optional packages.
        const tryRequire = (name: string) => {
          try {
            // eslint-disable-next-line no-eval
            return eval('require')(name);
          } catch (e) {
            return null;
          }
        };

        const mod = (() => {
          return tryRequire('netless-token') || tryRequire('@netless/token') || tryRequire('@netless/netless-token') || null;
        })();

        if (mod) {
          const fn = (mod && (mod.default || mod.createToken || mod.generateToken || mod.generateRoomToken || mod.generate)) as any;
          if (typeof fn === 'function') {
            const maybe = await fn({
              uuid,
              role,
              lifespan: lifespanMs,
              appId: NETLESS_APP_ID,
              secret: NETLESS_APP_SECRET,
              region: NETLESS_REGION,
            });

            roomToken = typeof maybe === 'string' ? maybe : (maybe && (maybe.token || maybe.roomToken)) || null;
          }
        }
      } catch (err) {
        console.error('[Netless] Local token generation failed:', err);
        roomToken = null;
      }
    }

    // 若 local generation 不可用或失敗，回退到 Netless admin API（需要 NETLESS_SDK_TOKEN）
    if (!roomToken) {
      const createTokenRes = await fetch(
        `${NETLESS_API_BASE}/v5/tokens/rooms/${uuid}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            token: NETLESS_SDK_TOKEN,
            region: NETLESS_REGION,
          },
          body: JSON.stringify({
            lifespan: lifespanMs, // 0 = 永不過期
            role, // "admin" | "writer" | "reader"
          }),
        },
      );

      if (!createTokenRes.ok) {
        const text = await createTokenRes.text();
        console.error('[Netless] Create room token failed:', createTokenRes.status, text);
        return NextResponse.json(
          {
            error: 'Failed to generate room token',
            detail: text,
            uuid,
          },
          { status: 500 },
        );
      }

      // 回傳的是純文字 token，例如 "NETLESSROOM_XXXX..."
        roomToken = await createTokenRes.text();
        if (typeof roomToken === 'string') {
          roomToken = roomToken.trim();
          const mm = roomToken.match(/^"([\s\S]*)"$/);
          if (mm) roomToken = mm[1];
        }
    }

    return NextResponse.json({
      uuid,
      roomToken,
      region: NETLESS_REGION,
    });
  } catch (err: any) {
    console.error('[Netless] /api/netless/room error:', err);
    return NextResponse.json(
      {
        error: 'Unexpected server error',
        detail: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}
