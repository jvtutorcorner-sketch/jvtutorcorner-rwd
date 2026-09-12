#!/usr/bin/env node
// scripts/create-audit-log-table.mjs
// 建立 DynamoDB audit-logs table（若不存在）— 對應 cloudformation/dynamodb-audit-log-table.yml
// 這張表原本只有 CF 樣板但從未部署到正式環境，導致 writeAuditLog() 每次呼叫都因
// ResourceNotFoundException 靜默失敗（該函式刻意 catch 掉所有錯誤，不讓稽核寫入
// 擋住主要操作）。這支腳本用 SDK 直接建表，等效於部署該樣板（沒有本機 aws cli）。
//
// 執行：
//   node --import ./scripts/lib/register-ts-resolve.mjs scripts/create-audit-log-table.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateContinuousBackupsCommand } from '@aws-sdk/client-dynamodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_AUDIT_LOGS || 'jvtutorcorner-audit-logs';

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function main() {
  console.log(`[create-audit-log-table] Checking table: ${TABLE_NAME}`);

  if (await tableExists(TABLE_NAME)) {
    console.log(`[create-audit-log-table] Table already exists: ${TABLE_NAME}`);
    return;
  }

  console.log(`[create-audit-log-table] Creating table: ${TABLE_NAME}`);
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'auditId', AttributeType: 'S' },
      { AttributeName: 'targetId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'auditId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byTargetId',
        KeySchema: [
          { AttributeName: 'targetId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    SSESpecification: { Enabled: true },
  }));

  console.log(`[create-audit-log-table] Waiting for table to become ACTIVE...`);
  let status = 'CREATING';
  while (status !== 'ACTIVE') {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    status = res.Table.TableStatus;
  }

  try {
    await client.send(new UpdateContinuousBackupsCommand({
      TableName: TABLE_NAME,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    }));
    console.log('[create-audit-log-table] Point-in-time recovery enabled.');
  } catch (e) {
    console.warn('[create-audit-log-table] Could not enable PITR (non-fatal):', e.message);
  }

  console.log(`[create-audit-log-table] ✅ Table created and ACTIVE: ${TABLE_NAME}`);
  console.log('[create-audit-log-table] GSI: byTargetId (targetId HASH, createdAt RANGE)');
}

main().catch((err) => {
  console.error('[create-audit-log-table] ❌ Failed:', err);
  process.exit(1);
});
