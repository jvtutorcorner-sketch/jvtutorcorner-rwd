import { NextRequest, NextResponse } from 'next/server';
import { sdkToken, roomToken, TokenRole } from 'netless-token';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// Initialize DynamoDB Client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1', // Default to us-east-1 or your aggregate region
});

// Helper to generate SDK Token (for Admin operations like creating rooms)
function generateSdkToken() {
  const ak = process.env.AGORA_WHITEBOARD_AK;
  const sk = process.env.AGORA_WHITEBOARD_SK;
  
  if (!ak || !sk) {
    throw new Error('Missing Agora Whiteboard credentials (AK/SK)');
  }

  return sdkToken(
    ak, 
    sk, 
    1000 * 60 * 10, // 10 minutes lifespan for this admin action
    { role: TokenRole.Admin }
  );
}

// Helper to generate Room Token (for Frontend Client connection)
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
      role: TokenRole.Admin, // Use Admin role to ensure full control for the room creator (teacher)
      uuid: roomUuid 
    }
  );
}

// Global in-memory cache as a short-term fallback (optional)
const ROOM_CACHE = new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    const { userId, channelName, roomUuid: requestedRoomUuid } = await req.json();

    const appId = process.env.AGORA_WHITEBOARD_APP_ID;
    const region = "sg"; // Singapore region as requested

    if (!appId) {
      return NextResponse.json(
        { error: 'Missing AGORA_WHITEBOARD_APP_ID' },
        { status: 500 }
      );
    }

    let roomUuid: string | undefined;

    // 1. If uuid is provided explicitly (e.g. forced via URL or debug), use it.
    if (requestedRoomUuid) {
      roomUuid = requestedRoomUuid;
      console.log(`[WhiteboardAPI] Using requested room UUID: ${roomUuid}`);
    } else {
      // 2. DynamoDB "Get-or-Create" Logic
      // Attempt to retrieve existing whiteboardUuid from DynamoDB
      const tableName = process.env.DYNAMODB_TABLE_COURSES;
      
      if (tableName && channelName) {
        try {
          // Check DB for existing mapping
          // Assuming the table uses 'id' as the Partition Key.
          // We use channelName as the ID for the session record.
          const getParams = {
            TableName: tableName,
            Key: {
              id: { S: `session_${channelName}` }
            },
            ProjectionExpression: 'whiteboardUuid'
          };
          
          const getCommand = new GetItemCommand(getParams);
          const getResult = await client.send(getCommand);
          
          if (getResult.Item && getResult.Item.whiteboardUuid && getResult.Item.whiteboardUuid.S) {
            roomUuid = getResult.Item.whiteboardUuid.S;
            console.log(`[WhiteboardAPI] Found persistent room in DB for ${channelName}: ${roomUuid}`);
            // Update in-memory cache for speed
            ROOM_CACHE.set(channelName, roomUuid);
          }
        } catch (dbError) {
          console.error('[WhiteboardAPI] DynamoDB Read Error:', dbError);
          // Fallback to cache or create if DB fails? 
          // For now, proceed to act as if not found (or fail if critical)
        }
      }

      // If still not found in DB...
      if (!roomUuid) {
        // Double check in-memory cache (stateless/cold start risk, but useful if same instance)
        if (channelName && ROOM_CACHE.has(channelName)) {
           roomUuid = ROOM_CACHE.get(channelName);
           console.log(`[WhiteboardAPI] Found room in memory cache for ${channelName}: ${roomUuid}`);
        }
      }

      // 3. Create New Room if needed
      if (!roomUuid) {
          console.log(`[WhiteboardAPI] Creating NEW room for channel: ${channelName}`);
          
          const adminToken = generateSdkToken();
          const createRoomRes = await fetch('https://api.netless.link/v5/rooms', {
              method: 'POST',
              headers: {
                  'token': adminToken,
                  'Content-Type': 'application/json',
                  'region': region
              },
              body: JSON.stringify({
                  isRecord: false,
                  limit: 0 // unlimited
              })
          });

          if (!createRoomRes.ok) {
              const errorText = await createRoomRes.text();
              throw new Error(`Failed to create room: ${createRoomRes.status} ${errorText}`);
          }

          const roomData = await createRoomRes.json();
          roomUuid = roomData.uuid;

          // 4. Persist to DynamoDB
          if (tableName && channelName && roomUuid) {
             try {
                // We store it as a separate item to avoid overwriting actual Course data if IDs conflict.
                // Key: session_{channelName}
                const updateParams = {
                    TableName: tableName,
                    Key: {
                        id: { S: `session_${channelName}` }
                    },
                    UpdateExpression: "SET whiteboardUuid = :w, updatedAt = :t",
                    ExpressionAttributeValues: {
                        ":w": { S: roomUuid },
                        ":t": { S: new Date().toISOString() }
                    }
                };
                
                // Using UpdateItem behaves like "Upsert"
                const updateCommand = new UpdateItemCommand(updateParams);
                await client.send(updateCommand);
                console.log(`[WhiteboardAPI] Persisted room ${roomUuid} to DB for channel ${channelName}`);
             } catch (persistError) {
                 console.error('[WhiteboardAPI] Failed to persist room to DB:', persistError);
             }
          }
          
          // Update Cache
          if (channelName && roomUuid) {
              ROOM_CACHE.set(channelName, roomUuid);
          }
      }
    }

    if (!roomUuid) {
        throw new Error('Failed to determine or create roomUuid');
    }

    // 5. Generate Room Token for the Client
    const clientRoomToken = generateRoomToken(roomUuid);

    return NextResponse.json({
      uuid: roomUuid,
      roomToken: clientRoomToken,
      appIdentifier: appId,
      region: region,
      userId: userId
    });

  } catch (error: any) {
    console.error('Agora Whiteboard API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
