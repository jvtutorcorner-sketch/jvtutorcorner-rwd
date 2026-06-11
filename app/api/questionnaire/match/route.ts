import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TEACHERS } from '@/data/teachers';
import { COURSES } from '@/data/courses';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subjectsParam = searchParams.get('subjects') || '';
  const subjects = subjectsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (subjects.length === 0) {
    return NextResponse.json({ teachers: [], courses: [] });
  }

  // --- Teachers ---
  let allTeachers: any[] = [];
  try {
    const res = await ddbDocClient.send(new ScanCommand({ TableName: TEACHERS_TABLE }));
    allTeachers = res.Items || [];
  } catch {
    allTeachers = TEACHERS as any[];
  }
  if (allTeachers.length === 0) allTeachers = TEACHERS as any[];

  const matchedTeachers = allTeachers
    .filter(t => {
      if (t.status === 'resigned') return false;
      const teacherSubjects: string[] = t.subjects || [];
      return subjects.some(s => teacherSubjects.some(ts => ts.includes(s) || s.includes(ts)));
    })
    .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      name: t.name || t.displayName,
      avatarUrl: t.avatarUrl || null,
      subjects: t.subjects || [],
      rating: t.rating || null,
      hourlyRate: t.hourlyRate || null,
      intro: t.intro ? String(t.intro).slice(0, 80) : null,
    }));

  // --- Courses ---
  let allCourses: any[] = [];
  try {
    const res = await ddbDocClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
    allCourses = res.Items || [];
  } catch {
    allCourses = COURSES as any[];
  }
  if (allCourses.length === 0) allCourses = COURSES as any[];

  const matchedCourses = allCourses
    .filter(c => {
      if (c.status && c.status !== '上架') return false;
      const courseSubject: string = c.subject || '';
      return subjects.some(s => courseSubject.includes(s) || s.includes(courseSubject));
    })
    .sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    })
    .slice(0, 6)
    .map(c => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      level: c.level || null,
      mode: c.mode || null,
      teacherName: c.teacherName || null,
      teacherId: c.teacherId || null,
    }));

  return NextResponse.json({ teachers: matchedTeachers, courses: matchedCourses });
}
