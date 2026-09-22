#!/usr/bin/env node
/**
 * DynamoDB Setup Script for the B2B/B2C Hybrid LMS Platform.
 *
 * Purpose: create and update DynamoDB tables idempotently.
 *
 * This script is the SOURCE OF TRUTH for table shapes, and it gets that status
 * from scripts/lib/schema.mjs: every CreateTable / UpdateTable call below is
 * built from those declarations rather than from params typed out inline.
 * cloudformation/dynamodb-b2b-tables.yml mirrors the same declarations, and
 * `node scripts/verify-schema.mjs` diffs a live account (and that template)
 * against them.
 *
 * Usage:
 *   node scripts/setup-db.mjs                                  # every table / index
 *   node scripts/setup-db.mjs --only=courseSessions            # one step only
 *   node scripts/setup-db.mjs --only=courseSessions,pointsEscrow
 *   node scripts/setup-db.mjs --only=courseSessions --dry-run  # report, change nothing
 *
 *   Step keys: organizations, orgUnits, licenses, enrollments, courseSessions, classSummaries,
 *              planUpgrades, pointsEscrow, pointTransactions, aiUsageLedger, aiFeatureConfig,
 *              costRollups, lessonEvents, lessonSegments, profiles, courses
 *
 *   Use --only whenever some declared index must NOT be created yet. An index on
 *   an attribute that deployed code still writes as NULL makes every write to
 *   that table fail ("Type mismatch for Index Key"); see
 *   .agents/skills/db-ops-migrations/SKILL.md for the deploy order.
 *
 * Environment Variables:
 *   AWS_REGION - AWS region (default: ap-northeast-1)
 *   AWS_ACCESS_KEY_ID - For local dev only
 *   AWS_SECRET_ACCESS_KEY - For local dev only
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  ResourceNotFoundException,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';

import dotenv from 'dotenv';
import path from 'path';

import {
  TABLES,
  REQUIRED_INDEXES_ON_EXISTING_TABLES,
  resolveTableName,
  createTableParams,
  indexKeySchema,
} from './lib/schema.mjs';
import {
  STEP_KEYS,
  parseOnlyArg,
  parseDryRunArg,
  selectSteps,
  unknownArgs,
} from './lib/setup-steps.mjs';

// Parse flags before anything talks to AWS, so a typo exits with no side effects.
let ONLY;
let DRY_RUN;
try {
  const argv = process.argv.slice(2);
  const unknown = unknownArgs(argv);
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  ONLY = parseOnlyArg(argv);
  DRY_RUN = parseDryRunArg(argv);
  // Validate step keys now (throws on a typo), not after the client exists.
  selectSteps(ONLY, STEP_KEYS.map((key) => ({ key, name: key })));
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ==========================================
// Configuration
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

// ==========================================
// DynamoDB Client Setup
// ==========================================

function createDynamoDBClient() {
  const clientConfig = { region: REGION };

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    console.log('🔑 [Setup] Using explicit credentials from environment (local dev mode)');
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  } else {
    console.log('🔑 [Setup] Using default credential provider chain (IAM role)');
  }

  return new DynamoDBClient(clientConfig);
}

const client = createDynamoDBClient();

// ==========================================
// Utility Functions
// ==========================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

async function getTableStatus(tableName) {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return response.Table?.TableStatus || null;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return null;
    }
    throw error;
  }
}

async function waitForTableActive(tableName, maxWaitSeconds = 120) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  console.log(`⏳ [${tableName}] Waiting for table to become ACTIVE...`);

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getTableStatus(tableName);

    if (status === 'ACTIVE') {
      console.log(`✅ [${tableName}] Table is now ACTIVE`);
      return;
    }

    if (status === null) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    console.log(`   [${tableName}] Current status: ${status}, waiting 5s...`);
    await sleep(5000);
  }

  throw new Error(`Timeout waiting for table ${tableName} to become ACTIVE`);
}

async function gsiExists(tableName, indexName) {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const gsis = response.Table?.GlobalSecondaryIndexes || [];
    return gsis.some(gsi => gsi.IndexName === indexName);
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

async function getGSIStatus(tableName, indexName) {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const gsis = response.Table?.GlobalSecondaryIndexes || [];
    const gsi = gsis.find(g => g.IndexName === indexName);
    return gsi?.IndexStatus || null;
  } catch {
    return null;
  }
}

async function waitForGSIActive(tableName, indexName, maxWaitSeconds = 300) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  console.log(`⏳ [${tableName}] Waiting for GSI "${indexName}" to become ACTIVE...`);

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getGSIStatus(tableName, indexName);

    if (status === 'ACTIVE') {
      console.log(`✅ [${tableName}] GSI "${indexName}" is now ACTIVE`);
      return;
    }

    if (status === null) {
      throw new Error(`GSI ${indexName} does not exist on table ${tableName}`);
    }

    console.log(`   [${tableName}] GSI "${indexName}" status: ${status}, waiting 10s...`);
    await sleep(10000);
  }

  throw new Error(`Timeout waiting for GSI ${indexName} on table ${tableName} to become ACTIVE`);
}

/**
 * Idempotently add one GSI to an existing table.
 *
 * DynamoDB permits only ONE GSI creation per UpdateTable call and refuses any
 * further update while an index is still backfilling, so indexes must be added
 * one at a time with a wait between them. That is what this does.
 */
