// app/api/class-summaries/presign/route.ts
//
// POST /api/class-summaries/presign
// Body: { summaryId, seq, startMs, mimeType }
//
// Presigned PUT for one audio segment of a recorded class. Guarded: the caller must have
// classroom access to the summary's course, both sides must have consented, and the row
// must still be RECORDING with recording enabled. Each side records its own mic, so the
// key is namespaced by role for natural speaker separation.

import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';
import { getPresignedPutUrl } from '@/lib/s3';
import { getClassSummary, appendAudioKey } from '@/lib/classSummaryService';
import { canRecord } from '@/lib/classSummary/summaryLogic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' };

async function handlePost(req: AuthedRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const summaryId = typeof body?.summaryId === 'string' ? body.summaryId : '';
  const seq = Number(body?.seq);
  const startMs = Number(body?.startMs);
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'audio/webm';
  if (!summaryId || !Number.isFinite(seq) || !Number.isFinite(startMs)) {
    return NextResponse.json({ ok: false, error: 'summaryId, seq and startMs are required' }, { status: 400 });
  }

  const row = await getClassSummary(summaryId);
  if (!row) return NextResponse.json({ ok: false, error: 'Summary not found' }, { status: 404 });

  const access = await verifyClassroomAccess(req.session, row.courseId);
  if (!access.granted) return NextResponse.json({ ok: false, error: 'No access to this class' }, { status: 403 });

  if (row.status !== 'RECORDING' || !row.recordingEnabled || !canRecord(row.consent)) {
    return NextResponse.json({ ok: false, error: 'Recording not permitted for this class' }, { status: 409 });
  }

  const role = access.isHost ? 'teacher' : 'student';
  const ext = EXT[mimeType] || 'webm';
  const key = `class-audio/${summaryId}/${role}/${String(seq).padStart(4, '0')}-${startMs}.${ext}`;
  try {
    const { url } = await getPresignedPutUrl(key, mimeType, 900);
    await appendAudioKey(summaryId, key);
    return NextResponse.json({ ok: true, url, key });
  } catch (err) {
    console.error('[class-summaries/presign] error', err);
    return NextResponse.json({ ok: false, error: 'Failed to presign' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost);
