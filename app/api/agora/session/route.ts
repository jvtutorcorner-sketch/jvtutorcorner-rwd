import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand, GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type { SessionUpsertPayload } from '@/lib/agora/types';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'jvtutorcorner-agora-sessions';

/**
 * POST /api/agora/session
 *
 * 建立新的 Agora Session（進入 /classroom/room 時呼叫）。
 *
 * Body: SessionUpsertPayload（不含 sessionId → 自動產生 UUID）
 *   channelName  — Agora 頻道名（必填）
 *   courseId     — 課程 ID（必填）
 *   orderId      — 訂單 ID（選填）
 *   teacherId    — 教師 User ID（必填）
 *   studentId    — 學生 User ID（必填）
 *   pageUrl      — '/classroom/room'
 *   status       — 'active'（建立時固定為 active）
 *   startedAt    — ISO 8601 開始時間
 *
 * Returns: { sessionId }
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Partial<SessionUpsertPayload>;

        const { channelName, courseId, orderId, teacherId, studentId, pageUrl, startedAt } = body;

        if (!channelName || !courseId || !teacherId || !studentId) {
            return NextResponse.json(
                { ok: false, error: 'channelName, courseId, teacherId and studentId are required' },
                { status: 400 },
            );
        }

        const sessionId = uuidv4();
        const now = new Date().toISOString();

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                sessionId,
                channelName,
                courseId,
                orderId: orderId || null,
                teacherId,
                studentId,
                pageUrl: pageUrl || '/classroom/room',
                status: 'active',
                startedAt: startedAt || now,
                endedAt: null,
                durationSeconds: null,
                createdAt: now,
                updatedAt: now,
            },
        }));

        return NextResponse.json({ ok: true, sessionId });
    } catch (error) {
        console.error('Error creating Agora session:', error);
        return NextResponse.json({ ok: false, error: 'Failed to create session' }, { status: 500 });
    }
}

/**
 * PATCH /api/agora/session
 *
 * 結束 Session（離開 /classroom/room 時呼叫）。
 *
 * Body:
 *   sessionId      — 必填
 *   status         — 'completed' | 'interrupted'
 *   endedAt        — ISO 8601 結束時間
 *   durationSeconds— 實際課堂秒數
 */
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { sessionId, status, endedAt, durationSeconds } = body;

        if (!sessionId) {
            return NextResponse.json({ ok: false, error: 'sessionId is required' }, { status: 400 });
        }

        const now = new Date().toISOString();

        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { sessionId },
            UpdateExpression:
                'SET #status = :status, endedAt = :endedAt, durationSeconds = :dur, updatedAt = :updatedAt',
            ConditionExpression: 'attribute_exists(sessionId)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': status || 'completed',
                ':endedAt': endedAt || now,
                ':dur': durationSeconds ?? null,
                ':updatedAt': now,
            },
        }));

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') {
            return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
        }
        console.error('Error updating Agora session:', error);
        return NextResponse.json({ ok: false, error: 'Failed to update session' }, { status: 500 });
    }
}

/**
 * GET /api/agora/session?sessionId=<id>
 *
 * 取得 Session 詳細資訊。
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ ok: false, error: 'sessionId is required' }, { status: 400 });
        }

        const result = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { sessionId } }));

        if (!result.Item) {
            return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, session: result.Item });
    } catch (error) {
        console.error('Error fetching Agora session:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch session' }, { status: 500 });
    }
}
