// app/api/livekit/token/route.ts
//
// POST /api/livekit/token
// Body: { courseSessionId?: string; roomId?: string }
//
// 流程：withAuth 驗 session cookie → authorizeJoin 查 DynamoDB → 簽 LiveKit JWT。
//
// 這條 route 在 Amplify Hosting 上本身就是跑在 Lambda（Next.js SSR compute）裡，
// 與需求中的「呼叫 AWS Lambda」等價。若日後要把它拆成獨立 Lambda + API Gateway，
// 見 lambda/livekit-token/handler.ts，兩者共用同一份 lib/livekit/* 核心邏輯。
//
// 回應：
//   200 { ok: true, token, url, roomName, identity, role, expiresAt, courseSession: {...} }
//   400 / 403 / 404 { ok: false, reason, message, opensAt? }
//   503 { ok: false, reason: 'LIVEKIT_NOT_CONFIGURED' }
//   500 { ok: false, reason: 'INTERNAL' }

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getLiveKitConfig, LiveKitConfigError } from '@/lib/livekit/config';
import { authorizeJoin } from '@/lib/livekit/authorizeJoin';
import { ensureClassroomRoom, issueClassroomToken } from '@/lib/livekit/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TokenRequestBody {
  courseSessionId?: unknown;
  roomId?: unknown;
}

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: TokenRequestBody;
  try {
    body = (await req.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'BAD_REQUEST', message: 'Body must be JSON' },
      { status: 400 }
    );
  }

  let cfg;
  try {
    cfg = getLiveKitConfig();
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      console.error('[livekit/token]', err.message);
      return NextResponse.json(
        { ok: false, reason: 'LIVEKIT_NOT_CONFIGURED', message: 'Video service is not configured' },
        { status: 503 }
      );
    }
    throw err;
  }

  const requester = {
    userId: req.session.userId,
    email: req.session.email,
    role: req.session.role,
  };

  try {
    const decision = await authorizeJoin(
      requester,
      {
        courseSessionId: asOptionalString(body.courseSessionId),
        roomId: asOptionalString(body.roomId),
      },
      {
        earlyJoinMinutes: cfg.earlyJoinMinutes,
        graceMinutes: cfg.graceMinutes,
        maxTokenTtlSec: cfg.maxTokenTtlSec,
      }
    );

    if (!decision.ok) {
      console.info('[livekit/token] denied', {
        userId: requester.userId,
        role: requester.role,
        reason: decision.reason,
        courseSessionId: body.courseSessionId,
        roomId: body.roomId,
      });
      return NextResponse.json(
        {
          ok: false,
          reason: decision.reason,
          message: decision.message,
          ...(decision.opensAt ? { opensAt: decision.opensAt } : {}),
        },
        { status: decision.httpStatus }
      );
    }

    await ensureClassroomRoom(decision.roomName, {
      isOneOnOne: (decision.courseSession.capacity ?? 1) <= 1,
      courseSessionId: decision.courseSession.id,
    });

    const issued = await issueClassroomToken(decision, requester.userId);

    console.info('[livekit/token] issued', {
      userId: requester.userId,
      role: issued.role,
      roomName: issued.roomName,
      expiresAt: issued.expiresAt,
    });

    return NextResponse.json({
      ok: true,
      ...issued,
      courseSession: {
        id: decision.courseSession.id,
        courseId: decision.courseSession.courseId,
        startTime: decision.courseSession.startTime,
        endTime: decision.courseSession.endTime,
        status: decision.courseSession.status,
      },
    });
  } catch (err) {
    console.error('[livekit/token] unexpected error', err);
    return NextResponse.json(
      { ok: false, reason: 'INTERNAL', message: 'Failed to issue classroom token' },
      { status: 500 }
    );
  }
});
