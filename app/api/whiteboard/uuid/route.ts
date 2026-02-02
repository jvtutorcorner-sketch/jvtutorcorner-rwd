import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
        return NextResponse.json({ found: true, uuid: res.Item.whiteboardUuid }, { status: 200 });
      }
      return NextResponse.json({ found: false }, { status: 200 });
    } catch (ddbErr: any) {
      console.error('[WhiteboardUUIDAPI] DynamoDB read error:', ddbErr?.message || ddbErr);
      return NextResponse.json({ error: 'DynamoDB read error' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[WhiteboardUUIDAPI] Request parse error:', err?.message || err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
