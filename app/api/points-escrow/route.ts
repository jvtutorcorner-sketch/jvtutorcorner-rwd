// app/api/points-escrow/route.ts
// Admin API for managing the points escrow system.
//
// GET    /api/points-escrow?[status=HOLDING|RELEASED|REFUNDED][&studentId=...][&teacherId=...][&orderId=...]
//        → List escrow records (admin)
//
// POST   /api/points-escrow  { action: 'release' | 'refund', escrowId }
//        → Release (to teacher) or Refund (to student) a HOLDING escrow

import { NextRequest, NextResponse } from 'next/server';
import {
  getEscrow,
  getEscrowByOrder,
  listEscrows,
  releaseEscrow,
  refundEscrow,
  type EscrowStatus,
} from '@/lib/pointsEscrow';

export const runtime = 'nodejs';

// ──────────────────────────────────────────────────────────────────────────────
// GET – list / query escrows
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrowId');
    const orderId = searchParams.get('orderId');
    const status = searchParams.get('status') as EscrowStatus | null;
    const studentId = searchParams.get('studentId');
    const teacherId = searchParams.get('teacherId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Single record lookup
    if (escrowId) {
      const record = await getEscrow(escrowId);
      if (!record) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true, escrow: record });
    }

    if (orderId) {
      const record = await getEscrowByOrder(orderId);
      if (!record) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true, escrow: record });
    }

    // List with optional filters
    const records = await listEscrows({
      status: status ?? undefined,
      studentId: studentId ?? undefined,
      teacherId: teacherId ?? undefined,
      limit,
    });

    return NextResponse.json({ ok: true, total: records.length, data: records });
  } catch (err: any) {
    console.error('[points-escrow GET] Error:', err?.message || err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST – release or refund an escrow
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, escrowId } = body as { action?: string; escrowId?: string };

    if (!escrowId) {
      return NextResponse.json({ ok: false, error: 'escrowId is required' }, { status: 400 });
    }

    if (action === 'release') {
      const result = await releaseEscrow(escrowId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        message: `Escrow ${escrowId} released to teacher`,
        teacherNewBalance: result.teacherNewBalance,
      });
    }

    if (action === 'refund') {
      const result = await refundEscrow(escrowId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        message: `Escrow ${escrowId} refunded to student`,
        studentNewBalance: result.studentNewBalance,
      });
    }

    return NextResponse.json(
      { ok: false, error: "action must be 'release' or 'refund'" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[points-escrow POST] Error:', err?.message || err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
