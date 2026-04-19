// app/api/points/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';
import { withAnyAuth, AuthedRequest } from '@/lib/auth/apiGuard';

const API_PATH = '/api/points';


export const runtime = 'nodejs';
export const revalidate = 0; // Disable caching for point balance

// GET /api/points?userId=xxx
const _GET = withAnyAuth(API_PATH, async (req: AuthedRequest) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  // 非 admin/system 使用者只能查詢自己的點數
  // session.userId is stored as roid_id; also accept session.email match for email-keyed lookups
  const isSelf = req.session.userId === userId || req.session.email === userId;
  if (req.session.role !== 'admin' && req.session.role !== 'system' && !isSelf) {
    return NextResponse.json({ ok: false, error: 'Forbidden: cannot query other user points' }, { status: 403 });
  }

  const balance = await getUserPoints(userId);
  return NextResponse.json({ ok: true, userId, balance });
});

export const GET = _GET;

// POST /api/points
// { userId, action: 'add' | 'deduct' | 'set', amount }
const _POST = withAnyAuth(API_PATH, async (req: AuthedRequest) => {
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

    // 非 admin/system 不能修改其他使用者點數
    // session.userId is stored as roid_id; also accept session.email match for email-keyed mutations
    const isSelf = req.session.userId === userId || req.session.email === userId;
    if (req.session.role !== 'admin' && req.session.role !== 'system' && !isSelf) {
      return NextResponse.json({ ok: false, error: 'Forbidden: cannot modify other user points' }, { status: 403 });
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

    console.log(`[points API] ${userId}: ${action} ${amount} (${current} -> ${newBalance}) reason=${reason || '-'} by=${req.session.email}`);

    // Trigger Workflow (non-blocking)
    if (action === 'add') {
        import('@/lib/workflowEngine').then(({ triggerWorkflow }) => {
            triggerWorkflow('trigger_point_purchase', {
                userId,
                amount,
                previous: current,
                balance: newBalance,
                reason: reason || 'Point purchase'
            });
        }).catch(err => console.error('[points API] Workflow trigger failed:', err));
    }

    return NextResponse.json({ ok: true, userId, balance: newBalance, previous: current });
  } catch (err: any) {
    console.error('[points API] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
});

export const POST = _POST;
