#!/usr/bin/env ts-node
/**
 * scripts/setup-key-logs-table.ts
 *
 * 建立 jvtutorcorner-key-logs DynamoDB Table
 *
 * Table Schema:
 *   PK: date (String)           YYYY-MM-DD  → 依日期分區
 *   SK: sk   (String)           timestamp#id → 時間可排序
 *
 * GSI:
 *   level-date-index    PK=level,    SK=date  → 查詢 ERROR/CRITICAL
 *   category-date-index PK=category, SK=date  → 查詢業務類別
 *   userId-ts-index     PK=userId,   SK=sk    → 查詢單一使用者紀錄
 *
 * TTL: ttl (Unix 秒)  → 預設 30 天自動過期
 *
 * Usage:
 *   npx ts-node scripts/setup-key-logs-table.ts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    UpdateTimeToLiveCommand,
    ResourceNotFoundException,
    TableStatus,
    BillingMode,
    KeyType,
    ScalarAttributeType,
    ProjectionType,
} from '@aws-sdk/client-dynamodb';

// Load environment files if present (prefer .env.local)
try {
    const localEnv = path.resolve(process.cwd(), '.env.local');
    const env = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(localEnv)) {
        dotenv.config({ path: localEnv });
        console.log('🔐 Loaded environment from .env.local');
    } else if (fs.existsSync(env)) {
        dotenv.config({ path: env });
        console.log('🔐 Loaded environment from .env');
    }
} catch (e) {
    // Non-fatal if dotenv can't load; continue to allow IAM roles
}

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_KEY_LOGS || 'jvtutorcorner-key-logs';

function createClient(): DynamoDBClient {
    const cfg: any = { region: REGION };
    const ak = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
    const sk = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
    if (ak && sk) cfg.credentials = { accessKeyId: ak, secretAccessKey: sk };
    return new DynamoDBClient(cfg);
}

const client = createClient();

async function tableExists(): Promise<boolean> {
    try {
        await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        return true;
    } catch (e: any) {
        if (e instanceof ResourceNotFoundException) return false;
        throw e;
    }
}

async function waitActive(): Promise<void> {
    for (let i = 0; i < 30; i++) {
        const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        if (Table?.TableStatus === TableStatus.ACTIVE) {
            console.log(`✅ [${TABLE_NAME}] ACTIVE`);
            return;
        }
        console.log(`   Status: ${Table?.TableStatus}, waiting 5s…`);
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Timeout waiting for table to become ACTIVE');
}

async function main() {
    console.log(`\n🔧 Setting up Key Logs Table: ${TABLE_NAME} (region: ${REGION})\n`);

    if (await tableExists()) {
        console.log(`✅ Table already exists: ${TABLE_NAME}`);
    } else {
        console.log(`📦 Creating table: ${TABLE_NAME}…`);
        await client.send(new CreateTableCommand({
            TableName: TABLE_NAME,
            BillingMode: BillingMode.PAY_PER_REQUEST,
            AttributeDefinitions: [
                { AttributeName: 'date',     AttributeType: ScalarAttributeType.S },
                { AttributeName: 'sk',       AttributeType: ScalarAttributeType.S },
                { AttributeName: 'level',    AttributeType: ScalarAttributeType.S },
                { AttributeName: 'category', AttributeType: ScalarAttributeType.S },
                { AttributeName: 'userId',   AttributeType: ScalarAttributeType.S },
            ],
            KeySchema: [
                { AttributeName: 'date', KeyType: KeyType.HASH },
                { AttributeName: 'sk',   KeyType: KeyType.RANGE },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'level-date-index',
                    KeySchema: [
                        { AttributeName: 'level', KeyType: KeyType.HASH },
                        { AttributeName: 'date',  KeyType: KeyType.RANGE },
                    ],
                    Projection: { ProjectionType: ProjectionType.ALL },
                },
                {
                    IndexName: 'category-date-index',
                    KeySchema: [
                        { AttributeName: 'category', KeyType: KeyType.HASH },
                        { AttributeName: 'date',     KeyType: KeyType.RANGE },
                    ],
                    Projection: { ProjectionType: ProjectionType.ALL },
                },
                {
                    IndexName: 'userId-ts-index',
                    KeySchema: [
                        { AttributeName: 'userId', KeyType: KeyType.HASH },
                        { AttributeName: 'sk',     KeyType: KeyType.RANGE },
                    ],
                    Projection: { ProjectionType: ProjectionType.ALL },
                },
            ],
        }));
        await waitActive();
    }

    // Enable TTL
    console.log('⏱  Enabling TTL on attribute "ttl"…');
    try {
        await client.send(new UpdateTimeToLiveCommand({
            TableName: TABLE_NAME,
            TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
        }));
        console.log('✅ TTL enabled');
    } catch (e: any) {
        // Already enabled = fine
        if (e.message?.includes('already')) {
            console.log('   TTL already enabled, skipping');
        } else {
            console.warn('⚠️  TTL enable failed (non-critical):', e.message);
        }
    }

    console.log(`\n✅ Done! Add to .env.local:\n   DYNAMODB_TABLE_KEY_LOGS=${TABLE_NAME}\n`);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
