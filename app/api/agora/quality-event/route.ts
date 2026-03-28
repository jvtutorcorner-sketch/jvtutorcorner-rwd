import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type { QualityEventPayload } from '@/lib/agora/types';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'jvtutorcorner-agora-quality-events';

/**
 * POST /api/agora/quality-event
 *
 * 由前端 Agora `network-quality` 事件週期性觸發（建議每 5 秒一次）。
 *
 * Body: QualityEventPayload
 *   sessionId        — AgSession.sessionId
 *   participantId    — AgParticipant.participantId
 *   channelName
 *   uplinkQuality    — 0(未知)~6(斷線)
 *   downlinkQuality  — 0(未知)~6(斷線)
 *   networkType      — NETWORK_UNKNOWN / WIFI / LAN / MOBILE_4G ...
 *   rtt              — 往返延遲 ms（選填）
 *   packetLossRate   — 封包遺失率 %（選填）
 *   sampledAt        — ISO 8601 採樣時間
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Partial<QualityEventPayload>;

        const { sessionId, participantId, channelName, uplinkQuality, downlinkQuality, networkType, rtt, packetLossRate, sampledAt } = body;

        if (!sessionId || !participantId) {
            return NextResponse.json({ ok: false, error: 'sessionId and participantId are required' }, { status: 400 });
        }

        const eventId = uuidv4();
        const now = new Date().toISOString();

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                eventId,
                sessionId,
                participantId,
                channelName: channelName || 'unknown',
                uplinkQuality: uplinkQuality ?? 0,
                downlinkQuality: downlinkQuality ?? 0,
                networkType: networkType || 'NETWORK_UNKNOWN',
                rtt: rtt ?? null,
                packetLossRate: packetLossRate ?? null,
                sampledAt: sampledAt || now,
                createdAt: now,
            },
        }));

        return NextResponse.json({ ok: true, eventId });
    } catch (error) {
        console.error('Error saving Agora quality event:', error);
        return NextResponse.json({ ok: false, error: 'Failed to record quality event' }, { status: 500 });
    }
}
