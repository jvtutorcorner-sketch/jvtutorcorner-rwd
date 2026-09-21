import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { COURSES as BUNDLED_COURSES } from '@/data/courses';
import { PutCommand, ScanCommand, QueryCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { canManageCourse, resolveOwnTeacherIds } from '@/lib/auth/courseOwnership';
import { resolveCanonicalTeacherId } from '@/lib/teacherIdentity';
import { decorateCoursesWithSeats, getCourseOccupancy } from '@/lib/seatAccounting';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

function getCourseSortTime(item: any): number {
  const candidates = [
    item?.updatedAt,
    item?.createdAt,
    item?.nextStartDate,
    item?.startDate,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function sortCoursesNewestFirst(items: any[]): any[] {
  return [...items].sort((a, b) => getCourseSortTime(b) - getCourseSortTime(a));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teacher = url.searchParams.get('teacher');
    const teacherId = url.searchParams.get('teacherId');
    const id = url.searchParams.get('id');

    if (id) {
      const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
      const res = await ddbDocClient.send(getCmd);

      let item = res && res.Item ? res.Item : null;

      // Fallback to bundled sample data for ID lookup
      if (!item && Array.isArray(BUNDLED_COURSES)) {
        const idNorm = String(id).trim();
        item = (BUNDLED_COURSES as any[]).find((x) => String(x.id || '').trim() === idNorm);
        if (!item) {
          try {
            const dec = decodeURIComponent(idNorm);
            item = (BUNDLED_COURSES as any[]).find((x) => String(x.id || '').trim() === dec);
          } catch (e) { }
        }
      }

      if (item) {
        // Look up teacher name if teacherId exists
        if (item.teacherId) {
          try {
            const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: item.teacherId } }));
            if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
              item.teacherName = tRes.Item.name || tRes.Item.displayName;
            }
          } catch (e) {
            console.warn('[courses GET] teacher lookup failed', e);
          }
        }
        // seatsLeft is derived from the enrollments table, not read from the
        // course row. The stored number was a capacity nothing ever decremented,
        // so it advertised the same "remaining" seats no matter how many people
        // had enrolled. See lib/seatAccounting.ts.
        try {
          const occupancy = await getCourseOccupancy(item as any);
          item.capacity = occupancy.capacity;
          item.seatsOccupied = occupancy.occupied;
          item.seatsLeft = occupancy.seatsLeft;
        } catch (e) {
          console.warn('[courses GET] seat occupancy lookup failed', e);
        }

        return NextResponse.json({ ok: true, course: item });
      }

      return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    }

    let items: any[] = [];

    if (teacherId) {
      // Query the byTeacherId GSI on the CANONICAL teacher id.
      //
      // This was a Scan filtered by `teacherId = :tid OR teacherEmail = :tid`,
      // which made the result depend on which spelling the caller happened to
      // hold: pass a teacher's id and you missed their legacy email-keyed
      // courses, pass their email and you missed the id-keyed ones. Resolving to
      // the canonical id first (lib/teacherIdentity.ts) means one lookup answers
      // for both spellings.
      const canonicalTeacherId = (await resolveCanonicalTeacherId(teacherId)) || teacherId;

      let exclusiveStartKey: any = undefined;
      do {
        const result: any = await ddbDocClient.send(new QueryCommand({
          TableName: COURSES_TABLE,
          IndexName: 'byTeacherId',
          KeyConditionExpression: 'teacherId = :tid',
          ExpressionAttributeValues: { ':tid': canonicalTeacherId },
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }));
        items.push(...(result.Items || []));
        exclusiveStartKey = result.LastEvaluatedKey;
      } while (exclusiveStartKey);

      // Legacy rows written before scripts/migrate-teacher-ids.mjs ran have no
      // teacherId at all (only teacherEmail), so they are absent from the index.
      // Fall back to a scan for those, and only for those. Once the migration has
      // run this branch finds nothing and can be deleted.
      if (items.length === 0) {
        let legacyKey: any = undefined;
        do {
          const result: any = await ddbDocClient.send(new ScanCommand({
            TableName: COURSES_TABLE,
            ConsistentRead: true,
            FilterExpression: 'teacherEmail = :temail AND attribute_not_exists(teacherId)',
            ExpressionAttributeValues: { ':temail': teacherId },
            ...(legacyKey ? { ExclusiveStartKey: legacyKey } : {}),
          }));
          items.push(...(result.Items || []));
          legacyKey = result.LastEvaluatedKey;
        } while (legacyKey);

        if (items.length > 0) {
          console.warn(
            `[courses GET] ${items.length} un-migrated course(s) found for ${teacherId}; run scripts/migrate-teacher-ids.mjs`
          );
        }
      }
    } else {
      const params: any = { TableName: COURSES_TABLE, ConsistentRead: true };
      if (teacher) {
        params.FilterExpression = 'teacherName = :tname';
        params.ExpressionAttributeValues = { ':tname': teacher };
      }

      let exclusiveStartKey: any = undefined;
      do {
        const result = await ddbDocClient.send(new ScanCommand({
          ...params,
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }));
        items.push(...(result.Items || []));
        exclusiveStartKey = result.LastEvaluatedKey;
      } while (exclusiveStartKey);
    }

    // If DynamoDB is empty and we're not filtering for a specific teacher, 
    // fallback to bundled sample data to ensure the UI isn't blank on first run.
    if (items.length === 0 && !teacherId && !teacher && Array.isArray(BUNDLED_COURSES)) {
      items = [...(BUNDLED_COURSES as any[])];
    }

    // Filter out test courses from all general lists by default, but allow them for E2E testing if explicitly requested.
    if (!url.searchParams.get('includeTests')) {
      items = items.filter((item: any) => {
        const id = String(item.id || '');
        const title = String(item.title || '');
        return !id.startsWith('test-course-') && !title.includes('測試') && !title.toLowerCase().includes('e2e');
      });
    }

    items = sortCoursesNewestFirst(items);

    // Batch lookup teacher names for all unique teacherIds in the items
    const uniqueTids = Array.from(new Set(items.map((i: any) => i.teacherId).filter(Boolean)));
    if (uniqueTids.length > 0) {
      try {
        const teacherMap: Record<string, string> = {};
        await Promise.all(uniqueTids.map(async (tid: any) => {
          const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: tid } }));
          if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
            teacherMap[tid] = tRes.Item.name || tRes.Item.displayName;
          }
        }));

        items.forEach((item: any) => {
          if (item.teacherId && teacherMap[item.teacherId]) {
            item.teacherName = teacherMap[item.teacherId];
          }
        });
      } catch (e) {
        console.warn('[courses GET] batch teacher lookup failed', e);
      }
    }

    // Derive seatsLeft per course from live enrollment counts.
    try {
      items = await decorateCoursesWithSeats(items as any);
    } catch (e) {
      console.warn('[courses GET] seat decoration failed, returning stored values', e);
    }

    return NextResponse.json({ ok: true, data: items });
  } catch (err: any) {
    console.error('[courses GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read courses' }, { status: 500 });
  }
}

