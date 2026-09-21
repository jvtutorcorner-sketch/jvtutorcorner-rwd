// app/api/points-escrow/route.ts
// Admin API for managing the points escrow system.
//
// GET    /api/points-escrow?[status=HOLDING|RELEASED|REFUNDED][&studentId=...][&teacherId=...][&orderId=...]
//        → List escrow records (admin)
//
// POST   /api/points-escrow  { action: 'release' | 'refund', escrowId }
//        → Release (to teacher) or Refund (to student) a HOLDING escrow

import { NextResponse } from 'next/server';
import {
  getEscrow,
  getEscrowByOrder,
  listEscrows,
  releaseEscrow,
  refundEscrow,
  type EscrowStatus,
} from '@/lib/pointsEscrow';
import { withAuth, withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';

export const runtime = 'nodejs';

/**
 * 這些紀錄含有學生／老師 id 與點數金額，先前 GET 與 POST 都沒有任何驗證：
 * 匿名呼叫可以列出全部託管紀錄，也可以任意把點數釋出給老師或退回學生。
 *
 * 現在 GET 需要登入，且非管理員一律被綁在自己的身分上；POST（實際搬動點數）限管理員。
 */
function assertOwnRecord(record: { studentId?: string; teacherId?: string }, req: AuthedRequest): boolean {
  const { role, userId } = req.session;
  if (role === 'admin' || role === 'system') return true;
  return record.studentId === userId || record.teacherId === userId;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET – list / query escrows
// ──────────────────────────────────────────────────────────────────────────────
async function handleGet(request: AuthedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const escrowId = searchParams.get('escrowId');
    const orderId = searchParams.get('orderId');
    const status = searchParams.get('status') as EscrowStatus | null;
    const studentId = searchParams.get('studentId');
    const teacherId = searchParams.get('teacherId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const { role, userId: sessionUserId } = request.session;
    const isPrivileged = role === 'admin' || role === 'system';

    // Single record lookup
    if (escrowId) {
      const record = await getEscrow(escrowId);
      if (!record) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      if (!assertOwnRecord(record, request)) {
        return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, escrow: record });
    }

    if (orderId) {
      const record = await getEscrowByOrder(orderId);
      if (!record) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      if (!assertOwnRecord(record, request)) {
        return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, escrow: record });
    }

    // List with optional filters —— 非管理員只能看到掛在自己身上的紀錄，
    // 不管 query string 送了誰的 id。
    let effectiveStudentId = studentId ?? undefined;
    let effectiveTeacherId = teacherId ?? undefined;
    if (!isPrivileged) {
      if (role === 'teacher') {
        effectiveStudentId = undefined;
        effectiveTeacherId = sessionUserId;
      } else {
        effectiveStudentId = sessionUserId;
        effectiveTeacherId = undefined;
      }
    }

    const records = await listEscrows({
      status: status ?? undefined,
      studentId: effectiveStudentId,
      teacherId: effectiveTeacherId,
      limit,
    });

    return NextResponse.json({ ok: true, total: records.length, data: records });
  } catch (err: any) {
    console.error('[points-escrow GET] Error:', err?.message || err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);

// ──────────────────────────────────────────────────────────────────────────────
// POST – release or refund an escrow
// ──────────────────────────────────────────────────────────────────────────────
async function handlePost(request: AuthedRequest) {
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

export const POST = withAdmin(handlePost);
