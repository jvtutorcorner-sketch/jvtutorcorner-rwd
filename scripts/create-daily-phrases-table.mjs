// One-off: create the jvtutorcorner-daily-phrases table.
//
// Backs lib/dailyPhraseService.ts — one item per "AI 每日一句" clip (PK: id),
// managed from /admin/daily-phrases and shown on the homepage (#daily-phrases)
// and /daily. Without this table the admin page cannot save, and the public
// pages just render no clips.
//
//   node --env-file=.env.local scripts/create-daily-phrases-table.mjs
// Idempotent: skips if the table already exists.

import 'dotenv/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_DAILY_PHRASES || 'jvtutorcorner-daily-phrases';
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

const client = new DynamoDBClient({
  region,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } : undefined,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists() {
  try {
    const d = await client.send(new DescribeTableCommand({ TableName: TABLE }));
    return d.Table?.TableStatus;
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') return null;
    throw e;
  }
}

async function main() {
  console.log(`[daily-phrases-table] region=${region} table=${TABLE}`);
  const status = await exists();
  if (status) {
    console.log(`[daily-phrases-table] already exists (status=${status}); nothing to do.`);
    return;
  }
  console.log('[daily-phrases-table] creating…');
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      SSESpecification: { Enabled: true },
      Tags: [
        { Key: 'Project', Value: 'jvtutorcorner' },
        { Key: 'Purpose', Value: 'Daily-Phrases' },
      ],
    })
  );
  for (let i = 0; i < 60; i++) {
    const s = await exists();
    if (s === 'ACTIVE') break;
    console.log(`[daily-phrases-table] status=${s}… waiting`);
    await sleep(3000);
  }
  console.log('[daily-phrases-table] ✅ ready.');
}

main().catch((e) => {
  console.error('[daily-phrases-table] FAILED:', e);
  process.exit(1);
});