async function ensureGSI(tableName, index) {
  const indexName = index.name;

  if (!(await tableExists(tableName))) {
    console.log(`⚠️  [${tableName}] Table does not exist yet, skipping GSI "${indexName}"`);
    console.log(`   Note: create the table first, then re-run this script`);
    return false;
  }

  const status = await getTableStatus(tableName);
  if (status !== 'ACTIVE') {
    console.log(`⏳ [${tableName}] Table is ${status}, waiting for ACTIVE state...`);
    await waitForTableActive(tableName);
  }

  if (await gsiExists(tableName, indexName)) {
    // An index still backfilling also "exists". Re-running after a wait timeout
    // must keep waiting, not report success while DynamoDB is still building it.
    const gsiStatus = await getGSIStatus(tableName, indexName);
    if (gsiStatus && gsiStatus !== 'ACTIVE') {
      if (DRY_RUN) {
        console.log(`🔎 [${tableName}] GSI "${indexName}" exists but is ${gsiStatus} (dry run: not waiting)`);
        return false;
      }
      console.log(`⏳ [${tableName}] GSI "${indexName}" exists but is ${gsiStatus}; waiting for ACTIVE`);
      await waitForGSIActive(tableName, indexName);
      return false;
    }
    console.log(`✅ [${tableName}] GSI "${indexName}" already exists`);
    return false;
  }

  if (DRY_RUN) {
    console.log(`🔎 [${tableName}] would add GSI: ${indexName} [${indexKeySchema(index).map((k) => `${k.AttributeName}:${k.KeyType}`).join(', ')}]`);
    return false;
  }

  console.log(`📝 [${tableName}] Adding GSI: ${indexName}`);

  // Only the attributes this index keys on need declaring on an UpdateTable.
  const attributeDefinitions = Object.entries(index.attributes || {}).map(
    ([AttributeName, AttributeType]) => ({ AttributeName, AttributeType })
  );

  try {
    await client.send(new UpdateTableCommand({
      TableName: tableName,
      AttributeDefinitions: attributeDefinitions,
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: indexName,
            KeySchema: indexKeySchema(index),
            Projection: { ProjectionType: 'ALL' },
          },
        },
      ],
    }));
    console.log(`✅ [${tableName}] GSI "${indexName}" creation initiated`);
    await waitForGSIActive(tableName, indexName);
    return true;
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log(`⚠️  [${tableName}] GSI "${indexName}" already exists (race condition)`);
      return false;
    }
    if (error.name === 'ResourceInUseException' || error.message?.includes('ResourceInUseException')) {
      console.log(`⚠️  [${tableName}] Table busy; GSI "${indexName}" may already be creating`);
      try {
        await waitForGSIActive(tableName, indexName);
        return true;
      } catch {
        console.log(`   [${tableName}] Could not verify GSI status, please check manually`);
        return false;
      }
    }
    console.error(`❌ [${tableName}] Failed to add GSI "${indexName}":`, error.message);
    throw error;
  }
}

// ==========================================
// Table Creation
// ==========================================

/**
 * Create one table from its declaration, or bring an existing one up to spec by
 * adding any missing GSI. Both directions matter: a table created before an
 * index was declared is otherwise silently missing it, which is how the
 * enrollments table ended up with no indexes and every caller scanning it.
 */
