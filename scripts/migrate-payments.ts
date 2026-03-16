// scripts/migrate-payments.ts
//
// 讀取 .env.local 中的金流金鑰，並將其寫入 jvtutorcorner-app-integrations 表中。
// 預設綁定給 lin@test.com (QA Teacher)。

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 載入 .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ddbRegion = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region: ddbRegion });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
const TEACHER_EMAIL = process.env.QA_TEACHER_EMAIL || 'lin@test.com';
const TEACHER_UUID = 'e61300a2-083d-4888-9047-70f03db51af9';

async function migrate() {
    console.log(`Starting migration for user: ${TEACHER_EMAIL} (UUID: ${TEACHER_UUID})`);
    console.log(`Target Table: ${TABLE}`);

    const { ScanCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');

    // 0. Cleanup old email-based records in DynamoDB
    try {
        console.log('Checking for old email-based records...');
        const scanRes = await docClient.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: 'userId = :email',
            ExpressionAttributeValues: { ':email': TEACHER_EMAIL }
        }));

        if (scanRes.Items && scanRes.Items.length > 0) {
            console.log(`Found ${scanRes.Items.length} old email-based records. Deleting...`);
            for (const item of scanRes.Items) {
                await docClient.send(new DeleteCommand({
                    TableName: TABLE,
                    Key: { integrationId: item.integrationId }
                }));
                console.log(`Deleted: ${item.integrationId} (${item.type})`);
            }
        }
    } catch (err: any) {
        console.warn(`DynamoDB cleanup failed (likely running in local mode): ${err.message}`);
    }

    const integrations = [];

    // 1. ECPay
    if (process.env.ECPAY_MERCHANT_ID) {
        integrations.push({
            type: 'ECPAY',
            name: '預設綠界服務 (Migrated)',
            config: {
                merchantId: process.env.ECPAY_MERCHANT_ID,
                hashKey: process.env.ECPAY_HASH_KEY || '',
                hashIV: process.env.ECPAY_HASH_IV || ''
            }
        });
    }

    // 2. PayPal
    if (process.env.PAYPAL_CLIENT_ID) {
        integrations.push({
            type: 'PAYPAL',
            name: '預設 PayPal 服務 (Migrated)',
            config: {
                clientId: process.env.PAYPAL_CLIENT_ID,
                secretKey: process.env.PAYPAL_APP_SECRET || ''
            }
        });
    }

    // 3. Stripe
    if (process.env.STRIPE_SECRET_KEY) {
        integrations.push({
            type: 'STRIPE',
            name: '預設 Stripe 服務 (Migrated)',
            config: {
                publicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
                secretKey: process.env.STRIPE_SECRET_KEY || ''
            }
        });
    }

    if (integrations.length === 0) {
        console.log('No valid credentials found in .env.local to migrate.');
        return;
    }

    const migratedIds = [];

    for (const integration of integrations) {
        const now = new Date().toISOString();
        const item = {
            integrationId: randomUUID(),
            userId: TEACHER_UUID,
            type: integration.type,
            name: integration.name,
            config: integration.config,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now
        };

        try {
            await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
            console.log(`Successfully migrated ${integration.type} to DynamoDB (UUID).`);
            migratedIds.push(item.integrationId);
        } catch (e: any) {
            console.warn(`Failed to write ${integration.type} to DynamoDB: ${e.message}`);

            // Fallback to local file
            const localDataPath = path.resolve(process.cwd(), '.local_data', 'app-integrations.json');
            try {
                if (!fs.existsSync(path.dirname(localDataPath))) {
                    fs.mkdirSync(path.dirname(localDataPath), { recursive: true });
                }
                let localData = [];
                if (fs.existsSync(localDataPath)) {
                    localData = JSON.parse(fs.readFileSync(localDataPath, 'utf8') || '[]');
                }
                // Cleanup local if needed
                localData = localData.filter((i: any) => i.userId !== TEACHER_EMAIL);
                localData.unshift(item);
                fs.writeFileSync(localDataPath, JSON.stringify(localData, null, 2), 'utf8');
                console.log(`Successfully migrated ${integration.type} to local file: ${localDataPath}`);
            } catch (err: any) {
                console.error(`Failed to write to local file: ${err.message}`);
            }
        }
    }

    console.log('Migration completed.');
}

migrate();
