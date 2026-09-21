// app/api/class-summaries/route.ts
//
// GET /api/class-summaries?orderId=...  (or ?summaryId=...)
//
// Returns the class summary for a course the caller has access to (its teacher, the
// enrolled student, or an org admin — enforced via verifyClassroomAccess against the
// row's courseId). PROCESSING rows return status only; READY rows include the summary.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import { getClassSummary, getClassSummaryByOrder } from '@/lib/classSummaryService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGet(req: AuthedRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const summaryId = searchParams.get('summaryId');
  if (!orderId && !summaryId) {
    return NextResponse.json({ ok: false, error: 'orderId or summaryId is required' }, { status: 400 });
  }

  const row = summaryId ? await getClassSummary(summaryId) : await getClassSummaryByOrder(orderId!);
  if (!row) return NextResponse.json({ ok: true, summary: null });

  const access = await verifyClassroomAccess(req.session, row.courseId);
  if (!access.granted) return NextResponse.json({ ok: false, error: 'No access' }, { status: 403 });

  return NextResponse.json({
    ok: true,
    summary: {
      summaryId: row.summaryId,
      status: row.status,
      courseId: row.courseId,
      orderId: row.orderId,
      updatedAt: row.updatedAt,
      // Only expose the generated content when it exists.
      content: row.status === 'READY' ? row.summary ?? null : null,
    },
  });
}

export const GET = withAuth(handleGet);
