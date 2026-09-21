// One-off: create the jvtutorcorner-homepage-settings table.
//
// Backs lib/homepageSettingsService.ts — a single-item table (PK: id) that lets
// /admin/settings toggle the homepage "個人化推薦" (#tour-recommendation) section
// on/off at runtime instead of it being hardcoded on. Without this table, saves
// from the admin UI fail with "Failed to save homepage settings" and reads fall
// back to the DEFAULT_SETTINGS in code.
//
//   node --env-file=.env.local scripts/create-homepage-settings-table.mjs
// Idempotent: skips if the table already exists.

import 'dotenv/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const TABLE = process.env.DYNAMODB_TABLE_HOMEPAGE_SETTINGS || 'jvtutorcorner-homepage-settings';
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
  console.log(`[homepage-settings-table] region=${region} table=${TABLE}`);
  const status = await exists();
  if (status) {
    console.log(`[homepage-settings-table] already exists (status=${status}); nothing to do.`);
    return;
  }
  console.log('[homepage-settings-table] creating…');
  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      SSESpecification: { Enabled: true },
      Tags: [
        { Key: 'Project', Value: 'jvtutorcorner' },
        { Key: 'Purpose', Value: 'Homepage-Settings' },
      ],
    })
  );
  for (let i = 0; i < 60; i++) {
    const s = await exists();
    if (s === 'ACTIVE') break;
    console.log(`[homepage-settings-table] status=${s}… waiting`);
    await sleep(3000);
  }
  console.log('[homepage-settings-table] ✅ ready.');
}

main().catch((e) => {
  console.error('[homepage-settings-table] FAILED:', e);
  process.exit(1);
});
