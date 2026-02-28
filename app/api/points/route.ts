// app/api/points/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export const runtime = 'nodejs';

const TABLE_NAME = process.env.DYNAMODB_TABLE_USER_POINTS || 'jvtutorcorner-user-points';

const useDynamo =
  typeof TABLE_NAME === 'string' &&
  TABLE_NAME.length > 0 &&
  (process.env.NODE_ENV === 'production' ||
    !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID));

// In-memory fallback for development
const LOCAL_POINTS: Record<string, number> = {};

async function getUserPoints(userId: string): Promise<number> {
  if (useDynamo) {
    try {
      const res = await ddbDocClient.send(
        new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
      );
      return typeof res.Item?.balance === 'number' ? res.Item.balance : 0;
    } catch (e) {
      console.error('[points API] DynamoDB get error:', e);
      return 0;
    }
  }
  return LOCAL_POINTS[userId] ?? 0;
}

async function setUserPoints(userId: string, balance: number): Promise<void> {
  if (useDynamo) {
    try {
      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { userId, balance, updatedAt: new Date().toISOString() },
        })
      );
    } catch (e) {
      console.error('[points API] DynamoDB put error:', e);
    }
    return;
  }
  LOCAL_POINTS[userId] = balance;
}

// GET /api/points?userId=xxx
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  const balance = await getUserPoints(userId);
  return NextResponse.json({ ok: true, userId, balance });
}

// POST /api/points
// { userId, action: 'add' | 'deduct' | 'set', amount }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action, amount, reason } = body;

    if (!userId || !action || typeof amount !== 'number') {
      return NextResponse.json(
        { ok: false, error: 'userId, action, amount are required' },
        { status: 400 }
      );
    }

    if (amount < 0) {
      return NextResponse.json(
        { ok: false, error: 'amount must be non-negative' },
        { status: 400 }
      );
    }

    const current = await getUserPoints(userId);
    let newBalance: number;

    if (action === 'add') {
      newBalance = current + amount;
    } else if (action === 'deduct') {
      if (current < amount) {
        return NextResponse.json(
          { ok: false, error: `點數不足，目前餘額 ${current} 點，需要 ${amount} 點`, balance: current },
          { status: 400 }
        );
      }
      newBalance = current - amount;
    } else if (action === 'set') {
      newBalance = amount;
    } else {
      return NextResponse.json(
        { ok: false, error: 'action must be add | deduct | set' },
        { status: 400 }
      );
    }

    await setUserPoints(userId, newBalance);

    console.log(`[points API] ${userId}: ${action} ${amount} (${current} -> ${newBalance}) reason=${reason || '-'}`);

    return NextResponse.json({ ok: true, userId, balance: newBalance, previous: current });
  } catch (err: any) {
    console.error('[points API] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
