import { NextRequest, NextResponse } from 'next/server';
import { sdkToken, roomToken, TokenRole } from 'netless-token';

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

// Global in-memory cache for Room UUIDs (Mapped by Channel Name)
// In production, use Redis or a Database.
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

    let roomUuid: string;

    // 1. If uuid is provided by the client, use it directly (Student joining existing room)
    if (requestedRoomUuid) {
        roomUuid = requestedRoomUuid;
        console.log(`[WhiteboardAPI] Using requested room UUID: ${roomUuid}`);
    } 
    // 2. Check Cache: If channelName is provided and room exists, reuse it.
    else if (channelName && ROOM_CACHE.has(channelName)) {
        roomUuid = ROOM_CACHE.get(channelName)!;
        console.log(`[WhiteboardAPI] Reusing existing room for channel: ${channelName} -> ${roomUuid}`);
    } else {
        // 3. Create a new Room via Agora/Netless REST API
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
            throw new Error(`Failed to create room: ${createRoomRes.statusText}`);
        }

        const roomData = await createRoomRes.json();
        roomUuid = roomData.uuid;
        
        // Save to Cache
        if (channelName) {
            ROOM_CACHE.set(channelName, roomUuid);
            console.log(`[WhiteboardAPI] Created NEW room for channel: ${channelName} -> ${roomUuid}`);
        }
    }

    // 3. Generate Room Token for the Client (Must be fresh for every specific room UUID)
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
