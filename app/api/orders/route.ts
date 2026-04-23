import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { COURSES } from '@/data/courses';
import { deductUserPoints } from '@/lib/pointsStorage';
import { createEscrow } from '@/lib/pointsEscrow';

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
    const body = await request.json();
    const { 
      courseId, enrollmentId, amount, currency, userId: clientUserId, 
      startTime, endTime, paymentMethod, pointsUsed, status: clientStatus 
    } = body;
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

    // Fetch course duration, total sessions, pointCost, and teacherId (server-authoritative)
    let durationMinutes = 0;
    let totalSessions = 1;
    let courseTitle = '';
    let courseTeacherName = '';
    let courseStartDate = '';
    let courseStartTime = '';
    let courseEndTime = '';
    let coursePointCost = 0;
    let courseTeacherId = '';

    try {
      if (courseId) {
        const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
        const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } });
        const res = await docClient.send(getCmd);
        if (res.Item) {
          durationMinutes = res.Item.durationMinutes || 0;
          totalSessions = res.Item.totalSessions || 1;
          courseTitle = res.Item.title || '';
          coursePointCost = Number(res.Item.pointCost) || 0;
          courseTeacherId = res.Item.teacherId || res.Item.teacherEmail || '';
          courseTeacherName = res.Item.teacherName || '';
          courseStartDate = res.Item.startDate || res.Item.nextStartDate || '';
          courseStartTime = res.Item.startTime || '';
          courseEndTime = res.Item.endTime || '';
        } else {
          const course = COURSES.find(c => c.id === courseId);
          durationMinutes = course?.durationMinutes || 0;
          totalSessions = course?.totalSessions || 1;
          courseTitle = course?.title || '';
          coursePointCost = Number((course as any)?.pointCost) || 0;
          courseTeacherId = (course as any)?.teacherId || (course as any)?.teacherEmail || '';
          courseTeacherName = (course as any)?.teacherName || '';
          courseStartDate = (course as any)?.startDate || '';
          courseStartTime = (course as any)?.startTime || '';
          courseEndTime = (course as any)?.endTime || '';
        }
      }
    } catch (e) {
      console.warn('[orders API] Failed to fetch course data:', e);
    }

    // 🟢 Point Deduction Logic (server-authoritative: use coursePointCost from DB, not client-provided value)
    // effectivePointsToDeduct: use server's coursePointCost as authority; fall back to client-sent value only if course not in DB
    const effectivePointsToDeduct =
      paymentMethod === 'points'
        ? (coursePointCost > 0 ? coursePointCost : Number(pointsUsed) || 0)
        : 0;

    let pointsEscrowId: string | null = null;

    if (paymentMethod === 'points') {
      if (effectivePointsToDeduct > 0) {
        const deductResult = await deductUserPoints(userId, effectivePointsToDeduct);
        if (!deductResult.ok) {
          return NextResponse.json({
            error: deductResult.error,
            ok: false,
          }, { status: 400 });
        }

        // 🔒 Place deducted points into escrow until course completion
        const newEscrowId = randomUUID();
        try {
          // Build the core escrow params first
          const escrowParams: any = {
            escrowId: newEscrowId,
            orderId,
            enrollmentId: enrollmentId || '',
            studentId: userId,
            teacherId: courseTeacherId,
            courseId,
            courseTitle,
            points: effectivePointsToDeduct,
          };

          // Add optional display fields if available
          if (courseTeacherName) escrowParams.teacherName = courseTeacherName;
          if (durationMinutes) escrowParams.durationMinutes = durationMinutes;
          if (totalSessions) escrowParams.totalSessions = totalSessions;
          if (courseStartDate) escrowParams.courseStartDate = courseStartDate;
          if (courseStartTime) escrowParams.courseStartTime = courseStartTime;
          if (courseEndTime) escrowParams.courseEndTime = courseEndTime;

          await createEscrow(escrowParams);
          pointsEscrowId = newEscrowId;
        } catch (escrowErr) {
          // Escrow creation failure is non-fatal — points were already deducted.
          // Log clearly so ops team can manually reconcile if needed.
          console.error(
            `[orders API] ⚠️ ESCROW CREATION FAILED for order ${orderId}. Points were deducted but escrow not recorded. Manual reconciliation required.`,
            escrowErr
          );
        }
      } else if (effectivePointsToDeduct === 0) {
        // paymentMethod is 'points' but no point cost found — reject to prevent free enrollment
        return NextResponse.json({
          error: '此課程未設定點數費用，無法以點數報名。',
          ok: false,
        }, { status: 400 });
      }
    }

    const order = {
      orderId,
      orderNumber,
      userId,
      courseId: courseId || null,
      courseTitle,
      durationMinutes,
      totalSessions,
      remainingSessions: totalSessions,
      remainingSeconds: durationMinutes * 60,
      enrollmentId: enrollmentId || null,
      amount: amount || 0,
      currency: currency || 'TWD',
      paymentMethod: paymentMethod || null,
      pointsUsed: effectivePointsToDeduct || 0,
      pointsEscrowId: pointsEscrowId || null,
      status: clientStatus || 'PENDING',
      startTime: startTime || null,
      endTime: endTime || null,
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
      ok: true,
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

    // Determine the very final encoded key for pagination returning
    const lastEvaluatedKey = (res as any).LastEvaluatedKey;
    let encodedLastKey: string | null = null;
    if (lastEvaluatedKey) {
      try {
        encodedLastKey = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
      } catch (e) {
        encodedLastKey = null;
      }
    }

    // Resolve User Names and Course Titles
    const userIds = Array.from(new Set(items.map(o => o.userId).filter(Boolean)));
    const courseIds = Array.from(new Set(items.map(o => o.courseId).filter(Boolean)));

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

    const userMap: Record<string, string> = {};
    const courseMap: Record<string, string> = {};
    const teacherMap: Record<string, string> = {};

    await Promise.all(userIds.map(async (uid) => {
      try {
        let item: any = null;
        // Try direct lookup by id first
        const uRes = await docClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id: uid } }));
        item = uRes.Item || null;
        // If not found, scan by email (userId is often the email)
        if (!item) {
          const { ScanCommand: SC } = await import('@aws-sdk/lib-dynamodb');
          const scanRes = await docClient.send(new SC({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': String(uid).toLowerCase() }
          }));
          item = scanRes.Items?.[0] || null;
        }
        if (item) {
          const name = item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim();
          userMap[uid] = name || '學生'; // never fall back to email
        } else {
          userMap[uid] = '學生'; // unknown user — show generic label, not email
        }
      } catch (e) {
        userMap[uid] = '學生';
      }
    }));

    await Promise.all(courseIds.map(async (cid) => {
      try {
        const cRes = await docClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: cid } }));
        if (cRes.Item) {
          courseMap[cid] = cRes.Item.title || cid;
          const courseTeacherId = cRes.Item.teacherId || '';
          let tName = '';

          // Step 1: Try to get teacher's firstName + lastName from profiles table via teacherId
          if (courseTeacherId) {
            try {
              // Scan profiles for matching roid_id (which stores teacherId)
              const { ScanCommand: SC2 } = await import('@aws-sdk/lib-dynamodb');
              const pScan = await docClient.send(new SC2({
                TableName: PROFILES_TABLE,
                FilterExpression: 'roid_id = :rid OR id = :rid',
                ExpressionAttributeValues: { ':rid': courseTeacherId }
              }));
              const pItem = pScan.Items?.[0];
              if (pItem) {
                const firstName = pItem.firstName || '';
                const lastName = pItem.lastName || '';
                tName = `${firstName} ${lastName}`.trim() || pItem.fullName || pItem.displayName || '';
              }
            } catch (e) {
              // ignore profile lookup failure
            }
          }

          // Step 2: Fallback to teachers table name
          if (!tName && courseTeacherId) {
            try {
              const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
              const tRes = await docClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: courseTeacherId } }));
              if (tRes.Item) {
                const firstName = tRes.Item.firstName || '';
                const lastName = tRes.Item.lastName || '';
                tName = `${firstName} ${lastName}`.trim() ||
                  tRes.Item.name || tRes.Item.displayName || '';
              }
            } catch (e) {
              // ignore teacher table lookup failure
            }
          }

          // Step 3: Last resort — use the stored teacherName from the course (but not 'Unknown Teacher')
          if (!tName || tName === 'Unknown Teacher') {
            const stored = cRes.Item.teacherName || cRes.Item.teacher || '';
            tName = (stored && stored !== 'Unknown Teacher') ? stored : '';
          }

          teacherMap[cid] = tName;
        } else {
          courseMap[cid] = cid;
        }
      } catch (e) {
        courseMap[cid] = cid;
      }
    }));

    const enrichedItems = items.map(o => ({
      ...o,
      userName: userMap[o.userId] || '學生',
      courseTitle: courseMap[o.courseId] || o.courseId,
      teacherName: o.courseId ? (teacherMap[o.courseId] || '') : ''
    }));

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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ ok: false, error: 'orderId is required' }, { status: 400 });
    }

    const deleteCmd = new DeleteCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
    });

    await docClient.send(deleteCmd);

    return NextResponse.json({ ok: true, message: `Order ${orderId} deleted successfully` }, { status: 200 });
  } catch (err: any) {
    console.error('orders DELETE error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to delete order', detail: err?.message }, { status: 500 });
  }
}

