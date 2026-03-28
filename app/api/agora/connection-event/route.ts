import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type { ConnectionEventPayload } from '@/lib/agora/types';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = 'jvtutorcorner-agora-connection-events';
const PARTICIPANTS_TABLE = 'jvtutorcorner-agora-participants';

/**
 * POST /api/agora/connection-event
 *
 * 由前端 Agora connection-state-change 及 user-joined/left 事件觸發。
 *
 * Body: ConnectionEventPayload
 *   sessionId       — AgSession.sessionId
 *   participantId   — AgParticipant.participantId
 *   channelName
 *   eventType       — 'join' | 'leave' | 'reconnect' | 'disconnect' |
 *                     'network-change' | 'stream-publish' | 'stream-unpublish'
 *   prevState       — 前一個連線狀態（選填）
 *   currState       — 目前連線狀態
 *   reason          — 狀態變化原因（選填）
 *   occurredAt      — ISO 8601 事件發生時間
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Partial<ConnectionEventPayload>;

        const { sessionId, participantId, channelName, eventType, prevState, currState, reason, occurredAt } = body;

        if (!sessionId || !participantId || !eventType || !currState) {
            return NextResponse.json(
                { ok: false, error: 'sessionId, participantId, eventType and currState are required' },
                { status: 400 },
            );
        }

        const eventId = uuidv4();
        const now = new Date().toISOString();

        // ── 寫入連線事件紀錄 ──────────────────────────────────────────────────
        await docClient.send(new PutCommand({
            TableName: EVENTS_TABLE,
            Item: {
                eventId,
                sessionId,
                participantId,
                channelName: channelName || 'unknown',
                eventType,
                prevState: prevState || null,
                currState,
                reason: reason || null,
                occurredAt: occurredAt || now,
                createdAt: now,
            },
        }));

        // ── 若為 leave 事件，同步更新 participants.leftAt ─────────────────────
        if (eventType === 'leave' || eventType === 'disconnect') {
            try {
                await docClient.send(new UpdateCommand({
                    TableName: PARTICIPANTS_TABLE,
                    Key: { participantId },
                    UpdateExpression: 'SET leftAt = :leftAt, updatedAt = :updatedAt',
                    ConditionExpression: 'attribute_exists(participantId)',
                    ExpressionAttributeValues: {
                        ':leftAt': occurredAt || now,
                        ':updatedAt': now,
                    },
                }));
            } catch (updateErr: any) {
                // 若 participant 尚未寫入（舊流程），僅警告不中止
                if (updateErr.name !== 'ConditionalCheckFailedException') {
                    console.warn('Failed to update participant leftAt:', updateErr.message);
                }
            }
        }

        return NextResponse.json({ ok: true, eventId });
    } catch (error) {
        console.error('Error saving Agora connection event:', error);
        return NextResponse.json({ ok: false, error: 'Failed to record connection event' }, { status: 500 });
    }
}
