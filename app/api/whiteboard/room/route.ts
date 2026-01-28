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
      role: TokenRole.Admin, 
      uuid: roomUuid 
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    const appId = process.env.AGORA_WHITEBOARD_APP_ID;
    const region = "sg"; // Singapore region as requested

    if (!appId) {
      return NextResponse.json(
        { error: 'Missing AGORA_WHITEBOARD_APP_ID' },
        { status: 500 }
      );
    }

    // 1. Generate SDK Token to authorize Room Creation
    const adminToken = generateSdkToken();

    // 2. Create a new Room via Agora/Netless REST API
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
    const roomUuid = roomData.uuid;

    // 3. Generate Room Token for the Client
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
