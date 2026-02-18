import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

interface AgoraLog {
  id: string;
  timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  ua?: string;
  role?: 'teacher' | 'student';
  email?: string;
  session?: string;
  whiteboardUuid?: string;
}

const dynamoClient = new DynamoDBClient({
  region: process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1',
  credentials: process.env.CI_AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.CI_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.CI_AWS_SECRET_ACCESS_KEY || '',
        sessionToken: process.env.CI_AWS_SESSION_TOKEN,
      }
    : undefined,
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const tableName = process.env.DYNAMODB_TABLE_AGORA_LOGS || 'jvtutorcorner-agora-logs';

// GET: Fetch Agora logs from the last N hours
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const hoursAgo = parseInt(searchParams.get('hoursAgo') || '24');

    const now = Date.now();
    const nHoursAgo = now - hoursAgo * 60 * 60 * 1000;

    // Query for logs from the last N hours
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'logType = :logType AND #ts BETWEEN :startTime AND :endTime',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':logType': 'AGORA_LOG',
        ':startTime': nHoursAgo,
        ':endTime': now,
      },
      ScanIndexForward: false, // Get newest first
      Limit: limit,
    });

    const result = await docClient.send(command);
    const logs = (result.Items || []) as AgoraLog[];

    return NextResponse.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error('[Agora Logs API] GET Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      },
      { status: 500 }
    );
  }
}

// POST: Add a new Agora log
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<AgoraLog>;

    if (!body.message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const log: AgoraLog = {
      id: `log_${now}_${Math.random().toString(36).substring(7)}`,
      timestamp: now,
      level: body.level || 'INFO',
      message: body.message,
      ua: body.ua,
      role: body.role,
      email: body.email,
      session: body.session,
      whiteboardUuid: body.whiteboardUuid,
    };

    const command = new PutCommand({
      TableName: tableName,
      Item: {
        logType: 'AGORA_LOG',
        ...log,
        expiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days TTL
      },
    });

    await docClient.send(command);

    return NextResponse.json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error('[Agora Logs API] POST Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create log',
      },
      { status: 500 }
    );
  }
}
