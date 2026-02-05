
import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import resolveDataFile from '@/lib/localData';

// DynamoDB client initialization: prefer explicit credentials when provided (local/dev),
// otherwise fall back to SDK default chain (IAM role in prod).
const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
  accessKeyId: ddbExplicitAccessKey as string,
  secretAccessKey: ddbExplicitSecretKey as string,
  ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

console.log(`[orders API] DynamoDB region: ${ddbRegion}, AWS creds present: ${ddbExplicitAccessKey ? 'yes' : 'no'}`);

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client);

// Placeholder for real user session check
const getUserId = async (): Promise<string | null> => {
  return 'mock-user-123';
};

// Development fallback: keep orders in memory when DynamoDB isn't configured
let LOCAL_ORDERS: any[] = [];
const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS;
// Enable DynamoDB when a table name is provided and either running in production
// or explicit AWS credentials are available in env (useful for local dev).
const useDynamo =
  typeof ORDERS_TABLE === 'string' && ORDERS_TABLE.length > 0 && (
    process.env.NODE_ENV === 'production' || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  );

async function loadLocalOrders() {
  try {
    const ORDERS_FILE = await resolveDataFile('orders.json');
    if (fs.existsSync(ORDERS_FILE)) {
      const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
      LOCAL_ORDERS = JSON.parse(raw || '[]');
    }
  } catch (e) {
    console.warn('[orders API] failed to load local orders', (e as any)?.message || e);
    LOCAL_ORDERS = [];
  }
}

async function saveLocalOrders() {
  try {
    const ORDERS_FILE = await resolveDataFile('orders.json');
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(LOCAL_ORDERS, null, 2), 'utf8');
  } catch (e) {
    console.warn('[orders API] failed to save local orders', (e as any)?.message || e);
  }
}

if (!useDynamo) {
  console.warn(`[orders API] Not using DynamoDB (NODE_ENV=${process.env.NODE_ENV}, DYNAMODB_TABLE_ORDERS=${ORDERS_TABLE}). Using LOCAL_ORDERS fallback.`);
  // load persisted orders in dev (non-blocking)
  loadLocalOrders().catch(() => {});
} else {
  console.log(`[orders API] Using DynamoDB Table: ${ORDERS_TABLE}`);
}

export async function POST(request: Request) {
  try {
    const { courseId, enrollmentId, amount, currency } = await request.json();
    let userId = await getUserId();

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 });
    }

    // If no authenticated userId (dev/demo), or if it's a placeholder mock user, try to derive user from enrollment record
    if (!userId || String(userId).startsWith('mock-user')) {
      try {
        // attempt to read local enrollments file (same fallback used by /api/enroll)
        const ENROLL_FILE = await resolveDataFile('enrollments.json');
        if (fs.existsSync(ENROLL_FILE)) {
          const raw = fs.readFileSync(ENROLL_FILE, 'utf8');
          const localEnrolls = JSON.parse(raw || '[]');
          const found = localEnrolls.find((e: any) => e.id === enrollmentId);
          if (found && found.email) {
            // use raw email as userId in dev mode so client-side filtering matches
            userId = String(found.email);
          }
        }
      } catch (e) {
        // ignore and fall through to default behavior
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const orderId = randomUUID();
    const createdAt = new Date().toISOString();
    // Human-friendly display number which includes user id and timestamp (updated on status changes)
    const orderNumber = `${userId}-${createdAt}`;

    const order = {
      orderId,
      orderNumber,
      userId,
      courseId,
      enrollmentId: enrollmentId || null,
      amount: amount || 0,
      currency: currency || 'TWD',
      status: 'PENDING', // PENDING, PAID, CANCELLED, REFUNDED
      createdAt,
      updatedAt: createdAt,
    };

    if (useDynamo) {
      const command = new PutCommand({
        TableName: ORDERS_TABLE,
        Item: order,
      });
      await docClient.send(command);
    } else {
      // dev fallback: push to in-memory store
        LOCAL_ORDERS.unshift(order);
        // persist to disk when possible
        saveLocalOrders().catch(() => {});
    }

    return NextResponse.json({
      message: 'Order created successfully',
      order,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating order:', error?.message || error, error?.stack);
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
        // try base64 decoded JSON
        const decoded = Buffer.from(lastKeyParam, 'base64').toString('utf8');
        exclusiveStartKey = JSON.parse(decoded);
      } catch (e) {
        // fallback: treat as simple orderId
        exclusiveStartKey = { orderId: lastKeyParam };
      }
    }

    // support simple filters: status, enrollmentId, userId, courseId, orderId
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
      // allow filtering by orderId
      filters.push('orderId = :orderId');
      ExpressionAttributeValues[':orderId'] = orderIdFilter;
    }
    if (startDate || endDate) {
      // Use createdAt attribute for date range filtering. Expect ISO date strings.
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

    // If not using Dynamo, reload local file each request to reflect persisted updates
    if (!useDynamo) {
      try {
        const ORDERS_FILE = await resolveDataFile('orders.json');
        if (fs.existsSync(ORDERS_FILE)) {
          const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
          LOCAL_ORDERS = JSON.parse(raw || '[]');
        } else {
          LOCAL_ORDERS = [];
        }
      } catch (e) {
        LOCAL_ORDERS = LOCAL_ORDERS || [];
      }
      const items = LOCAL_ORDERS.slice(0, limit);
      return NextResponse.json({ ok: true, total: LOCAL_ORDERS.length, data: items, lastKey: null }, { status: 200 });
    }

    const scanInput: any = { TableName, Limit: limit };
    if (Object.keys(ExpressionAttributeValues).length > 0) {
      scanInput.FilterExpression = filters.join(' AND ');
      scanInput.ExpressionAttributeValues = ExpressionAttributeValues;
      // map reserved attribute names
      const names: Record<string, string> = {};
      if (filters.some((f) => f.includes('#status'))) names['#status'] = 'status';
      if (filters.some((f) => f.includes('#createdAt'))) names['#createdAt'] = 'createdAt';
      if (Object.keys(names).length > 0) scanInput.ExpressionAttributeNames = names;
    }
    if (exclusiveStartKey) scanInput.ExclusiveStartKey = exclusiveStartKey;

    const res = await docClient.send(new ScanCommand(scanInput));

    const items = (res.Items || []) as any[];
    const lastEvaluatedKey = (res as any).LastEvaluatedKey;
    let encodedLastKey: string | null = null;
    if (lastEvaluatedKey) {
      try {
        encodedLastKey = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
      } catch (e) {
        encodedLastKey = null;
      }
    }

    // If filtering by specific orderId and no results found, return 404
    if (orderIdFilter && items.length === 0) {
      return NextResponse.json({ ok: false, error: `Order with ID ${orderIdFilter} not found` }, { status: 404 });
    }

    return NextResponse.json(
      { ok: true, total: items.length, data: items, lastKey: encodedLastKey },
      { status: 200 },
    );
  } catch (err) {
    console.error('orders GET error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to list orders' }, { status: 500 });
  }
}
