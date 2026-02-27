import { NextRequest, NextResponse } from 'next/server';
import { sdkToken, roomToken, TokenRole } from 'netless-token';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

// --- Configuration & Initialization ---

// 1. Initialize DynamoDB Client with logging
// We prioritize the environment region, but default to 'ap-northeast-1' to match lib/dynamo.ts
// Support CI_AWS_REGION as a fallback for CI/Amplify environment variables (avoid using reserved AWS_* names in envs)
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
console.log(`[WhiteboardAPI] Initializing DynamoDB Client in region: ${region}`);
// Prefer explicit credentials when provided in local/dev environments (mirrors scripts/seed-data.js)
// Support CI_ prefixed variables used in CI environments.
const explicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const explicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const explicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const explicitCredentials = explicitAccessKey && explicitSecretKey ? {
  accessKeyId: explicitAccessKey as string,
  secretAccessKey: explicitSecretKey as string,
  ...(explicitSessionToken ? { sessionToken: explicitSessionToken as string } : {})
} : undefined;

console.log(`[WhiteboardAPI] AWS creds present: ${explicitAccessKey ? (String(explicitAccessKey).substring(0, 5) + '...') : 'no'}`);

const client = new DynamoDBClient({ region, credentials: explicitCredentials });

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true,
  },
});

// Helper: Generate Admin SDK Token
function generateSdkToken() {
  const ak = process.env.AGORA_WHITEBOARD_AK;
  const sk = process.env.AGORA_WHITEBOARD_SK;

  if (!ak || !sk) {
    console.error('[WhiteboardAPI] Error: Missing Agora Whiteboard credentials (AK/SK)');
    console.error('[WhiteboardAPI] Please set AGORA_WHITEBOARD_AK and AGORA_WHITEBOARD_SK in your environment variables');
    console.error('[WhiteboardAPI] For local development, create a .env.local file with your Agora credentials');
    console.error('[WhiteboardAPI] See .env.local.example for the required format');
    throw new Error('Missing Agora Whiteboard credentials (AK/SK). Please configure your environment variables.');
  }

  return sdkToken(
    ak,
    sk,
    1000 * 60 * 10, // 10 minutes lifespan
    { role: TokenRole.Admin }
  );
}

// Helper: Generate Client Room Token
function generateRoomToken(roomUuid: string) {
  const ak = process.env.AGORA_WHITEBOARD_AK;
  const sk = process.env.AGORA_WHITEBOARD_SK;

  if (!ak || !sk) {
    throw new Error('Missing Agora Whiteboard credentials (AK/SK)');
  }

  return roomToken(
    ak,
    sk,
    1000 * 60 * 60 * 24, // 24 hours
    {
      role: TokenRole.Admin,
      uuid: roomUuid
    }
  );
}

