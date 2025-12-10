import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
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

export async function DELETE(req: Request, { params }: { params: any }) {
  try {
    const id = params.id;
    const courses = await readCourses();
    const idx = courses.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    courses.splice(idx, 1);
    await writeCourses(courses);
    return NextResponse.json({ ok: true, message: 'Deleted' });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: any }) {
  try {
    const id = params.id;
    const body = await req.json();
    const courses = await readCourses();
    const idx = courses.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    const course = courses[idx];
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.nextStartDate !== undefined) updates.nextStartDate = body.nextStartDate;
    if (body.totalSessions !== undefined) updates.totalSessions = body.totalSessions;
    if (body.seatsLeft !== undefined) updates.seatsLeft = body.seatsLeft;
    if (body.pricePerSession !== undefined) updates.pricePerSession = body.pricePerSession;
    if (body.membershipPlan !== undefined) updates.membershipPlan = body.membershipPlan;
    if (body.description !== undefined) updates.description = body.description;
    const now = new Date().toISOString();
    const merged = { ...course, ...updates, updatedAt: now };
    courses[idx] = merged;
    await writeCourses(courses);
    return NextResponse.json({ ok: true, course: merged });
  } catch (err: any) {
    console.error('[courses PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to patch course' }, { status: 500 });
  }
}
