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

    if (!courseId && !channelName) {
      return NextResponse.json({ error: 'Missing courseId or channelName' }, { status: 400 });
    }

    const tableName = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    // Use courseId when available, otherwise derive from channelName
    const dbKey = courseId ? courseId : `session_${channelName}`;

    try {
      const getCmd = new GetCommand({ TableName: tableName, Key: { id: dbKey }, ConsistentRead: true });
      const res = await docClient.send(getCmd);
      if (res.Item && res.Item.whiteboardUuid) {
        console.log(`[WhiteboardUUIDAPI] Found uuid ${res.Item.whiteboardUuid} for key ${dbKey}`);
        return NextResponse.json({ found: true, uuid: res.Item.whiteboardUuid }, { status: 200 });
      }
      console.log(`[WhiteboardUUIDAPI] No uuid found for key ${dbKey} in table ${tableName}`);
      return NextResponse.json({ found: false }, { status: 200 });
    } catch (ddbErr: any) {
      console.error(`[WhiteboardUUIDAPI] DynamoDB read error for table ${tableName}, key ${dbKey}:`, ddbErr?.name, ddbErr?.message);
      return NextResponse.json({ 
        error: 'DynamoDB read error', 
        details: ddbErr.message,
        tableName: tableName,
        key: dbKey
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[WhiteboardUUIDAPI] Request parse error:', err?.message || err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
