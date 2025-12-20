import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import resolveDataFile from '@/lib/localData';

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
    const courses = await readCourses();
    if (id) {
      const c = courses.find((x) => String(x.id) === id);
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
