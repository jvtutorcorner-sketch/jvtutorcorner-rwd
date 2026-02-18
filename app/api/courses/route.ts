import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import resolveDataFile from '@/lib/localData';
import { COURSES as BUNDLED_COURSES } from '@/data/courses';
import { PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

async function readCourses(): Promise<any[]> {
  try {
    const DATA_FILE = await resolveDataFile('courses.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeCourses(arr: any[]) {
  try {
    const DATA_FILE = await resolveDataFile('courses.json');
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('[courses API] failed to write courses', (err as any)?.message || err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teacher = url.searchParams.get('teacher');
    const teacherId = url.searchParams.get('teacherId');
    const id = url.searchParams.get('id');
    let courses = await readCourses();
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);
    // If there are no persisted courses available (e.g. in Amplify deployments
    // where `.local_data` is ignored), fall back to bundled sample data.
    if ((!courses || courses.length === 0) && Array.isArray(BUNDLED_COURSES) && BUNDLED_COURSES.length > 0) {
      courses = BUNDLED_COURSES as any[];
    }

    if (useDynamo) {
      try {
        if (id) {
          const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
          const res = await ddbDocClient.send(getCmd);
          if (!res || !res.Item) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
          return NextResponse.json({ ok: true, course: res.Item });
        }

        const params: any = { TableName: COURSES_TABLE };
        if (teacherId) {
          params.FilterExpression = 'teacherId = :tid';
          params.ExpressionAttributeValues = { ':tid': teacherId };
        } else if (teacher) {
          params.FilterExpression = 'teacherName = :tname';
          params.ExpressionAttributeValues = { ':tname': teacher };
        }
        const scanCmd = new ScanCommand(params);
        const result = await ddbDocClient.send(scanCmd);
        const items = result.Items || [];
        return NextResponse.json({ ok: true, data: items });
      } catch (err: any) {
        console.error('[courses GET Dynamo] error', err?.message || err);
        // fallback to local file behavior below
      }
    }

    if (id) {
      const idNorm = String(id).trim();
      // try exact match in persisted courses
      let c = courses.find((x) => String(x.id || '').trim() === idNorm);
      // fallback to bundled sample data
      if (!c && Array.isArray(BUNDLED_COURSES) && BUNDLED_COURSES.length > 0) {
        c = (BUNDLED_COURSES as any[]).find((x) => String(x.id || '').trim() === idNorm) as any | undefined;
      }
      // try decodeURIComponent in case the id was encoded differently
      if (!c) {
        try {
          const dec = decodeURIComponent(idNorm);
          c = courses.find((x) => String(x.id || '').trim() === dec) || (Array.isArray(BUNDLED_COURSES) ? (BUNDLED_COURSES as any[]).find((x) => String(x.id || '').trim() === dec) : undefined);
        } catch (e) {
          // ignore
        }
      }
      if (!c) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
      return NextResponse.json({ ok: true, course: c });
    }
    if (teacherId) {
      const filtered = courses.filter((c) => String(c.teacherId || '').toLowerCase() === String(teacherId).toLowerCase());
      return NextResponse.json({ ok: true, data: filtered });
    }
    if (teacher) {
      const filtered = courses.filter((c) => String(c.teacherName).toLowerCase() === String(teacher).toLowerCase());
      return NextResponse.json({ ok: true, data: filtered });
    }
    return NextResponse.json({ ok: true, data: courses });
  } catch (err: any) {
    console.error('[courses GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read courses' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || !body.title || (!body.teacherName && !body.teacherId)) {
      return NextResponse.json({ ok: false, message: 'title and teacherName or teacherId required' }, { status: 400 });
    }
    const courses = await readCourses();
    const id = body.id || randomUUID();
    const now = new Date().toISOString();
    const course = {
      id,
      title: body.title,
      subject: body.subject || '其他',
      level: body.level || '一般',
      language: body.language || '中文',
      teacherName: body.teacherName,
      teacherId: body.teacherId || null,
      pricePerSession: body.pricePerSession || 0,
      durationMinutes: body.durationMinutes || 60,
      tags: body.tags || [],
      mode: body.mode || 'online',
      description: body.description || '',
      // status: '上架' or '下架'
      status: body.status || '上架',
      // scheduling fields
      nextStartDate: body.nextStartDate || null,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      totalSessions: body.totalSessions || null,
      seatsLeft: body.seatsLeft || null,
      currency: body.currency || 'TWD',
      membershipPlan: body.membershipPlan || null,
      createdAt: now,
      updatedAt: now,
    };
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);

    if (useDynamo) {
      try {
        const putCmd = new PutCommand({ TableName: COURSES_TABLE, Item: course });
        await ddbDocClient.send(putCmd);
        return NextResponse.json({ ok: true, course }, { status: 201 });
      } catch (err: any) {
        console.error('[courses POST Dynamo] error', err?.message || err);
        // Fallback to local
      }
    }

    courses.unshift(course);
    await writeCourses(courses);
    return NextResponse.json({ ok: true, course }, { status: 201 });
  } catch (err: any) {
    console.error('[courses POST] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to create course' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, message: 'id is required' }, { status: 400 });
    }
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);

    if (useDynamo) {
      try {
        const delCmd = new DeleteCommand({ TableName: COURSES_TABLE, Key: { id } });
        await ddbDocClient.send(delCmd);
        return NextResponse.json({ ok: true, message: 'Deleted from DynamoDB' });
      } catch (err: any) {
        console.error('[courses DELETE Dynamo] error', err?.message || err);
        // Fallback to local
      }
    }

    const courses = await readCourses();
    const idx = courses.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) {
      return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    }
    const removed = courses.splice(idx, 1)[0];
    await writeCourses(courses);
    return NextResponse.json({ ok: true, removed });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
}