async function ensureTable(def) {
  const tableName = resolveTableName(def);
  console.log(`\n📦 [${def.label}] Ensuring table: ${tableName}`);

  if (await tableExists(tableName)) {
    console.log(`⚠️  [${def.label}] Table already exists, checking indexes...`);
    for (const index of def.indexes || []) {
      // On an existing table the index's key attributes must be declared.
      const attributes = {};
      attributes[index.hash] = def.attributes[index.hash];
      if (index.range) attributes[index.range] = def.attributes[index.range];
      await ensureGSI(tableName, { ...index, attributes });
    }
    return;
  }

  if (DRY_RUN) {
    const params = createTableParams(def);
    console.log(`🔎 [${def.label}] would create table ${tableName} with GSIs: ${(params.GlobalSecondaryIndexes || []).map((g) => g.IndexName).join(', ') || '(none)'}`);
    return;
  }

  try {
    await client.send(new CreateTableCommand(createTableParams(def)));
    console.log(`✅ [${def.label}] Table creation initiated`);
    await waitForTableActive(tableName);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [${def.label}] Table already exists (race condition)`);
    } else {
      console.error(`❌ [${def.label}] Failed to create table:`, error.message);
      throw error;
    }
  }
}

/**
 * Add the indexes this application needs to a table it does not own
 * (profiles, courses). The table itself is created elsewhere.
 */
async function ensureIndexesOnExistingTable(def) {
  const tableName = resolveTableName(def);
  console.log(`\n🔄 [${def.label}] Updating table: ${tableName}`);

  if (!(await tableExists(tableName))) {
    console.log(`⚠️  [${def.label}] Table does not exist yet, skipping index updates`);
    console.log(`   Note: create the ${def.label} table first, then re-run this script`);
    return;
  }

  for (const index of def.indexes) {
    await ensureGSI(tableName, index);
  }
}

// ==========================================
// Main Execution
// ==========================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   DynamoDB Setup - B2B/B2C Hybrid LMS Platform         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`Region: ${REGION}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // `key` must match STEP_KEYS in scripts/lib/setup-steps.mjs (verified offline by
  // scripts/verify-course-sessions-index.mjs).
  const allSteps = [
    { key: 'organizations', name: 'Organizations Table', fn: () => ensureTable(TABLES.organizations) },
    { key: 'orgUnits', name: 'Org Units Table', fn: () => ensureTable(TABLES.orgUnits) },
    { key: 'licenses', name: 'Licenses Table', fn: () => ensureTable(TABLES.licenses) },
    { key: 'enrollments', name: 'Enrollments Table', fn: () => ensureTable(TABLES.enrollments) },
    { key: 'courseSessions', name: 'Course Sessions Table', fn: () => ensureTable(TABLES.courseSessions) },
    { key: 'classSummaries', name: 'Class Summaries Table', fn: () => ensureTable(TABLES.classSummaries) },
    { key: 'planUpgrades', name: 'Plan Upgrades Table', fn: () => ensureTable(TABLES.planUpgrades) },
    { key: 'pointsEscrow', name: 'Points Escrow Table', fn: () => ensureTable(TABLES.pointsEscrow) },
    { key: 'pointTransactions', name: 'Point Transactions Table', fn: () => ensureTable(TABLES.pointTransactions) },
    { key: 'aiUsageLedger', name: 'AI Usage Ledger Table', fn: () => ensureTable(TABLES.aiUsageLedger) },
    { key: 'aiFeatureConfig', name: 'AI Feature Config Table', fn: () => ensureTable(TABLES.aiFeatureConfig) },
    { key: 'costRollups', name: 'Cost Rollups Table', fn: () => ensureTable(TABLES.costRollups) },
    { key: 'lessonEvents', name: 'Lesson Events Table', fn: () => ensureTable(TABLES.lessonEvents) },
    { key: 'lessonSegments', name: 'Lesson Segments Table', fn: () => ensureTable(TABLES.lessonSegments) },
    {
      key: 'profiles',
      name: 'Profiles Table Indexes',
      fn: () => ensureIndexesOnExistingTable(REQUIRED_INDEXES_ON_EXISTING_TABLES.profiles),
    },
    {
      key: 'courses',
      name: 'Courses Table Indexes',
      fn: () => ensureIndexesOnExistingTable(REQUIRED_INDEXES_ON_EXISTING_TABLES.courses),
    },
  ];

  const { selected: steps, skipped } = selectSteps(ONLY, allSteps);
  if (DRY_RUN) console.log('🔎 DRY RUN — no table or index will be created\n');
  if (ONLY) {
    console.log(`▶️  Running ${steps.length}/${allSteps.length} steps (--only=${ONLY.join(',')})`);
    console.log(`⏭️  Skipped: ${skipped.map((s) => s.name).join(', ') || '(none)'}\n`);
  }

  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  for (const step of steps) {
    try {
      await step.fn();
      successCount++;
    } catch (error) {
      failureCount++;
      errors.push({ step: step.name, error: error.message });
      console.error(`\n❌ [${step.name}] FAILED: ${error.message}\n`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    SETUP SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Successful steps: ${successCount}/${steps.length}`);
  console.log(`❌ Failed steps: ${failureCount}/${steps.length}\n`);

  if (errors.length > 0) {
    console.log('Errors encountered:');
    errors.forEach(({ step, error }) => {
      console.log(`  - ${step}: ${error}`);
    });
    console.log('');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('🔎 Dry run finished. Nothing was changed. Re-run without --dry-run to apply.\n');
    return;
  }

  console.log('🎉 All steps completed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Verify with: node scripts/verify-schema.mjs');
  console.log('  2. Set these in your .env.local if you use non-default names:');
  for (const def of Object.values(TABLES)) {
    console.log(`     ${def.envVar}=${resolveTableName(def)}`);
  }
  console.log('  3. Deploy your application\n');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
