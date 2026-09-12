#!/usr/bin/env node
// scripts/create-rate-limit-table.mjs
// 建立 DynamoDB rate-limit 計數表（若不存在）。
// 執行：node scripts/create-rate-limit-table.mjs
//
// 表結構：
//   PK: rlKey (S)  — `<scope>:<identifier>:<windowStart>`，見 lib/rateLimit.ts
//   ttl (N)        — 時間窗結束後由 DynamoDB TTL 自動清除

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_RATE_LIMITS || 'jvtutorcorner-rate-limits';

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function waitForActive(name) {
  for (let i = 0; i < 30; i++) {
    const res = await client.send(new DescribeTableCommand({ TableName: name }));
    if (res.Table?.TableStatus === 'ACTIVE') return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Table ${name} did not become ACTIVE in time`);
}

async function main() {
  console.log(`[create-rate-limit-table] Checking table: ${TABLE_NAME}`);

  if (await tableExists(TABLE_NAME)) {
    console.log(`[create-rate-limit-table] Table already exists: ${TABLE_NAME}`);
    return;
  }

  console.log(`[create-rate-limit-table] Creating table: ${TABLE_NAME}`);
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'rlKey', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'rlKey', KeyType: 'HASH' }],
  }));

  await waitForActive(TABLE_NAME);

  // TTL 必須在表 ACTIVE 之後另外開啟（CreateTable 不接受 TimeToLiveSpecification）。
  await client.send(new UpdateTimeToLiveCommand({
    TableName: TABLE_NAME,
    TimeToLiveSpecification: { Enabled: true, AttributeName: 'ttl' },
  }));

  console.log(`[create-rate-limit-table] ✅ Table created with TTL: ${TABLE_NAME}`);
}

main().catch((err) => {
  console.error('[create-rate-limit-table] ❌ Failed:', err);
  process.exit(1);
});
