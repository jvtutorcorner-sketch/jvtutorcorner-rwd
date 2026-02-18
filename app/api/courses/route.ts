import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import resolveDataFile from '@/lib/localData';
import { COURSES as BUNDLED_COURSES } from '@/data/courses';
import { PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

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
        return NextResponse.json({ ok: true, course: item });
      }

      return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
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
    let items = result.Items || [];

    // If DynamoDB is empty and we're not filtering for a specific teacher, 
    // fallback to bundled sample data to ensure the UI isn't blank on first run.
    if (items.length === 0 && !teacherId && !teacher && Array.isArray(BUNDLED_COURSES)) {
      items = [...(BUNDLED_COURSES as any[])];
    }

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

    return NextResponse.json({ ok: true, data: items });
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
      status: body.status || '上架',
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

    const putCmd = new PutCommand({ TableName: COURSES_TABLE, Item: course });
    await ddbDocClient.send(putCmd);

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

    const delCmd = new DeleteCommand({ TableName: COURSES_TABLE, Key: { id } });
    await ddbDocClient.send(delCmd);

    return NextResponse.json({ ok: true, message: 'Deleted from DynamoDB' });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
}

