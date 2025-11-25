// app/api/enroll/route.ts
import { NextRequest, NextResponse } from 'next/server';

export type Enrollment = {
  name: string;
  email: string;
  courseId: string;
  courseTitle: string;
  createdAt: string;
};

// ⚠ Demo 用的 in-memory 暫存：
// 在 dev 模式下同一個 process 期間會保留，
// 但在正式環境 / lambda 冷啟動時不保證持久。
const ENROLLMENTS: Enrollment[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, email, courseId, courseTitle } = body || {};

    if (!name || !email || !courseId || !courseTitle) {
      return NextResponse.json(
        { ok: false, error: '缺少必要欄位（name, email, courseId, courseTitle）。' },
        { status: 400 },
      );
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Email 格式不正確。' },
        { status: 400 },
      );
    }

    const entry: Enrollment = {
      name: String(name).trim(),
      email: String(email).trim(),
      courseId: String(courseId),
      courseTitle: String(courseTitle),
      createdAt: new Date().toISOString(),
    };

    ENROLLMENTS.push(entry);

    console.log('API 收到報名資料（Demo）:', entry);

    return NextResponse.json(
      {
        ok: true,
        enrollment: entry,
        total: ENROLLMENTS.length,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('處理報名請求時發生錯誤:', err);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}

// Demo：可以用 GET 看目前所有暫存的報名資料
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      total: ENROLLMENTS.length,
      data: ENROLLMENTS,
    },
    { status: 200 },
  );
}
