// app/api/points/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';

export const runtime = 'nodejs';
export const revalidate = 0; // Disable caching for point balance

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
