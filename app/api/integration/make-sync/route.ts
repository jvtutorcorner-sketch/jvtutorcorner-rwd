import { NextResponse } from 'next/server';
import { triggerMakeComEvent, buildQuestionnairePayload } from '@/lib/integration/makeComConfig';
import { getMakeConfig } from '@/lib/integration/makeRuntimeConfig';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';

async function requireAdmin(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  const session = await getSession(token);
  if (session?.role !== 'admin') return null;
  return session;
}

// Health check or outbound trigger
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('health') === 'true') {
    const config = await getMakeConfig();
    if (!config.configured || !config.webhookUrl) {
      return NextResponse.json({ ok: false, reason: 'Make.com not configured' }, { status: 503 });
    }
    try {
      await triggerMakeComEvent('HEALTH_CHECK', { source: 'jvtutorcorner', timestamp: new Date().toISOString() });
      return NextResponse.json({ ok: true, webhookUrl: config.webhookUrl, source: config.source });
    } catch (e: any) {
      return NextResponse.json({ ok: false, reason: e?.message || 'Request failed' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Use ?health=true or POST/PUT' }, { status: 400 });
}

// Single event push
export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, data, metadata } = body;

  if (!action || !data) {
    return NextResponse.json({ error: 'action and data required' }, { status: 400 });
  }

  try {
    await triggerMakeComEvent(action, { ...data, _meta: metadata });
    return NextResponse.json({ status: 'SENT_TO_MAKE_COM', action, sentAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 502 });
  }
}

// Bulk sync
export async function PUT(req: Request) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'questionnaires';
  const maxItems = parseInt(searchParams.get('maxItems') || '50', 10);

  if (type === 'questionnaires') {
    const { getQuestionnairesByUserId } = await import('@/lib/questionnaireService');
    // Sync all recent questionnaires (simplified: query by admin userId or all)
    // In production you'd use a scan or date-range query
    const submissions = await getQuestionnairesByUserId(session.userId);
    const items = submissions.slice(0, maxItems);

    let sent = 0;
    for (const submission of items) {
      try {
        await triggerMakeComEvent('QUESTIONNAIRE_SYNC', buildQuestionnairePayload(submission as any));
        sent++;
      } catch (e) {
        console.warn('[make-sync] Failed to sync submission', submission.id);
      }
    }

    return NextResponse.json({ status: 'BULK_SYNC_DONE', type, sent, total: items.length });
  }

  return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
}
