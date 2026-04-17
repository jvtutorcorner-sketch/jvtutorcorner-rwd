#!/usr/bin/env node
// scripts/create-sessions-table.mjs
// 建立 DynamoDB sessions table（若不存在）
// 執行：node scripts/create-sessions-table.mjs

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_SESSIONS || 'jvtutorcorner-sessions';

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
  console.log(`[create-sessions-table] Checking table: ${TABLE_NAME}`);

  if (await tableExists(TABLE_NAME)) {
    console.log(`[create-sessions-table] Table already exists: ${TABLE_NAME}`);
    return;
  }

  console.log(`[create-sessions-table] Creating table: ${TABLE_NAME}`);
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'sessionId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'sessionId', KeyType: 'HASH' },
    ],
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: 'ttl',
    },
  }));

  console.log(`[create-sessions-table] ✅ Table created: ${TABLE_NAME}`);
  console.log('[create-sessions-table] TTL attribute: ttl (auto-expire sessions after 24h)');
}

main().catch(err => {
  console.error('[create-sessions-table] ❌ Failed:', err);
  process.exit(1);
});
