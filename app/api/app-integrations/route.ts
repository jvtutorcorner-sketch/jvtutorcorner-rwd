// app/api/app-integrations/route.ts
//
// 通用應用程式串接設定 API。
// 所有整合類型（LINE、Slack、Teams 等）共用同一張資料表 `jvtutorcorner-app-integrations`，
// 以 `type` 欄位區分，避免每增加一種應用就建立新資料表。
//
// DynamoDB 資料表: jvtutorcorner-app-integrations
// PK: integrationId (UUID)
// 建議 GSI (如需要): userId-type-index
//
// 與其他資料表完全獨立：
//   課程訂單 → jvtutorcorner-orders
//   課程報名 → jvtutorcorner-enrollments
//   方案升級 → jvtutorcorner-plan-upgrades
//   應用程式設定 → jvtutorcorner-app-integrations (本檔)
//   PK: userId (HASH), type (RANGE)
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
const ddbExplicitAccessKey = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const ddbExplicitSecretKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const ddbExplicitSessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
const ddbExplicitCreds = ddbExplicitAccessKey && ddbExplicitSecretKey ? {
    accessKeyId: ddbExplicitAccessKey as string,
    secretAccessKey: ddbExplicitSecretKey as string,
    ...(ddbExplicitSessionToken ? { sessionToken: ddbExplicitSessionToken as string } : {})
} : undefined;

const client = new DynamoDBClient({ region: ddbRegion, credentials: ddbExplicitCreds });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';

const useDynamo = typeof TABLE === 'string' && TABLE.length > 0;

if (!useDynamo) {
    console.warn(`[app-integrations API] DYNAMODB_TABLE_APP_INTEGRATIONS is not set!`);
} else {
    console.log(`[app-integrations API] Using DynamoDB Table: ${TABLE}`);
}

// ---------------------------------------------------------------------------
// 型別定義
// ---------------------------------------------------------------------------

/** 所有整合類型共用的基本欄位 */
export type AppIntegrationRecord = {
    integrationId: string;     // PK (UUID)
    userId: string;            // 所屬使用者
    type: string;              // 整合類型，如 'LINE'、'SLACK'、'TEAMS' 等
    name: string;              // 顯示名稱
    // 各類型的專屬設定，以 config 物件存放，擴充時不需改動資料表結構
    config: Record<string, string>;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
};

/** LINE 整合的 config 欄位 */
// config.channelAccessToken - 用於發信
// config.channelSecret      - 用於驗證
// TODO (production): 敏感欄位（channelAccessToken, channelSecret）應在儲存前
// 透過 AWS Secrets Manager 或 KMS 加密，避免明文存放於 DynamoDB。

// ---------------------------------------------------------------------------
// POST - 新增整合
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { userId, type, name, config } = body || {};

        if (!userId || !type) {
            return NextResponse.json(
                { ok: false, error: 'userId and type are required.' },
                { status: 400 }
            );
        }

        if (!config || typeof config !== 'object') {
            return NextResponse.json(
                { ok: false, error: 'config object is required.' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();
        const item: AppIntegrationRecord = {
            integrationId: randomUUID(),
            userId: String(userId),
            type: String(type).toUpperCase(),
            name: String(name || `${type} 整合`).trim(),
            config,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
        };

        await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));

        return NextResponse.json({ ok: true, integration: item }, { status: 201 });
    } catch (error: any) {
        console.error('[app-integrations API] POST error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to create integration.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// GET - 查詢整合 (支援 ?userId=... 與 ?type=... 篩選)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const type = searchParams.get('type');

        // Removed local JSON fallback, strictly using DynamoDB

        const filters: string[] = [];
        const ExpressionAttributeValues: Record<string, any> = {};

        if (userId) {
            filters.push('userId = :userId');
            ExpressionAttributeValues[':userId'] = userId;
        }
        if (type) {
            filters.push('#type = :type');
            ExpressionAttributeValues[':type'] = type.toUpperCase();
        }

        const scanInput: any = { TableName: TABLE };
        if (filters.length > 0) {
            scanInput.FilterExpression = filters.join(' AND ');
            scanInput.ExpressionAttributeValues = ExpressionAttributeValues;
            if (type) scanInput.ExpressionAttributeNames = { '#type': 'type' };
        }

        const res = await docClient.send(new ScanCommand(scanInput));
        return NextResponse.json({ ok: true, total: res.Count || 0, data: res.Items || [] });
    } catch (error: any) {
        console.error('[app-integrations API] GET error:', error?.message || error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch integrations.' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// PUT - 更新整合
// ---------------------------------------------------------------------------
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        console.log('[app-integrations API] PUT request body:', body);
        const { integrationId, userId, type, config, name, status } = body || {};

        if (!userId || !type) {
            return NextResponse.json(
                { ok: false, error: 'userId and type are required for primary key.' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        const existing = await docClient.send(new GetCommand({
            TableName: TABLE,
            Key: { userId: String(userId), type: String(type).toUpperCase() }
        }));

        if (!existing.Item) {
            return NextResponse.json({ ok: false, error: '整合項目不存在 (Not found by PK: userId+type)' }, { status: 404 });
        }

        const updatedItem = {
            ...existing.Item,
            integrationId: integrationId || existing.Item.integrationId,
            name: name || existing.Item.name,
            config: config || existing.Item.config,
            status: status || existing.Item.status,
            updatedAt: now,
        };

        console.log('[app-integrations API] Saving updated item to DynamoDB:', JSON.stringify(updatedItem, null, 2));
        await docClient.send(new PutCommand({ TableName: TABLE, Item: updatedItem }));
        return NextResponse.json({ ok: true, integration: updatedItem });
    } catch (error: any) {
        console.error('[app-integrations API] PUT error:', error);
        return NextResponse.json({ ok: false, error: `Failed to update integration: ${error.message}` }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// DELETE - 刪除整合
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const type = searchParams.get('type');

        if (!userId || !type) {
            return NextResponse.json({ ok: false, error: 'userId and type (PK) are required for deletion.' }, { status: 400 });
        }

        await docClient.send(new DeleteCommand({
            TableName: TABLE,
            Key: { userId: String(userId), type: String(type).toUpperCase() }
        }));

        return NextResponse.json({ ok: true, message: 'Integration deleted successfully' });
    } catch (error: any) {
        console.error('[app-integrations API] DELETE error:', error);
        return NextResponse.json({ ok: false, error: `Failed to delete integration: ${error.message}` }, { status: 500 });
    }
}
