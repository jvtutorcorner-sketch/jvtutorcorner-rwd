import { NextResponse } from 'next/server';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyCourseAccess } from '@/lib/accessControl';
import { analyzeLearningContentImage } from '@/lib/learningContentAnalysis';

/**
 * Legacy API compatibility route.
 *
 * The former product-scan endpoint awarded points from detected products.
 * It now delegates to the teaching-content analysis flow and never modifies
 * a profile or grants points based on client-submitted data.
 */
export const POST = withAuth(async (request: AuthedRequest) => {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');
    const courseId = typeof formData.get('courseId') === 'string' ? String(formData.get('courseId')).trim() : '';

    if (!(imageFile instanceof File)) {
      return NextResponse.json({ ok: false, error: '未提供教材圖片' }, { status: 400 });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
      return NextResponse.json({ ok: false, error: '不支援的教材圖片格式' }, { status: 415 });
    }
    if (imageFile.size > 7 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: '圖片大小不可超過 7 MB' }, { status: 413 });
    }

    if (courseId && request.session.role !== 'admin' && request.session.role !== 'system') {
      const access = await verifyCourseAccess(request.session.userId, courseId);
      if (!access.granted) {
        return NextResponse.json({ ok: false, error: 'course access required' }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const analysis = await analyzeLearningContentImage(buffer.toString('base64'), imageFile.type);
    if (!analysis.result) {
      return NextResponse.json({ ok: false, error: analysis.reason || '教材分析功能尚未啟用' }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      deprecated: true,
      message: '請改用 /api/learning-content-analysis。',
      analysis: analysis.result,
      courseId: courseId || null,
    });
  } catch (error: unknown) {
    console.error('[scan-product legacy alias] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: '教材分析請求格式錯誤' }, { status: 400 });
  }
});
