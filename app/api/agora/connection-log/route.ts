import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const docClient = DynamoDBDocumentClient.from(client);

/** 舊資料表（向後相容，保留現有紀錄） */
const LEGACY_TABLE = 'jvtutorcorner-agora-connections';
/** 新參與者資料表 */
const PARTICIPANTS_TABLE = 'jvtutorcorner-agora-participants';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            // — 關聯欄位 —
            userId,
            courseId,
            page,
            role,
            orderId,
            channelName,
            sessionId,
            participantId: incomingParticipantId,
            agoraUid,
            // — Agora Dashboard 五個可見欄位 —
            osName,
            osVersion,
            networkType,
            sdkVersion,
            sdkFullVersion,
            deviceCategory,
            deviceModel,
            browserName,
            browserVersion,
            userAgent,
            systemRequirementsCheck,
            // — 向後相容舊欄位 —
            os,
            browser,
            device,
            agoraVersion,
            systemRequirements,
            timestamp,
        } = body;

        const now = new Date().toISOString();
        const eventTimestamp = timestamp || Date.now();
        const participantId = incomingParticipantId || uuidv4();

        // ── 寫入新資料表 jvtutorcorner-agora-participants ──────────────────────
        if (sessionId) {
            await docClient.send(new PutCommand({
                TableName: PARTICIPANTS_TABLE,
                Item: {
                    participantId,
                    // 關聯欄位
                    sessionId,
                    userId: userId || 'anonymous',
                    role: role || 'unknown',
                    agoraUid: agoraUid ?? null,
                    channelName: channelName || 'unknown',
                    courseId: courseId || 'unknown',
                    orderId: orderId || null,
                    pageUrl: page || '/classroom/room',
                    // Agora Dashboard OS 欄位
                    osName: osName || os || 'unknown',
                    osVersion: osVersion || '',
                    // Agora Dashboard NET 欄位
                    networkType: networkType || 'NETWORK_UNKNOWN',
                    // Agora Dashboard SDK 欄位
                    sdkVersion: sdkVersion || agoraVersion || 'unknown',
                    sdkFullVersion: sdkFullVersion || sdkVersion || agoraVersion || 'unknown',
                    // Agora Dashboard Device type 欄位
                    deviceCategory: deviceCategory || device || 'unknown',
                    deviceModel: deviceModel || userAgent?.substring(0, 80) || 'unknown',
                    // Agora Dashboard Browser 欄位
                    browserName: browserName || browser || 'unknown',
                    browserVersion: browserVersion || '',
                    // 原始 UA
                    userAgent: userAgent || '',
                    systemRequirementsCheck: systemRequirementsCheck ?? systemRequirements ?? null,
                    // 連線時間
                    joinedAt: now,
                    leftAt: null,
                    // 稽核時間戳記
                    createdAt: now,
                    updatedAt: now,
                },
            }));
        }

        // ── 向後相容：同時寫入舊資料表 ─────────────────────────────────────────
        const connectionId = uuidv4();
        try {
            await docClient.send(new PutCommand({
                TableName: LEGACY_TABLE,
                Item: {
                    connectionId,
                    userId: userId || 'anonymous',
                    courseId: courseId || 'unknown',
                    page: page || 'unknown',
                    role: role || 'unknown',
                    os: osName || os || 'unknown',
                    browser: browserName || browser || 'unknown',
                    device: deviceCategory || device || 'unknown',
                    agoraVersion: sdkVersion || agoraVersion || 'unknown',
                    systemRequirements: systemRequirementsCheck ?? systemRequirements ?? null,
                    timestamp: eventTimestamp,
                    orderId: orderId || null,
                    createdAt: now,
                },
            }));
        } catch (legacyError: any) {
            if (legacyError.name === 'ResourceNotFoundException') {
                console.warn(`[Legacy Table] Table ${LEGACY_TABLE} not found, skipping legacy log.`);
            } else {
                console.error(`[Legacy Table] Failed to write to ${LEGACY_TABLE}:`, legacyError);
            }
        }

        return NextResponse.json({ ok: true, connectionId, participantId });
    } catch (error) {
        console.error('Error logging Agora connection:', error);
        return NextResponse.json({ ok: false, error: 'Failed to record connection log' }, { status: 500 });
    }
}

