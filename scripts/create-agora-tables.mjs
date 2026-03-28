/**
 * scripts/create-agora-tables.mjs
 *
 * 建立 Agora 資料收集所需的四張 DynamoDB 資料表。
 *
 * 資料表架構：
 *
 *  jvtutorcorner-agora-sessions           (課堂 Session 主表)
 *    ├─ GSI: courseId-index
 *    ├─ GSI: orderId-index
 *    └─ GSI: channelName-index
 *
 *  jvtutorcorner-agora-participants       (參與者 + Agora Dashboard 欄位)
 *    ├─ GSI: sessionId-index
 *    └─ GSI: userId-index
 *
 *  jvtutorcorner-agora-quality-events     (網路品質採樣事件)
 *    ├─ GSI: sessionId-index
 *    └─ GSI: participantId-index
 *
 *  jvtutorcorner-agora-connection-events  (連線狀態變化事件)
 *    ├─ GSI: sessionId-index
 *    └─ GSI: participantId-index
 *
 * 執行方式：
 *   node scripts/create-agora-tables.mjs
 */

import {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!accessKey || !secretKey) {
    console.error('❌ 缺少 AWS_ACCESS_KEY_ID 或 AWS_SECRET_ACCESS_KEY，請確認 .env.local');
    process.exit(1);
}

const client = new DynamoDBClient({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
});

/** 等待資料表狀態變為 ACTIVE */
async function waitForActive(tableName) {
    process.stdout.write(`⏳ 等待 ${tableName} ACTIVE`);
    while (true) {
        const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
        if (res.Table.TableStatus === 'ACTIVE') {
            console.log(' ✅');
            return;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 2500));
    }
}

/** 建立資料表（若已存在則跳過） */
async function createTable(params) {
    try {
        await client.send(new CreateTableCommand(params));
        console.log(`🏗️  建立資料表：${params.TableName}`);
        await waitForActive(params.TableName);
    } catch (err) {
        if (err.name === 'ResourceInUseException') {
            console.log(`⚠️  資料表已存在，略過：${params.TableName}`);
        } else {
            console.error(`❌ 建立失敗：${params.TableName}`, err.message);
            throw err;
        }
    }
}

// ─── 資料表定義 ────────────────────────────────────────────────────────────────

/**
 * Table 1: jvtutorcorner-agora-sessions
 *
 * PK:  sessionId (S)
 * GSI: courseId-index    → courseId (S) | createdAt (S)
 * GSI: orderId-index     → orderId  (S) | createdAt (S)
 * GSI: channelName-index → channelName (S) | createdAt (S)
 *
 * 主要欄位（非 key，DynamoDB 無固定 schema，列出供參考）：
 *   teacherId, studentId, pageUrl, status,
 *   startedAt, endedAt, durationSeconds,
 *   createdAt, updatedAt
 */
