// app/api/enroll/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import fs from 'fs';
import path from 'path';
import resolveDataFile from '@/lib/localData';

export const runtime = 'nodejs'; // 🔴 強制用 Node.js runtime（給 Amplify / Next 用）

export type EnrollmentStatus =
  | 'PENDING_PAYMENT' // 已填寫報名資料，尚未付款
  | 'PAID'            // 金流回呼確認已付款
  | 'ACTIVE'          // 課程生效並開通
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
  // B2B 擴充欄位
  orgId?: string;           // 若為企業用戶，歸屬於哪個組織
  sourceType?: 'B2C' | 'B2B_SEAT' | 'ADMIN_OVERRIDE'; // 來源類型
};

const TABLE_NAME = process.env.ENROLLMENTS_TABLE;

// local persistence for development fallback
let LOCAL_ENROLLMENTS: EnrollmentRecord[] = [];

async function loadLocalEnrollments() {
  try {
    const ENROLL_FILE = await resolveDataFile('enrollments.json');
    if (fs.existsSync(ENROLL_FILE)) {
      const raw = fs.readFileSync(ENROLL_FILE, 'utf8');
      LOCAL_ENROLLMENTS = JSON.parse(raw || '[]');
    }
  } catch (e) {
    console.warn('[enroll API] failed to load local enrollments', (e as any)?.message || e);
    LOCAL_ENROLLMENTS = [];
  }
}

async function saveLocalEnrollments() {
  try {
    const ENROLL_FILE = await resolveDataFile('enrollments.json');
    fs.writeFileSync(ENROLL_FILE, JSON.stringify(LOCAL_ENROLLMENTS, null, 2), 'utf8');
  } catch (e) {
    console.warn('[enroll API] failed to save local enrollments', (e as any)?.message || e);
  }
}

// production 且有 TABLE_NAME 才真的用 DynamoDB
const useDynamo =
  process.env.NODE_ENV === 'production' &&
  typeof TABLE_NAME === 'string' &&
  TABLE_NAME.length > 0;

if (!useDynamo) {
  console.warn(
    `[enroll API] 不使用 DynamoDB（NODE_ENV=${process.env.NODE_ENV}, ENROLLMENTS_TABLE=${TABLE_NAME}），使用記憶體暫存。`,
  );
} else {
  console.log(
    `[enroll API] 使用 DynamoDB Table: ${TABLE_NAME}`,
  );
}

// load persisted enrollments in dev fallback
if (!useDynamo) {
  // initialize persisted enrollments (non-blocking)
  loadLocalEnrollments().catch(() => { });
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
      sourceType: 'B2C', // Default to B2C purchase
      createdAt: now,
      updatedAt: now,
    };

    if (useDynamo) {
      // 🟢 production：寫進 DynamoDB
      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        }),
      );
      console.log('[enroll API] DynamoDB 已寫入報名資料:', item);
    } else {
      // 🟡 dev：記憶體暫存，並立即 persist 到本地檔案以供其他 API 能即時讀取
      LOCAL_ENROLLMENTS.push(item);
      try {
        await saveLocalEnrollments();
      } catch (e) {
        console.warn('[enroll API] failed to save local enrollments immediately', (e as any)?.message || e);
      }
      console.log('[enroll API] LOCAL_ENROLLMENTS 暫存報名資料:', item);
    }

    return NextResponse.json(
      {
        ok: true,
        enrollment: item,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[enroll API] 處理報名請求時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, paymentProvider, paymentSessionId } = body || {};

    if (!id || !status) {
      return NextResponse.json({ ok: false, error: '需要 id 與 status' }, { status: 400 });
    }

    // dev: 更新記憶體
    if (!useDynamo) {
      const idx = LOCAL_ENROLLMENTS.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ ok: false, error: '找不到該報名紀錄' }, { status: 404 });
      }

      const existing = LOCAL_ENROLLMENTS[idx];
      const updated = {
        ...existing,
        status,
        paymentProvider: paymentProvider || existing.paymentProvider,
        paymentSessionId: paymentSessionId || existing.paymentSessionId,
        updatedAt: new Date().toISOString(),
      };

      LOCAL_ENROLLMENTS[idx] = updated;

      // persist to disk for dev
      saveLocalEnrollments();

      return NextResponse.json({ ok: true, enrollment: updated }, { status: 200 });
    }

    // production: update DynamoDB
    if (!TABLE_NAME) {
      return NextResponse.json({ ok: false, error: '伺服器尚未設定 ENROLLMENTS_TABLE。' }, { status: 500 });
    }

    // 使用 PutCommand 覆寫
    const updatedAt = new Date().toISOString();
    const Item = {
      id,
      status,
      paymentProvider: paymentProvider || undefined,
      paymentSessionId: paymentSessionId || undefined,
      updatedAt,
    };

    await ddbDocClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item }),
    );

    return NextResponse.json({ ok: true, enrollment: Item }, { status: 200 });
  } catch (err: any) {
    console.error('[enroll API] PATCH 發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json({ ok: false, error: '伺服器錯誤。' }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!useDynamo) {
      // dev：回傳記憶體暫存
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
  } catch (err: any) {
    console.error('[enroll API] 讀取報名資料時發生錯誤:', err?.message || err, err?.stack);
    return NextResponse.json(
      { ok: false, error: '伺服器錯誤。' },
      { status: 500 },
    );
  }
}
