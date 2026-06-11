import { NextResponse } from 'next/server';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';
import { getProfileById } from '@/lib/profilesService';
import { saveQuestionnaire, markMakeComSent } from '@/lib/questionnaireService';
import { triggerMakeComEvent, buildQuestionnairePayload } from '@/lib/integration/makeComConfig';
import type { LearningQuestionnaireValues } from '@/types/questionnaire';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, data }: { mode: string; data: LearningQuestionnaireValues } = body;

    if (!data) {
      return NextResponse.json({ error: 'data required' }, { status: 400 });
    }

    // Get session if logged in (optional — questionnaire can be submitted anonymously)
    const token = extractTokenFromRequest(req);
    const session = token ? await getSession(token) : null;

    let userId = session?.userId || 'anonymous';
    let lineUid: string | undefined;
    let displayName: string | undefined;

    if (session?.userId && session.userId !== 'anonymous') {
      const profile = await getProfileById(session.userId).catch(() => null);
      lineUid = profile?.lineUid || undefined;
      displayName = profile?.nickname || profile?.firstName || undefined;
    }

    const submission = await saveQuestionnaire(userId, mode || 'learning', data, { lineUid, displayName });

    // Fire Make.com webhook (non-blocking)
    triggerMakeComEvent('QUESTIONNAIRE_SUBMITTED', buildQuestionnairePayload(submission))
      .then(() => markMakeComSent(submission.id))
      .catch(e => console.warn('[questionnaire] Make.com notify failed', e?.message || e));

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err: any) {
    console.error('[questionnaire] POST error', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await getSession(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getQuestionnairesByUserId } = await import('@/lib/questionnaireService');
  const submissions = await getQuestionnairesByUserId(session.userId);
  return NextResponse.json({ submissions });
}
