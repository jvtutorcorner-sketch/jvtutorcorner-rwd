// lambda/livekit-token/handler.ts
//
// 獨立 Lambda 版本的 Token 端點（API Gateway HTTP API + Cognito JWT Authorizer）。
//
// 與 app/api/livekit/token/route.ts 共用 lib/livekit/* 的授權與簽章邏輯，
// 差別只在「身分從哪裡來」：
//   * Next.js route  → 平台 session cookie（lib/auth/sessionManager）
//   * 這個 Lambda    → API Gateway 已驗過的 Cognito ID Token claims
//
// 部署（在 repo 根目錄，esbuild 會把 @/lib/* 一起打包）：
//   npx esbuild lambda/livekit-token/handler.ts \
//     --bundle --platform=node --target=node20 --format=cjs \
//     --outfile=dist/livekit-token/index.js \
//     --alias:@=. \
//     --external:@aws-sdk/*
//
// Lambda 設定：
//   Runtime  nodejs20.x   Handler index.handler   Timeout 10s   Memory 256MB
//   環境變數 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / DYNAMODB_TABLE_*
//   IAM     dynamodb:GetItem / Query / UpdateItem on course-sessions, enrollments, profiles
//
// API Gateway (HTTP API):
//   POST /classroom/token  → 此 Lambda
//   Authorizer: JWT, issuer = https://cognito-idp.<region>.amazonaws.com/<userPoolId>
//   前端呼叫時帶 Authorization: Bearer <Cognito idToken>
//
// Cognito 使用者屬性：需要 custom:role（teacher | student | admin）。
// 若你的 user pool 用 Cognito Groups 代替 custom:role，改讀 claims['cognito:groups']。

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getLiveKitConfig, LiveKitConfigError } from '@/lib/livekit/config';
import { authorizeJoin, type JoinRequester } from '@/lib/livekit/authorizeJoin';
import { ensureClassroomRoom, issueClassroomToken } from '@/lib/livekit/token';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/** 從 Cognito JWT claims 組出 JoinRequester；缺必要欄位回 null。 */
function requesterFromClaims(
  claims: Record<string, unknown> | undefined
): JoinRequester | null {
  if (!claims) return null;
  const sub = typeof claims.sub === 'string' ? claims.sub : null;
  if (!sub) return null;

  let role: string | null = typeof claims['custom:role'] === 'string' ? (claims['custom:role'] as string) : null;
  if (!role) {
    // 相容用 Cognito Groups 管理角色的 user pool
    const groups = claims['cognito:groups'];
    const list = Array.isArray(groups) ? groups : typeof groups === 'string' ? groups.split(',') : [];
    if (list.includes('admin')) role = 'admin';
    else if (list.includes('teacher')) role = 'teacher';
    else role = 'student';
  }

  return {
    userId: sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    role,
  };
}

interface TokenRequestBody {
  courseSessionId?: unknown;
  roomId?: unknown;
}

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const requester = requesterFromClaims(event.requestContext?.authorizer?.jwt?.claims as any);
  if (!requester) {
    return json(401, { ok: false, reason: 'UNAUTHORIZED', message: 'Missing or invalid Cognito claims' });
  }

  let body: TokenRequestBody = {};
  if (event.body) {
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      body = JSON.parse(raw) as TokenRequestBody;
    } catch {
      return json(400, { ok: false, reason: 'BAD_REQUEST', message: 'Body must be JSON' });
    }
  }

  let cfg;
  try {
    cfg = getLiveKitConfig();
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      console.error('[livekit-token-lambda]', err.message);
      return json(503, { ok: false, reason: 'LIVEKIT_NOT_CONFIGURED', message: 'Video service is not configured' });
    }
    throw err;
  }

  try {
    const decision = await authorizeJoin(
      requester,
      { courseSessionId: asOptionalString(body.courseSessionId), roomId: asOptionalString(body.roomId) },
      { earlyJoinMinutes: cfg.earlyJoinMinutes, graceMinutes: cfg.graceMinutes, maxTokenTtlSec: cfg.maxTokenTtlSec }
    );

    if (!decision.ok) {
      console.info('[livekit-token-lambda] denied', { userId: requester.userId, reason: decision.reason });
      return json(decision.httpStatus, {
        ok: false,
        reason: decision.reason,
        message: decision.message,
        ...(decision.opensAt ? { opensAt: decision.opensAt } : {}),
      });
    }

    await ensureClassroomRoom(decision.roomName, {
      isOneOnOne: (decision.courseSession.capacity ?? 1) <= 1,
      courseSessionId: decision.courseSession.id,
    });

    const issued = await issueClassroomToken(decision, requester.userId);
    console.info('[livekit-token-lambda] issued', { userId: requester.userId, roomName: issued.roomName });

    return json(200, {
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
    console.error('[livekit-token-lambda] unexpected error', err);
    return json(500, { ok: false, reason: 'INTERNAL', message: 'Failed to issue classroom token' });
  }
}