// 建立新課程限 teacher/admin；若帶 id（等於用這支 route 更新既有課程）還要驗證擁有權，
// 否則任何登入使用者都能把別人的課程整筆覆寫掉（先前這支 route 完全沒有 auth）。
export const POST = withAuth(async (req: AuthedRequest) => {
  try {
    const body = await req.json();
    if (!body || !body.title || (!body.teacherName && !body.teacherId)) {
      return NextResponse.json({ ok: false, message: 'title and teacherName or teacherId required' }, { status: 400 });
    }

    const isAdmin = req.session.role === 'admin' || req.session.role === 'system';
    if (req.session.role !== 'teacher' && !isAdmin) {
      return NextResponse.json({ ok: false, message: 'Forbidden: requires teacher or admin role' }, { status: 403 });
    }

    const id = body.id || randomUUID();
    const now = new Date().toISOString();

    // ✅ 修復：若更新既有課程（有 id），先查並保留 createdAt
    let createdAt = now;
    let requestedTeacherId = body.teacherId || null;
    if (body.id) {
      try {
        const existing = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id } }));
        if (existing.Item?.createdAt) {
          createdAt = existing.Item.createdAt;
        }
        if (existing.Item && !(await canManageCourse(req.session, existing.Item as any))) {
          return NextResponse.json({ ok: false, message: 'Forbidden: you do not own this course' }, { status: 403 });
        }
      } catch (e) {
        // ignore, use current time
      }
    } else if (!isAdmin) {
      // 新建課程：teacherId 一律以自己的身分為準，不能冒用別的老師 id。
      const ownIds = await resolveOwnTeacherIds(req.session);
      if (requestedTeacherId && !ownIds.has(String(requestedTeacherId))) {
        return NextResponse.json({ ok: false, message: 'Forbidden: cannot create a course for another teacher' }, { status: 403 });
      }
      requestedTeacherId = requestedTeacherId || req.session.userId;
    }

    // Persist the canonical teacher id. Storing whatever the client sent is how
    // the courses table ended up with a mix of ids and emails in one column,
    // which then propagated into orders and points-escrow.
    const canonicalTeacherId = requestedTeacherId
      ? await resolveCanonicalTeacherId(requestedTeacherId)
      : null;

    if (requestedTeacherId && !canonicalTeacherId) {
      return NextResponse.json(
        { ok: false, message: `teacherId "${requestedTeacherId}" does not resolve to a teacher profile` },
        { status: 400 }
      );
    }

    const course = {
      id,
      title: body.title,
      subject: body.subject || '其他',
      level: body.level || '一般',
      language: body.language || '中文',
      teacherName: body.teacherName,
      teacherId: canonicalTeacherId,  // ⭐ canonical profile id (roid_id || id)
      // Kept only so pre-migration readers still resolve. Nothing should key off
      // it — lib/teacherIdentity.ts::readCourseTeacherKey prefers teacherId.
      teacherEmail: body.teacherEmail || null,
      pricePerSession: body.pricePerSession || 0,
      durationMinutes: body.durationMinutes || 60,
      tags: body.tags || [],
      mode: body.mode || 'online',
      description: body.description || '',
      status: '待審核',
      reviewRequestedStatus: body.status || '上架',
      nextStartDate: body.nextStartDate || null,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      totalSessions: body.totalSessions || null,
      // Capacity, not "seats left": this number is what the course offers, and
      // remaining seats are computed from enrollments at read time
      // (lib/seatAccounting.ts). seatsLeft is still written so existing readers
      // and the edit forms keep working until they move to `capacity`.
      capacity: body.capacity ?? body.seatsLeft ?? null,
      seatsLeft: body.capacity ?? body.seatsLeft ?? null,
      currency: body.currency || 'TWD',
      membershipPlan: body.membershipPlan || null,
      enrollmentType: body.enrollmentType || 'plan',
      pointCost: body.pointCost || 0,
      createdAt,
      updatedAt: now,
    };

    const putCmd = new PutCommand({ TableName: COURSES_TABLE, Item: course });
    await ddbDocClient.send(putCmd);
    
    console.log(`[courses POST] Saved course ${id} with teacherId=${course.teacherId}`);

    return NextResponse.json({ ok: true, course }, { status: 201 });
  } catch (err: any) {
    console.error('[courses POST] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to create course' }, { status: 500 });
  }
});

// 先前完全沒有 auth，任何人都能刪除任何課程；限 teacher（僅限自己開的課）或 admin。
export const DELETE = withAuth(async (req: AuthedRequest) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, message: 'id is required' }, { status: 400 });
    }

    const existing = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id } }));
    if (existing.Item && !(await canManageCourse(req.session, existing.Item as any))) {
      return NextResponse.json({ ok: false, message: 'Forbidden: you do not own this course' }, { status: 403 });
    }

    const delCmd = new DeleteCommand({ TableName: COURSES_TABLE, Key: { id } });
    await ddbDocClient.send(delCmd);

    return NextResponse.json({ ok: true, message: 'Deleted from DynamoDB' });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
});
