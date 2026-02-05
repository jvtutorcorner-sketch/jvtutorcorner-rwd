import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { courseId, channelName } = body || {};

    console.log('[WhiteboardUUIDAPI] Request received:', { courseId, channelName, region: process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1' });

    if (!courseId && !channelName) {
      console.warn('[WhiteboardUUIDAPI] Missing both courseId and channelName');
      return NextResponse.json({ error: 'Missing courseId or channelName' }, { status: 400 });
    }

    const tableName = process.env.DYNAMODB_TABLE_COURSES ;
    const dbKey = courseId ? courseId : `session_${channelName}`;
    
    console.log(`[WhiteboardUUIDAPI] Using table: ${tableName}, key: ${dbKey}`);

    try {
      const getCmd = new GetCommand({ TableName: tableName, Key: { id: dbKey }, ConsistentRead: true });
      console.log('[WhiteboardUUIDAPI] Sending GetCommand to DynamoDB...');
      const res = await docClient.send(getCmd);
      
      if (res.Item && res.Item.whiteboardUuid) {
        console.log(`[WhiteboardUUIDAPI] ✅ Found uuid ${res.Item.whiteboardUuid} for key ${dbKey}`);
        return NextResponse.json({ found: true, uuid: res.Item.whiteboardUuid }, { status: 200 });
      }
      console.log(`[WhiteboardUUIDAPI] ℹ️ No uuid found for key ${dbKey} (item exists: ${!!res.Item})`);
      return NextResponse.json({ found: false }, { status: 200 });
    } catch (ddbErr: any) {
      console.error('[WhiteboardUUIDAPI] ❌ DynamoDB GetCommand failed:');
      console.error('  Name:', ddbErr?.name);
      console.error('  Code:', ddbErr?.$metadata?.httpStatusCode);
      console.error('  Message:', ddbErr?.message);
      console.error('  RequestId:', ddbErr?.$metadata?.requestId);
      console.error('  Full error:', JSON.stringify(ddbErr, null, 2));
      
      return NextResponse.json({ 
        error: 'DynamoDB read error', 
        errorName: ddbErr?.name,
        errorCode: ddbErr?.$metadata?.httpStatusCode,
        details: ddbErr?.message,
        tableName: tableName,
        key: dbKey,
        region: process.env.AWS_REGION || process.env.CI_AWS_REGION
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[WhiteboardUUIDAPI] ❌ Request parsing failed:', err?.message);
    return NextResponse.json({ error: 'Invalid request', details: err?.message }, { status: 400 });
  }
}
