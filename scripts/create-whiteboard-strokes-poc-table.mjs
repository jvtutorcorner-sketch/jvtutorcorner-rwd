// One-off: create the append-only whiteboard-strokes POC table.
//
// Purpose: prove that storing each stroke as its own small item makes every write
// O(1) (~1 WCU) regardless of how many strokes are on the board, instead of the
// current single-growing-item model where each stroke-update rewrites the whole
// item (WCU = item size ≈ 0.68 KB × strokes). New, empty, isolated table with a
// 24h TTL — safe to delete afterwards (DeleteTable), touches no existing data.
//
//   node --env-file=.env.local scripts/create-whiteboard-strokes-poc-table.mjs
// (or rely on dotenv below). Idempotent: skips if the table already exists.

import 'dotenv/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.WHITEBOARD_STROKES_TABLE || 'jvtutorcorner-whiteboard-strokes';
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
  console.log(`[poc-table] region=${region} table=${TABLE}`);
  const status = await exists();
  if (status) {
    console.log(`[poc-table] already exists (status=${status}); nothing to do.`);
    return;
  }
  console.log('[poc-table] creating…');
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'roomId', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'roomId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    })
  );
  // Wait for ACTIVE
  for (let i = 0; i < 60; i++) {
    const s = await exists();
    if (s === 'ACTIVE') break;
    console.log(`[poc-table] status=${s}… waiting`);
    await sleep(3000);
  }
  // Enable TTL so POC rows self-clean.
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: TABLE,
        TimeToLiveSpecification: { Enabled: true, AttributeName: 'ttl' },
      })
    );
    console.log('[poc-table] TTL enabled on "ttl".');
  } catch (e) {
    console.warn('[poc-table] TTL enable failed (non-fatal):', String(e));
  }
  console.log('[poc-table] ✅ ready.');
}

main().catch((e) => {
  console.error('[poc-table] FAILED:', e);
  process.exit(1);
});
