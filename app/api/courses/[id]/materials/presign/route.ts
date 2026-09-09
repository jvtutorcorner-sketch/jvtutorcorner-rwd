import { NextResponse } from 'next/server';
import { getPresignedPutUrl } from '@/lib/s3';
import { withAuth, AuthedRequest } from '@/lib/auth/apiGuard';

async function handler(req: AuthedRequest, context?: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context!.params;
    const body = await req.json().catch(() => ({}));
    const { fileName, contentType } = body || {};

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ ok: false, error: 'fileName is required' }, { status: 400 });
    }

    const safeName = fileName.replace(/[^\w.\-一-龥]/g, '_');
    const key = `course-materials/${id}/${Date.now()}_${safeName}`;

    const { url, publicUrl } = await getPresignedPutUrl(key, contentType || 'application/pdf', 900);

    return NextResponse.json({ ok: true, url, key, publicUrl });
  } catch (err: any) {
    console.error('[materials/presign] error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}

export const POST = withAuth(handler, { roles: ['teacher', 'admin'] });
