#!/usr/bin/env node
// scripts/create-dev-tables.mjs
//
// Clones every real jvtutorcorner-* DynamoDB table into an isolated dev-prefixed
// set (jvtutorcorner-dev-*) with an IDENTICAL schema — same KeySchema,
// AttributeDefinitions, GlobalSecondaryIndexes, and stream config — introspected
// live from AWS via DescribeTable rather than hand-typed, so there is no risk of
// the dev tables silently diverging from production GSI/key behavior (this repo
// has already shipped one bug — the org-units byParentId null-key issue — that a
// schema mismatch between environments would have hidden).
//
// This script only READS existing tables and CREATEs new ones. It never
// writes to, modifies, or deletes any existing table or its data.
//
// Usage:
//   node scripts/create-dev-tables.mjs            # create missing dev-* tables
//   node scripts/create-dev-tables.mjs --dry-run   # show what would be created
//   node scripts/create-dev-tables.mjs --prefix=jvtutorcorner-staging-
//
// After running, point DYNAMODB_TABLE_* env vars at the new dev- names — see
// scripts/write-dev-env.mjs (companion script) which does this automatically
// for .env.local.

import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
} from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const prefixArg = args.find((a) => a.startsWith('--prefix='));
const DEV_PREFIX = prefixArg ? prefixArg.split('=')[1] : 'jvtutorcorner-dev-';
const SOURCE_PREFIX = 'jvtutorcorner-';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

async function listSourceTables() {
  const names = [];
  let ExclusiveStartTableName;
  do {
    const res = await client.send(new ListTablesCommand({ ExclusiveStartTableName }));
    names.push(...(res.TableNames || []));
    ExclusiveStartTableName = res.LastEvaluatedTableName;
  } while (ExclusiveStartTableName);
  return names
    .filter((n) => n.startsWith(SOURCE_PREFIX) && !n.startsWith(DEV_PREFIX))
    .sort();
}

function buildDevCreateParams(desc, devName) {
  const params = {
    TableName: devName,
    KeySchema: desc.KeySchema,
    AttributeDefinitions: desc.AttributeDefinitions,
    BillingMode: 'PAY_PER_REQUEST',
    SSESpecification: { Enabled: !!desc.SSEDescription },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Environment', Value: 'dev-isolated' },
      { Key: 'ClonedFrom', Value: desc.TableName },
    ],
  };

  if (desc.GlobalSecondaryIndexes?.length) {
    params.GlobalSecondaryIndexes = desc.GlobalSecondaryIndexes.map((gsi) => ({
      IndexName: gsi.IndexName,
      KeySchema: gsi.KeySchema,
      Projection: gsi.Projection,
    }));
  }

  if (desc.StreamSpecification?.StreamEnabled) {
    params.StreamSpecification = {
      StreamEnabled: true,
      StreamViewType: desc.StreamSpecification.StreamViewType,
    };
  }

  return params;
}

async function main() {
  console.log(`Source prefix: ${SOURCE_PREFIX}*  →  Dev prefix: ${DEV_PREFIX}*`);
  if (DRY_RUN) console.log('(dry run — no tables will be created)\n');

  const sourceNames = await listSourceTables();
  console.log(`Found ${sourceNames.length} source tables.\n`);

  const existingDev = new Set(
    (await client.send(new ListTablesCommand({}))).TableNames.filter((n) =>
      n.startsWith(DEV_PREFIX)
    )
  );

  const results = { created: [], skipped: [], failed: [] };

  for (const sourceName of sourceNames) {
    const suffix = sourceName.slice(SOURCE_PREFIX.length);
    const devName = `${DEV_PREFIX}${suffix}`;

    if (existingDev.has(devName)) {
      console.log(`  = ${devName} (already exists, skipping)`);
      results.skipped.push(devName);
      continue;
    }

    try {
      const { Table: desc } = await client.send(
        new DescribeTableCommand({ TableName: sourceName })
      );
      const params = buildDevCreateParams(desc, devName);

      if (DRY_RUN) {
        console.log(`  + would create ${devName} (from ${sourceName}, ${params.GlobalSecondaryIndexes?.length || 0} GSIs)`);
        results.created.push(devName);
        continue;
      }

      await client.send(new CreateTableCommand(params));
      console.log(`  + created ${devName} (from ${sourceName}, ${params.GlobalSecondaryIndexes?.length || 0} GSIs)`);
      results.created.push(devName);
    } catch (err) {
      console.error(`  ! FAILED ${devName}: ${err.message}`);
      results.failed.push({ devName, error: err.message });
    }
  }

  console.log('\n── Summary ──');
  console.log(`Created: ${results.created.length}`);
  console.log(`Skipped (already existed): ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    results.failed.forEach((f) => console.log(`  - ${f.devName}: ${f.error}`));
    process.exitCode = 1;
  }

  if (!DRY_RUN && results.created.length) {
    console.log(
      '\nNext: run `node scripts/write-dev-env.mjs` to point .env.local at these dev tables.'
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