const sessionsTable = {
    TableName: 'jvtutorcorner-agora-sessions',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        { AttributeName: 'sessionId',    AttributeType: 'S' },
        { AttributeName: 'courseId',     AttributeType: 'S' },
        { AttributeName: 'orderId',      AttributeType: 'S' },
        { AttributeName: 'channelName',  AttributeType: 'S' },
        { AttributeName: 'createdAt',    AttributeType: 'S' },
    ],
    KeySchema: [
        { AttributeName: 'sessionId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: 'courseId-index',
            KeySchema: [
                { AttributeName: 'courseId',  KeyType: 'HASH' },
                { AttributeName: 'createdAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: 'orderId-index',
            KeySchema: [
                { AttributeName: 'orderId',   KeyType: 'HASH' },
                { AttributeName: 'createdAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: 'channelName-index',
            KeySchema: [
                { AttributeName: 'channelName', KeyType: 'HASH' },
                { AttributeName: 'createdAt',   KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
};

/**
 * Table 2: jvtutorcorner-agora-participants
 *
 * PK:  participantId (S)
 * GSI: sessionId-index     → sessionId (S) | joinedAt (S)
 * GSI: userId-index        → userId    (S) | joinedAt (S)
 *
 * 主要欄位（含 Agora Dashboard 可見欄位）：
 *   sessionId, userId, role, agoraUid, channelName,
 *   — Agora Dashboard 欄位 —
 *   osName, osVersion,                 → OS   (e.g. iOS 17.6.1)
 *   networkType,                        → NET  (e.g. NETWORK_UNKNOWN)
 *   sdkVersion, sdkFullVersion,         → SDK  (e.g. 4.24.2/release_...)
 *   deviceCategory, deviceModel,        → Device type (Apple iPhone)
 *   browserName, browserVersion,        → Browser (Chrome 146.0.7680.151)
 *   userAgent, systemRequirementsCheck,
 *   joinedAt, leftAt, createdAt, updatedAt
 */
const participantsTable = {
    TableName: 'jvtutorcorner-agora-participants',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        { AttributeName: 'participantId', AttributeType: 'S' },
        { AttributeName: 'sessionId',     AttributeType: 'S' },
        { AttributeName: 'userId',        AttributeType: 'S' },
        { AttributeName: 'joinedAt',      AttributeType: 'S' },
    ],
    KeySchema: [
        { AttributeName: 'participantId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: 'sessionId-index',
            KeySchema: [
                { AttributeName: 'sessionId', KeyType: 'HASH' },
                { AttributeName: 'joinedAt',  KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: 'userId-index',
            KeySchema: [
                { AttributeName: 'userId',   KeyType: 'HASH' },
                { AttributeName: 'joinedAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
};

/**
 * Table 3: jvtutorcorner-agora-quality-events
 *
 * PK:  eventId (S)
 * GSI: sessionId-index        → sessionId     (S) | sampledAt (S)
 * GSI: participantId-index    → participantId (S) | sampledAt (S)
 *
 * 主要欄位：
 *   sessionId, participantId, channelName,
 *   uplinkQuality (0-6), downlinkQuality (0-6),
 *   networkType, rtt, packetLossRate,
 *   sampledAt, createdAt
 */
const qualityEventsTable = {
    TableName: 'jvtutorcorner-agora-quality-events',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        { AttributeName: 'eventId',       AttributeType: 'S' },
        { AttributeName: 'sessionId',     AttributeType: 'S' },
        { AttributeName: 'participantId', AttributeType: 'S' },
        { AttributeName: 'sampledAt',     AttributeType: 'S' },
    ],
    KeySchema: [
        { AttributeName: 'eventId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: 'sessionId-index',
            KeySchema: [
                { AttributeName: 'sessionId', KeyType: 'HASH' },
                { AttributeName: 'sampledAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: 'participantId-index',
            KeySchema: [
                { AttributeName: 'participantId', KeyType: 'HASH' },
                { AttributeName: 'sampledAt',     KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
};

/**
 * Table 4: jvtutorcorner-agora-connection-events
 *
 * PK:  eventId (S)
 * GSI: sessionId-index        → sessionId     (S) | occurredAt (S)
 * GSI: participantId-index    → participantId (S) | occurredAt (S)
 *
 * 主要欄位：
 *   sessionId, participantId, channelName,
 *   eventType (join/leave/reconnect/disconnect/network-change/stream-*),
 *   prevState, currState, reason,
 *   occurredAt, createdAt
 */
const connectionEventsTable = {
    TableName: 'jvtutorcorner-agora-connection-events',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
        { AttributeName: 'eventId',       AttributeType: 'S' },
        { AttributeName: 'sessionId',     AttributeType: 'S' },
        { AttributeName: 'participantId', AttributeType: 'S' },
        { AttributeName: 'occurredAt',    AttributeType: 'S' },
    ],
    KeySchema: [
        { AttributeName: 'eventId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: 'sessionId-index',
            KeySchema: [
                { AttributeName: 'sessionId',  KeyType: 'HASH' },
                { AttributeName: 'occurredAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
        {
            IndexName: 'participantId-index',
            KeySchema: [
                { AttributeName: 'participantId', KeyType: 'HASH' },
                { AttributeName: 'occurredAt',    KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
};

// ─── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 開始建立 Agora 資料表（region:', region, '）\n');

    await createTable(sessionsTable);
    await createTable(participantsTable);
    await createTable(qualityEventsTable);
    await createTable(connectionEventsTable);

    console.log('\n🎉 所有資料表建立完成！');
    console.log('\n資料表架構關聯：');
    console.log('  jvtutorcorner-agora-sessions');
    console.log('    ← (sessionId) jvtutorcorner-agora-participants');
    console.log('         ← (participantId) jvtutorcorner-agora-quality-events');
    console.log('         ← (participantId) jvtutorcorner-agora-connection-events');
}

main().catch(err => {
    console.error('❌ 執行失敗：', err);
    process.exit(1);
});
