import { NextResponse } from 'next/server';
import { getMakeConfig, saveMakeConfig } from '@/lib/integration/makeRuntimeConfig';
import { extractTokenFromRequest, getSession } from '@/lib/auth/sessionManager';

async function requireAdmin(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  const session = await getSession(token);
  if (session?.role !== 'admin') return null;
  return session;
}

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getMakeConfig();
  // Mask webhook URL partially for display
  const maskedUrl = config.webhookUrl
    ? config.webhookUrl.replace(/\/[^/]{8,}$/, '/••••••••')
    : null;

  return NextResponse.json({
    configured: config.configured,
    source: config.source,
    updatedAt: config.updatedAt,
    webhookUrlPreview: maskedUrl,
  });
}

export async function PUT(req: Request) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { webhookUrl, webhookSecret } = body;

  if (!webhookUrl || !webhookUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'webhookUrl must be an HTTPS URL' }, { status: 400 });
  }

  await saveMakeConfig(webhookUrl, webhookSecret);
  return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
}
