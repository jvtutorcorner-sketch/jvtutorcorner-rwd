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
  id: string;
  name: string;
  email: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
  paymentProvider?: string;
  paymentSessionId?: string;
};

const TABLE_NAME = process.env.ENROLLMENTS_TABLE;

// 開發環境用的 in-memory 暫存
const LOCAL_ENROLLMENTS: EnrollmentRecord[] = [];

// 判斷是否真的要用 DynamoDB
// - production 且有設定 TABLE_NAME 才啟用
const useDynamo =
  process.env.NODE_ENV === 'production' && typeof TABLE_NAME === 'string' && TABLE_NAME.length > 0;

if (!useDynamo) {
  console.warn(
    '[enroll API] 目前不使用 DynamoDB（可能是開發環境或未設定 ENROLLMENTS_TABLE），將使用記憶體暫存。',
  );
} else {
  console.log(
    `[enroll API] 將使用 DynamoDB Table: ${TABLE_NAME}`,
  );
}

function generateId() {
  return `enr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

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

    const now = new Date().toISOString();

    const item: EnrollmentRecord = {
      id: generateId(),
      name: String(name).trim(),
      email: String(email).trim(),
      courseId: String(courseId),
      courseTitle: String(courseTitle),
      status: 'PENDING_PAYMENT',
      createdAt: now,
      updatedAt: now,
    };

    if (useDynamo) {
      // 寫進 DynamoDB（production / Amplify）
      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        }),
      );
      console.log('DynamoDB 已寫入報名資料:', item);
    } else {
      // 開發環境：先放在記憶體陣列
      LOCAL_ENROLLMENTS.push(item);
      console.log('LOCAL_ENROLLMENTS 暫存報名資料:', item);
    }

    return NextResponse.json(
      {
        ok: true,
        enrollment: item,
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

export async function GET() {
  try {
    if (!useDynamo) {
      // 開發環境：回傳記憶體暫存
      return NextResponse.json(
        {
          ok: true,
          total: LOCAL_ENROLLMENTS.length,
          data: LOCAL_ENROLLMENTS,
          source: 'memory',
        },
        { status: 200 },
      );
    }

    // production：從 DynamoDB 讀取
    if (!TABLE_NAME) {
      return NextResponse.json(
        { ok: false, error: '伺服器尚未設定 ENROLLMENTS_TABLE。' },
        { status: 500 },
      );
    }

    const res = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 50,
      }),
    );

    const items = (res.Items || []) as EnrollmentRecord[];

    return NextResponse.json(
      {
        ok: true,
        total: items.length,
        data: items,
        source: 'dynamodb',
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('讀取報名資料時發生錯誤:', err);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}
