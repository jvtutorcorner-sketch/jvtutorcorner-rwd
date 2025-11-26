// app/api/enroll/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

export type EnrollmentStatus =
  | 'PENDING_PAYMENT' // 已填寫報名資料，尚未付款
  | 'PAID'            // 金流回呼確認已付款
  | 'CANCELLED'       // 學生取消
  | 'FAILED';         // 金流失敗或其他錯誤

export type EnrollmentRecord = {
  id: string;            // 主鍵
  name: string;
  email: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
  paymentProvider?: string;   // 之後接 Stripe / 綠界 / TapPay 可用
  paymentSessionId?: string;  // 金流交易或 session ID
};

const TABLE_NAME = process.env.ENROLLMENTS_TABLE;

if (!TABLE_NAME) {
  console.warn(
    'ENROLLMENTS_TABLE 環境變數未設定，/api/enroll 將無法寫入 DynamoDB。',
  );
}

function generateId() {
  // 簡單的 ID 生成（避免為了 crypto 再額外 import）
  return `enr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export async function POST(request: NextRequest) {
  if (!TABLE_NAME) {
    return NextResponse.json(
      { ok: false, error: '伺服器尚未設定 ENROLLMENTS_TABLE。' },
      { status: 500 },
    );
  }

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

    const now = new Date().toISOString();

    const item: EnrollmentRecord = {
      id: generateId(),
      name: String(name).trim(),
      email: String(email).trim(),
      courseId: String(courseId),
      courseTitle: String(courseTitle),
      status: 'PENDING_PAYMENT',   // 之後金流成功再更新為 'PAID'
      createdAt: now,
      updatedAt: now,
      // paymentProvider / paymentSessionId 之後接 Stripe 再填
    };

    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );

    console.log('DynamoDB 已寫入報名資料:', item);

    return NextResponse.json(
      {
        ok: true,
        enrollment: item,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('處理報名請求時發生錯誤:', err);

    return NextResponse.json(
      {
        ok: false,
        error: '伺服器錯誤。',
        // 下面這行是為了 debug，之後上正式環境可以改掉
        debug: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}

// Demo: 方便在 dev / 後台快速查看最近的報名資料
export async function GET() {
  if (!TABLE_NAME) {
    return NextResponse.json(
      { ok: false, error: '伺服器尚未設定 ENROLLMENTS_TABLE。' },
      { status: 500 },
    );
  }

  try {
    const res = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 50, // Demo：看前 50 筆就好
      }),
    );

    const items = (res.Items || []) as EnrollmentRecord[];

    return NextResponse.json(
      {
        ok: true,
        total: items.length,
        data: items,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('讀取 DynamoDB 報名資料時發生錯誤:', err);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}
