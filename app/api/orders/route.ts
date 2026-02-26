import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { COURSES } from '@/data/courses';

// DynamoDB client initialization
const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
  accessKeyId: ddbExplicitAccessKey as string,
  secretAccessKey: ddbExplicitSecretKey as string,
  ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client);

// Placeholder for real user session check
const getUserId = async (): Promise<string | null> => {
  return 'mock-user-123';
};

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

export async function POST(request: Request) {
  try {
    const { courseId, enrollmentId, amount, currency, userId: clientUserId } = await request.json();
    let userId = await getUserId();

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required. For plan subscriptions, use /api/plan-upgrades instead.' }, { status: 400 });
    }

    if (!userId || String(userId).startsWith('mock-user')) {
      if (clientUserId) {
        userId = clientUserId;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const orderId = randomUUID();
    const createdAt = new Date().toISOString();
    const orderNumber = `${userId}-${createdAt}`;

    // Fetch course duration and total sessions
    let durationMinutes = 0;
    let totalSessions = 1;

    try {
      if (courseId) {
        const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
        const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } });
        const res = await docClient.send(getCmd);
        if (res.Item) {
          durationMinutes = res.Item.durationMinutes || 0;
          totalSessions = res.Item.totalSessions || 1;
        } else {
          const course = COURSES.find(c => c.id === courseId);
          durationMinutes = course?.durationMinutes || 0;
          totalSessions = course?.totalSessions || 1;
        }
      }
    } catch (e) {
      console.warn('[orders API] Failed to fetch course duration/sessions:', e);
    }
    const order = {
      orderId,
      orderNumber,
      userId,
      courseId: courseId || null,
      durationMinutes,
      totalSessions,
      remainingSessions: totalSessions,
      remainingSeconds: durationMinutes * 60,
      enrollmentId: enrollmentId || null,
      amount: amount || 0,
      currency: currency || 'TWD',
      status: 'PENDING',
      createdAt,
      updatedAt: createdAt,
    };

    const command = new PutCommand({
      TableName: ORDERS_TABLE,
      Item: order,
    });
    await docClient.send(command);

    return NextResponse.json({
      message: 'Order created successfully',
      order,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating order:', error?.message || error);
    return NextResponse.json({ error: 'Failed to create order', detail: error?.message || String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const TableName = ORDERS_TABLE || 'jvtutorcorner-orders';

    const url = new URL(request.url);
    const params = url.searchParams;
    const limitParam = parseInt(params.get('limit') || '20', 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);

    const lastKeyParam = params.get('lastKey');
    let exclusiveStartKey: any = undefined;
    if (lastKeyParam) {
      try {
        const decoded = Buffer.from(lastKeyParam, 'base64').toString('utf8');
        exclusiveStartKey = JSON.parse(decoded);
      } catch (e) {
        exclusiveStartKey = { orderId: lastKeyParam };
      }
    }

    const filters: string[] = [];
    const ExpressionAttributeValues: Record<string, any> = {};

    const status = params.get('status');
    const enrollmentId = params.get('enrollmentId');
    const userId = params.get('userId');
    const courseId = params.get('courseId');
    const orderIdFilter = params.get('orderId');
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');

    if (status) {
      filters.push('#status = :status');
      ExpressionAttributeValues[':status'] = status;
    }
    if (enrollmentId) {
      filters.push('enrollmentId = :enrollmentId');
      ExpressionAttributeValues[':enrollmentId'] = enrollmentId;
    }
    if (userId) {
      filters.push('userId = :userId');
      ExpressionAttributeValues[':userId'] = userId;
    }
    if (courseId) {
      filters.push('courseId = :courseId');
      ExpressionAttributeValues[':courseId'] = courseId;
    }
    if (orderIdFilter) {
      filters.push('orderId = :orderId');
      ExpressionAttributeValues[':orderId'] = orderIdFilter;
    }
    if (startDate || endDate) {
      if (startDate && endDate) {
        filters.push('#createdAt BETWEEN :startDate AND :endDate');
        ExpressionAttributeValues[':startDate'] = startDate;
        ExpressionAttributeValues[':endDate'] = endDate;
      } else if (startDate) {
        filters.push('#createdAt >= :startDate');
        ExpressionAttributeValues[':startDate'] = startDate;
      } else if (endDate) {
        filters.push('#createdAt <= :endDate');
        ExpressionAttributeValues[':endDate'] = endDate;
      }
    }

    const scanInput: any = { TableName, Limit: limit };
    if (Object.keys(ExpressionAttributeValues).length > 0) {
      scanInput.FilterExpression = filters.join(' AND ');
      scanInput.ExpressionAttributeValues = ExpressionAttributeValues;
      const names: Record<string, string> = {};
      if (filters.some((f) => f.includes('#status'))) names['#status'] = 'status';
      if (filters.some((f) => f.includes('#createdAt'))) names['#createdAt'] = 'createdAt';
      if (Object.keys(names).length > 0) scanInput.ExpressionAttributeNames = names;
    }
    if (exclusiveStartKey) scanInput.ExclusiveStartKey = exclusiveStartKey;

    const res = await docClient.send(new ScanCommand(scanInput));
    const items = (res.Items || []) as any[];

    // Resolve User Names and Course Titles
    const userIds = Array.from(new Set(items.map(o => o.userId).filter(Boolean)));
    const courseIds = Array.from(new Set(items.map(o => o.courseId).filter(Boolean)));

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

    const userMap: Record<string, string> = {};
    const courseMap: Record<string, string> = {};

    await Promise.all(userIds.map(async (uid) => {
      try {
        const uRes = await docClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id: uid } }));
        if (uRes.Item) {
          userMap[uid] = uRes.Item.fullName || `${uRes.Item.firstName || ''} ${uRes.Item.lastName || ''}`.trim() || uRes.Item.email || uid;
        } else {
          userMap[uid] = uid;
        }
      } catch (e) {
        userMap[uid] = uid;
      }
    }));

    await Promise.all(courseIds.map(async (cid) => {
      try {
        const cRes = await docClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: cid } }));
        if (cRes.Item) {
          courseMap[cid] = cRes.Item.title || cid;
        } else {
          courseMap[cid] = cid;
        }
      } catch (e) {
        courseMap[cid] = cid;
      }
    }));

    const enrichedItems = items.map(o => ({
      ...o,
      userName: userMap[o.userId] || o.userId,
      courseTitle: courseMap[o.courseId] || o.courseId
    }));

    const lastEvaluatedKey = (res as any).LastEvaluatedKey;
    let encodedLastKey: string | null = null;
    if (lastEvaluatedKey) {
      try {
        encodedLastKey = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
      } catch (e) {
        encodedLastKey = null;
      }
    }

    if (orderIdFilter && items.length === 0) {
      return NextResponse.json({ ok: false, error: `Order with ID ${orderIdFilter} not found` }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, total: enrichedItems.length, data: enrichedItems, lastKey: encodedLastKey },
      { status: 200 },
    );
  } catch (err) {
    console.error('orders GET error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to list orders' }, { status: 500 });
  }
}

