import { NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { getObjectBuffer } from '@/lib/s3';
import { withAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyCourseAccess } from '@/lib/accessControl';
import { isSameUser } from '@/lib/identity';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

async function handler(req: AuthedRequest, context?: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context!.params;
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
    }
    if (!key.startsWith(`course-materials/${id}/`)) {
      return NextResponse.json({ ok: false, error: 'Invalid material key' }, { status: 400 });
    }

    if (req.session.role !== 'admin') {
      let allowed = false;
      if (req.session.role === 'teacher') {
        const courseRes = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id } }));
        const course = courseRes.Item;
        allowed = Boolean(course && (isSameUser(course.teacherId, req.session.userId) || isSameUser(course.teacherEmail, req.session.email)));
      }
      if (!allowed) {
        const access = await verifyCourseAccess(req.session.userId, id);
        allowed = access.granted;
      }
      if (!allowed) {
        return NextResponse.json({ ok: false, error: '請先報名課程以檢視教材' }, { status: 403 });
      }
    }

    const buffer = await getObjectBuffer(key);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: any) {
    console.error('[materials/preview] error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to load material' }, { status: 500 });
  }
}

export const GET = withAuth(handler);
