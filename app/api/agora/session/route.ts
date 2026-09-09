import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand, GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type { SessionUpsertPayload } from '@/lib/agora/types';
import { getEscrowByOrder, releaseEscrow } from '@/lib/pointsEscrow';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { verifyClassroomAccess } from '@/lib/auth/classroomAccess';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'jvtutorcorner-agora-sessions';

/** 這個 session 的老師或學生本人，或管理員。 */
function isSessionParticipant(req: AuthedRequest, item: Record<string, any>): boolean {
    const { role, userId } = req.session;
    if (role === 'admin' || role === 'system') return true;
    return item.teacherId === userId || item.studentId === userId;
}


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
// 先前完全沒有 auth：任何人都能替任意課程捏造上課紀錄。
async function handlePost(req: AuthedRequest) {
    try {
        const body = (await req.json()) as Partial<SessionUpsertPayload>;

        const { channelName, courseId, orderId, teacherId, studentId, pageUrl, startedAt } = body;

        if (!channelName || !courseId || !teacherId || !studentId) {
            return NextResponse.json(
                { ok: false, error: 'channelName, courseId, teacherId and studentId are required' },
                { status: 400 },
            );
        }

        // 只有這堂課的參與者（老師／已報名學生）或管理員能開上課紀錄。
        const access = await verifyClassroomAccess(req.session, courseId);
        if (!access.granted) {
            return NextResponse.json(
                { ok: false, error: 'Forbidden: no access to this course' },
                { status: 403 },
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
async function handlePatch(req: AuthedRequest) {
    let reqStatus: string | undefined;
    try {
        const body = await req.json();
        const { sessionId, status, endedAt, durationSeconds } = body;
        reqStatus = status;

        if (!sessionId) {
            return NextResponse.json({ ok: false, error: 'sessionId is required' }, { status: 400 });
        }

        // 這支在 status='completed' 時會把託管點數釋出給老師，先前完全沒有驗證：
        // 任何人送一個 sessionId 就能觸發撥款。限定這堂課的老師／學生本人或管理員。
        const existing = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { sessionId } }));
        if (!existing.Item) {
            return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
        }
        if (!isSessionParticipant(req, existing.Item)) {
            return NextResponse.json({ ok: false, error: 'Forbidden: not a participant of this session' }, { status: 403 });
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

        // 🔓 If course completed, fetch the session's orderId and release the escrow to the teacher
        const finalStatus = status || 'completed';
        if (finalStatus === 'completed') {
            try {
                // Fetch full session record to get orderId
                const sessionRes = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { sessionId } }));
                const sessionOrderId = sessionRes.Item?.orderId;
                if (sessionOrderId) {
                    const escrow = await getEscrowByOrder(sessionOrderId);
                    if (escrow && escrow.status === 'HOLDING') {
                        const releaseResult = await releaseEscrow(escrow.escrowId);
                        if (releaseResult.ok) {
                            console.log(
                                `[agora/session PATCH] Escrow ${escrow.escrowId} released to teacher ${escrow.teacherId} (${escrow.points} pts) for completed session ${sessionId}`
                            );
                        } else {
                            console.error(
                                `[agora/session PATCH] Failed to release escrow ${escrow.escrowId}:`,
                                releaseResult.error
                            );
                        }
                    }
                }
            } catch (escrowErr) {
                // Non-fatal: session update already succeeded; escrow can be released manually
                console.error('[agora/session PATCH] Error during escrow release:', escrowErr);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') {
            return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
        }
        // If the agora sessions table doesn't exist (dev/local env), return ok for
        // non-completed statuses — escrow release only triggers on 'completed'
        if (error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException' ||
            error.name === 'ResourceNotFoundException') {
            console.warn('[agora/session PATCH] agora-sessions table not found');
            if (reqStatus === 'completed') {
                console.error('[agora/session PATCH] Cannot release escrow: sessions table missing');
                return NextResponse.json({ ok: false, error: 'Failed to update session' }, { status: 500 });
            }
            return NextResponse.json({ ok: true, warning: 'sessions table not found, session update skipped' });
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
async function handleGet(req: AuthedRequest) {
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

        if (!isSessionParticipant(req, result.Item)) {
            return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, session: result.Item });
    } catch (error) {
        console.error('Error fetching Agora session:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch session' }, { status: 500 });
    }
}

export const POST = withAuth(handlePost);
export const PATCH = withAuth(handlePatch);
export const GET = withAuth(handleGet);
