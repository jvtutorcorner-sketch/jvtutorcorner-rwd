import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyCourseAccess } from '@/lib/accessControl';
import { analyzeLearningContentImage } from '@/lib/learningContentAnalysis';

// Intentionally below Next's binary-10MiB proxy body-clone ceiling
// (experimental.proxyClientMaxBodySize, default 10_485_760 bytes). Next silently
// truncates the body once it crosses that ceiling, which turns a too-large request
// into invalid JSON and a generic 400 instead of a real 413 — so this check must
// fire first, with margin, rather than sit at the same magnitude as Next's limit.
const MAX_IMAGE_BASE64_LENGTH = 10_000_000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function stripDataUrl(value: string): { mimeType: string; data: string } {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (match) return { mimeType: match[1].toLowerCase(), data: match[2] };
  return { mimeType: 'image/jpeg', data: value };
}

export const POST = withAuth(async (request: AuthedRequest) => {
  try {
    // Reject by Content-Length before reading the body: once the body is larger
    // than Next's proxy clone ceiling it arrives truncated, so checking
    // rawImage.length after JSON.parse would be too late to see (or would throw).
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json({ ok: false, error: 'image too large' }, { status: 413 });
    }

    const body = await request.json();
    const rawImage = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!rawImage) return NextResponse.json({ ok: false, error: 'imageBase64 required' }, { status: 400 });
    if (rawImage.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json({ ok: false, error: 'image too large' }, { status: 413 });
    }

    const parsed = stripDataUrl(rawImage);
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.toLowerCase() : parsed.mimeType;
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ ok: false, error: 'unsupported image type' }, { status: 415 });
    }

    const courseId = typeof body?.courseId === 'string' ? body.courseId.trim() : '';
    if (courseId && request.session.role !== 'admin' && request.session.role !== 'system') {
      const access = await verifyCourseAccess(request.session.userId, courseId);
      if (!access.granted) {
        return NextResponse.json({ ok: false, error: 'course access required' }, { status: 403 });
      }
    }

    const analysis = await analyzeLearningContentImage(parsed.data, mimeType);
    if (!analysis.result) {
      return NextResponse.json({ ok: false, error: analysis.reason || 'analysis unavailable' }, { status: 503 });
    }

    return NextResponse.json({ ok: true, analysis: analysis.result, courseId: courseId || null });
  } catch (error: unknown) {
    console.error('[learning-content-analysis] request error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'invalid learning content analysis request' }, { status: 400 });
  }
});