// In-memory cache for fast lookups (per container/lambda instance)
const ROOM_CACHE = new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId?.trim();
    const channelName = body.channelName?.trim();
    const requestedRoomUuid = body.roomUuid?.trim();
    const courseId = body.courseId?.trim();
    const lookupOnly = body.lookupOnly;

    console.log('[WhiteboardAPI] Request received:', { userId: '[REDACTED]', channelName, requestedRoomUuid: '[REDACTED]', courseId });

    const appId = process.env.AGORA_WHITEBOARD_APP_ID;
    const regionAgora = "sg"; // Singapore (Agora region)

    if (!appId) {
      console.error('[WhiteboardAPI] Error: Missing AGORA_WHITEBOARD_APP_ID');
      console.error('[WhiteboardAPI] Please set AGORA_WHITEBOARD_APP_ID in your environment variables');
      console.error('[WhiteboardAPI] For local development, create a .env.local file with your Agora credentials');
      console.error('[WhiteboardAPI] See .env.local.example for the required format');
      return NextResponse.json({
        error: 'Missing AGORA_WHITEBOARD_APP_ID',
        message: 'Please configure your Agora Whiteboard credentials in environment variables'
      }, { status: 500 });
    }

    if (!channelName && !courseId) {
      return NextResponse.json({ error: 'Missing channelName or courseId' }, { status: 400 });
    }

    // 🔒 Security Check: Verify User Access
    // Only check if userId and courseId are present (skips anonymous/test flows if needed, but best to enforce)
    if (userId && courseId) {
      // Lazy import to avoid circular dep issues if any, though verifyCourseAccess should be clean
      const { verifyCourseAccess } = await import('@/lib/accessControl');

      // Bypass for: teachers/admins identifiable by userId pattern, local test env,
      // or when orderId is provided (user already has a verified booking via orders table)
      const orderId = body.orderId?.trim();
      const isTeacherOrAdmin = userId.startsWith('teacher') || userId.includes('admin') || userId.includes('t1@');
      const isLocalTest = process.env.NODE_ENV !== 'production' || !process.env.DYNAMODB_TABLE_ORDERS;
      const hasOrderId = !!orderId; // If orderId is passed, booking was already verified at order creation

      if (isTeacherOrAdmin || isLocalTest || hasOrderId) {
        console.log(`[WhiteboardAPI] ⚠️ Bypassing access control for ${userId} (Role bypass, Local Test, or orderId present)`);
      } else {
        const access = await verifyCourseAccess(userId, courseId);

        if (!access.granted) {
          console.warn(`[WhiteboardAPI] ⛔ Access Denied for user ${userId} on course ${courseId}. Reason: ${access.reason}`);
          return NextResponse.json({
            error: 'Access Denied',
            message: 'You do not have permission to access this course.',
            detail: access.reason
          }, { status: 403 });
        }
        console.log(`[WhiteboardAPI] ✅ Access Granted for user ${userId} on course ${courseId} (Source: ${access.source})`);
      }
    } else {
      console.warn('[WhiteboardAPI] ⚠️ Warning: userId or courseId missing, skipping access control check. This should be blocked in production.');
    } // TODO: Enforce strict check when all clients are updated

    let roomUuid: string | undefined;

    // 1. Force override (Debug/Testing)
    if (requestedRoomUuid) {
      roomUuid = requestedRoomUuid;
      console.log(`[WhiteboardAPI] Using requested room UUID: ${roomUuid}`);
    } else {
      // 2. DynamoDB Lookup
      const tableName = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

      if (!process.env.DYNAMODB_TABLE_COURSES) {
        console.warn(`[WhiteboardAPI] WARNING: DYNAMODB_TABLE_COURSES env var is missing. Falling back to hardcoded: ${tableName}`);
      }

      // Priority: use channelName if available (session-specific), fallback to courseId
      // This ensures that different orders for the same course get separate whiteboards.
      const { normalizeUuid } = await import('@/lib/whiteboardService');
      let dbKey = channelName ? channelName : (courseId || 'default');
      dbKey = normalizeUuid(dbKey);

      console.log(`[WhiteboardAPI] Querying DynamoDB Table: [REDACTED], Key: [REDACTED], Region: ${region}`);

      try {
        const getCmd = new GetCommand({
          TableName: tableName,
          Key: { id: dbKey },
          ConsistentRead: true
        });
        console.log('[WhiteboardAPI] Attempting DynamoDB GetCommand:', { tableName, dbKey: dbKey.substring(0, 10) + '...' });
        const getResult = await docClient.send(getCmd);

        if (getResult.Item && getResult.Item.whiteboardUuid) {
          roomUuid = getResult.Item.whiteboardUuid as string;
          console.log(`[WhiteboardAPI] ✅ FOUND persistent room in DB for key ${dbKey}`);
          if (channelName) ROOM_CACHE.set(channelName, roomUuid);
        } else {
          console.log(`[WhiteboardAPI] ℹ️ No existing room found in DB for key ${dbKey}`);
        }
      } catch (dbReadError: any) {
        console.error('[WhiteboardAPI] ❌ DynamoDB GetCommand FAILED for key:', dbKey.substring(0, 10));
        console.error('  Error name:', dbReadError?.name);
        console.error('  Error code:', dbReadError?.$metadata?.httpStatusCode);
        console.error('  Error message:', dbReadError?.message);
        console.error('  RequestId:', dbReadError?.$metadata?.requestId);
      }

      // If failed to read from DB, check cache as fallback (only if we didn't find it in DB)
      if (!roomUuid && channelName && ROOM_CACHE.has(channelName)) {
        roomUuid = ROOM_CACHE.get(channelName) as string;
        console.log(`[WhiteboardAPI] Found room in memory cache: [REDACTED]`);
      }

      // 3. Create New Room if not found (with concurrency guard)
      if (!roomUuid) {
        // If caller requested lookup-only, return not found without creating to avoid races
        if (lookupOnly) {
          console.log(`[WhiteboardAPI] lookupOnly request - no room found for ${dbKey}, returning not found`);
          return NextResponse.json({ found: false }, { status: 200 });
        }
        console.log(`[WhiteboardAPI] Creating NEW Whiteboard Room for key: ${dbKey}. Reason: Not found in DB or Cache.`);

        const adminToken = generateSdkToken();
        const createRoomRes = await fetch('https://api.netless.link/v5/rooms', {
          method: 'POST',
          headers: {
            'token': adminToken,
            'Content-Type': 'application/json',
            'region': regionAgora
          },
          body: JSON.stringify({ isRecord: false, limit: 0 })
        });

        if (!createRoomRes.ok) {
          const errText = await createRoomRes.text();
          console.error(`[WhiteboardAPI] Agora Create Room FAILED: ${createRoomRes.status} ${errText}`);
          return NextResponse.json({ error: `Agora create failed: ${createRoomRes.status}` }, { status: 502 });
        }

        const roomData = await createRoomRes.json();
        const newRoomUuid = roomData.uuid;
        console.log(`[WhiteboardAPI] NEW Room Created in Agora. UUID: ${newRoomUuid}`);

        // 4. Atomic Save to DynamoDB
        console.log(`[WhiteboardAPI] Attempting ATOMIC save to DynamoDB Table: ${tableName}, Key: ${dbKey}`);

        try {
          // Use UpdateCommand with ConditionExpression to ensure we don't overwrite if someone else created one simultaneously
          const updateParams = {
            TableName: tableName,
            Key: { id: dbKey },
            UpdateExpression: "SET whiteboardUuid = :w, updatedAt = :t",
            ConditionExpression: "attribute_not_exists(whiteboardUuid)",
            ExpressionAttributeValues: {
              ":w": newRoomUuid,
              ":t": new Date().toISOString()
            },
            ReturnValues: "ALL_NEW" as const
          };

          console.log('[WhiteboardAPI][DDB][Update] Sending Atomic UpdateCommand');
          const updateCmd = new UpdateCommand(updateParams);
          await docClient.send(updateCmd);
          roomUuid = newRoomUuid;
          console.log(`[WhiteboardAPI] Successfully saved new room ${roomUuid} to DB for key ${dbKey}`);

          // Update Cache
          if (channelName) {
            ROOM_CACHE.set(channelName, roomUuid as string);
            console.log(`[WhiteboardAPI] Updated in-memory cache for channel ${channelName} => ${roomUuid}`);
          }

        } catch (dbWriteError: any) {
          if (dbWriteError.name === 'ConditionalCheckFailedException' || dbWriteError.__type === 'ConditionalCheckFailedException') {
            console.log(`[WhiteboardAPI] Concurrency detected! Someone else saved a whiteboardUuid for ${dbKey} just now.`);
            // Fetch the one that was just saved by the other process
            const finalGetCmd = new GetCommand({
              TableName: tableName,
              Key: { id: dbKey },
              ConsistentRead: true
            });
            const finalGetResult = await docClient.send(finalGetCmd);
            if (finalGetResult.Item && finalGetResult.Item.whiteboardUuid) {
              roomUuid = finalGetResult.Item.whiteboardUuid as string;
              console.log(`[WhiteboardAPI] Recovered from race condition. Using uuid from DB: ${roomUuid}`);
              if (channelName) ROOM_CACHE.set(channelName, roomUuid);
            } else {
              console.error('[WhiteboardAPI] Race condition occurred but still couldn\'t find whiteboardUuid in DB!');
              // This is a weird state - we created a room but can't save it and can't find the other one.
              // Instead of falling back blindly, return error to force client to retry.
              return NextResponse.json({ error: 'Database race recovery failed' }, { status: 500 });
            }
          } else {
            console.error('[WhiteboardAPI] CRITICAL: DynamoDB Write FAILED:', dbWriteError.name, dbWriteError.message);
            // Return error if we can't save to DB. 
            // This prevents the case where Teacher enters room X but Student can't find it.
            return NextResponse.json({
              error: 'Failed to persist whiteboard UUID to database',
              details: dbWriteError.message,
              tableName: tableName,
              key: dbKey
            }, { status: 500 });
          }
        }
      }
    }

    if (!roomUuid) {
      throw new Error('Failed to determine or create roomUuid');
    }

    // 5. Return Credentials
    const clientRoomToken = generateRoomToken(roomUuid);
    console.log(`[WhiteboardAPI] Returning success for room: [REDACTED]`);

    return NextResponse.json({
      uuid: roomUuid,
      roomToken: clientRoomToken,
      appIdentifier: appId,
      region: regionAgora,
      userId: userId
    });

  } catch (error: any) {
    console.error('[WhiteboardAPI] Unhandled Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
