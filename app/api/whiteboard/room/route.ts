import { NextRequest, NextResponse } from 'next/server';
import { sdkToken, roomToken, TokenRole } from 'netless-token';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// --- Configuration & Initialization ---

// 1. Initialize DynamoDB Client with logging
// We prioritize the environment region, but default to 'ap-northeast-1' to match lib/dynamo.ts
const region = process.env.AWS_REGION || 'ap-northeast-1';
console.log(`[WhiteboardAPI] Initializing DynamoDB Client in region: ${region}`);

const client = new DynamoDBClient({ region });
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
    throw new Error('Missing Agora Whiteboard credentials (AK/SK)');
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
    const { userId, channelName, roomUuid: requestedRoomUuid } = await req.json();

    console.log('[WhiteboardAPI] Request received:', { userId, channelName, requestedRoomUuid });

    const appId = process.env.AGORA_WHITEBOARD_APP_ID;
    const regionAgora = "sg"; // Singapore (Agora region)

    if (!appId) {
      console.error('[WhiteboardAPI] Error: Missing AGORA_WHITEBOARD_APP_ID');
      return NextResponse.json({ error: 'Missing AGORA_WHITEBOARD_APP_ID' }, { status: 500 });
    }

    if (!channelName) {
      return NextResponse.json({ error: 'Missing channelName' }, { status: 400 });
    }

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

      // We validly assume partition key is 'id' and usage pattern 'session_{channelName}'
      const dbKey = `session_${channelName}`;

      console.log(`[WhiteboardAPI] Querying DynamoDB Table: ${tableName}, Key: ${dbKey}`);

      try {
        const getCmd = new GetCommand({
          TableName: tableName,
          Key: { id: dbKey },
          ProjectionExpression: 'whiteboardUuid'
        });

        const getResult = await docClient.send(getCmd);
        
        if (getResult.Item && getResult.Item.whiteboardUuid) {
          roomUuid = getResult.Item.whiteboardUuid as string;
          console.log(`[WhiteboardAPI] FOUND persistent room in DB: ${roomUuid}`);
          ROOM_CACHE.set(channelName, roomUuid);
        } else {
          console.log(`[WhiteboardAPI] No existing room found in DB for key: ${dbKey}`);
        }
      } catch (dbReadError) {
        console.error('[WhiteboardAPI] DynamoDB GetCommand FAILED:', dbReadError);
        // Do not crash; proceed to try creating a room
      }

      // If failed to read from DB, check cache as fallback
      if (!roomUuid && ROOM_CACHE.has(channelName)) {
        roomUuid = ROOM_CACHE.get(channelName) as string;
        console.log(`[WhiteboardAPI] Found room in memory cache: ${roomUuid}`);
      }
      
      // 3. Create New Room if not found
      if (!roomUuid) {
        console.log(`[WhiteboardAPI] Creating NEW Whiteboard Room for channel: ${channelName}`);
        
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
          throw new Error(`Failed to create room: ${createRoomRes.status} ${errText}`);
        }

        const roomData = await createRoomRes.json();
        roomUuid = roomData.uuid;
        console.log(`[WhiteboardAPI] NEW Room Created. UUID: ${roomUuid}`);

        // 4. Save to DynamoDB
        console.log(`[WhiteboardAPI] Saving room UUID to DynamoDB... Table: ${tableName}`);
        
        try {
            // Using PutCommand to ensure the item is created/updated
            const putCmd = new PutCommand({
                TableName: tableName,
                Item: {
                    id: dbKey,
                    whiteboardUuid: roomUuid,
                    updatedAt: new Date().toISOString()
                },
                ReturnValues: "ALL_OLD" // Returns the old item if it existed
            });

            const putResult = await docClient.send(putCmd);
            console.log(`[WhiteboardAPI] DynamoDB Write SUCCESS. Old Item:`, putResult.Attributes);
            
            // Update Cache
            ROOM_CACHE.set(channelName, roomUuid as string);

        } catch (dbWriteError) {
            console.error('[WhiteboardAPI] CRITICAL: DynamoDB Write FAILED:', dbWriteError);
            console.error('[WhiteboardAPI] Error Details:', JSON.stringify(dbWriteError, null, 2));
            // Proceed so user can still use the room for this session
        }
      }
    }

    if (!roomUuid) {
      throw new Error('Failed to determine or create roomUuid');
    }

    // 5. Return Credentials
    const clientRoomToken = generateRoomToken(roomUuid);
    console.log(`[WhiteboardAPI] Returning success for room: ${roomUuid}`);

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
