import { NextResponse } from 'next/server';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyCourseAccess } from '@/lib/accessControl';
import { isSameUser } from '@/lib/identity';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

async function canView(session: AuthedRequest['session'], courseId: string, course: any): Promise<boolean> {
  if (session.role === 'admin') return true;
  if (session.role === 'teacher') {
    return Boolean(course && (isSameUser(course.teacherId, session.userId) || isSameUser(course.teacherEmail, session.email)));
  }
  const access = await verifyCourseAccess(session.userId, courseId);
  return access.granted;
}

async function getHandler(req: AuthedRequest, context?: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context!.params;
    const courseRes = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id } }));
    const course = courseRes.Item;
    if (!course) {
      return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 404 });
    }

    if (!(await canView(req.session, id, course))) {
      return NextResponse.json({ ok: false, error: '無權檢視此課程教材' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, materials: course.materials || [] });
  } catch (err: any) {
    console.error('[materials GET] error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

async function patchHandler(req: AuthedRequest, context?: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context!.params;
    const body = await req.json().catch(() => ({}));
    const { key, name, size } = body || {};

    if (!key || typeof key !== 'string' || !name || typeof name !== 'string') {
      return NextResponse.json({ ok: false, error: 'key and name are required' }, { status: 400 });
    }
    if (!key.startsWith(`course-materials/${id}/`)) {
      return NextResponse.json({ ok: false, error: 'Invalid material key for this course' }, { status: 400 });
    }

    const courseRes = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id } }));
    const course = courseRes.Item;
    if (!course) {
      return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 404 });
    }
    if (req.session.role !== 'admin' && !(isSameUser(course.teacherId, req.session.userId) || isSameUser(course.teacherEmail, req.session.email))) {
      return NextResponse.json({ ok: false, error: '無權編輯此課程教材' }, { status: 403 });
    }

    const material = { key, name, size: Number(size) || 0, uploadedAt: Date.now() };

    const updated = await ddbDocClient.send(new UpdateCommand({
      TableName: COURSES_TABLE,
      Key: { id },
      UpdateExpression: 'SET materials = list_append(if_not_exists(materials, :empty), :material)',
      ExpressionAttributeValues: { ':material': [material], ':empty': [] },
      ReturnValues: 'ALL_NEW',
    }));

    return NextResponse.json({ ok: true, materials: updated.Attributes?.materials || [] });
  } catch (err: any) {
    console.error('[materials PATCH] error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler, { roles: ['teacher', 'admin'] });
