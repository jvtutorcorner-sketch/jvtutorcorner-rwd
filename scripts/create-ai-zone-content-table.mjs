// One-off: create the jvtutorcorner-ai-zone-content table.
//
// Backs lib/aiZoneContentService.ts — AI zone content (one item per clip, PK: id),
// managed from /ai-zone/manage and shown on the homepage (#ai-zone)
// and /ai-zone. Without this table the admin page cannot save, and the public
// pages just render no clips.
//
//   node --env-file=.env.local scripts/create-ai-zone-content-table.mjs
// Idempotent: skips if the table already exists.

import 'dotenv/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_AI_ZONE_CONTENT || 'jvtutorcorner-ai-zone-content';
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
  console.log(`[ai-zone-content-table] region=${region} table=${TABLE}`);
  const status = await exists();
  if (status) {
    console.log(`[ai-zone-content-table] already exists (status=${status}); nothing to do.`);
    return;
  }
  console.log('[ai-zone-content-table] creating…');
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      SSESpecification: { Enabled: true },
      Tags: [
        { Key: 'Project', Value: 'jvtutorcorner' },
        { Key: 'Purpose', Value: 'AI-Zone-Content' },
      ],
    })
  );
  for (let i = 0; i < 60; i++) {
    const s = await exists();
    if (s === 'ACTIVE') break;
    console.log(`[ai-zone-content-table] status=${s}… waiting`);
    await sleep(3000);
  }
  console.log('[ai-zone-content-table] ✅ ready.');
}

main().catch((e) => {
  console.error('[ai-zone-content-table] FAILED:', e);
  process.exit(1);
});
