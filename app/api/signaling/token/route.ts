import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

/**
 * /api/signaling/token
 *
 * Generates a short-lived HMAC-signed token for AWS API Gateway WebSocket connections.
 * The Lambda authorizer on the API GW side verifies this token before allowing $connect.
 *
 * This route is INACTIVE until NEXT_PUBLIC_SIGNALING_PROVIDER=aws-apigw-ws is set.
 *
 * AWS API Gateway WebSocket Lambda Authorizer setup:
 *   - Authorizer type: REQUEST (reads from querystring)
 *   - Identity sources: $request.querystring.token, $request.querystring.channelName, $request.querystring.userId
 *   - Lambda function: verify HMAC-SHA256(channelName + userId + expiry, SIGNALING_TOKEN_SECRET)
 *     and reject if expiry < Date.now() (token lifetime: 60 seconds)
 */

const TOKEN_LIFETIME_MS = 60_000;

export async function POST(req: NextRequest) {
  // Validate request fields first (400 takes priority over 503)
  let channelName: string;
  let userId: string;
  try {
    const body = await req.json();
    channelName = String(body.channelName ?? '');
    userId = String(body.userId ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!channelName || !userId) {
    return NextResponse.json({ error: 'channelName and userId are required' }, { status: 400 });
  }

  const secret = process.env.SIGNALING_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'SIGNALING_TOKEN_SECRET is not configured' },
      { status: 503 },
    );
  }

  const expiry = Date.now() + TOKEN_LIFETIME_MS;
  const payload = `${channelName}:${userId}:${expiry}`;
  const token = createHmac('sha256', secret).update(payload).digest('hex') + '.' + expiry;

  return NextResponse.json({ token, expiresAt: expiry });
}
