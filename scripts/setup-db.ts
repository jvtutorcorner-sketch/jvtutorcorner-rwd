#!/usr/bin/env ts-node
/**
 * DynamoDB Setup Script for B2B/B2C Hybrid LMS Platform
 * 
 * Purpose: Initialize and update DynamoDB tables with proper idempotency
 * 
 * Tables Created:
 * - jvtutorcorner-organizations (B2B companies)
 * - jvtutorcorner-org-units (Hierarchical departments)
 * - jvtutorcorner-licenses (B2B seats/contracts)
 * 
 * Tables Updated:
 * - jvtutorcorner-profiles (add byOrgId GSI)
 * - jvtutorcorner-courses (verify existence)
 * 
 * Usage:
 *   ts-node scripts/setup-db.ts
 *   # or compile first:
 *   npx tsc scripts/setup-db.ts && node scripts/setup-db.js
 * 
 * Environment Variables:
 *   AWS_REGION - AWS region (default: ap-northeast-1)
 *   AWS_ACCESS_KEY_ID - For local dev only (DO NOT set in production)
 *   AWS_SECRET_ACCESS_KEY - For local dev only (DO NOT set in production)
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  ListTablesCommand,
  ResourceNotFoundException,
  ResourceInUseException,
  TableStatus,
  BillingMode,
  KeyType,
  ScalarAttributeType,
  ProjectionType,
} from '@aws-sdk/client-dynamodb';

import type {
  GlobalSecondaryIndex,
  AttributeDefinition,
  CreateTableCommandInput,
  UpdateTableCommandInput,
} from '@aws-sdk/client-dynamodb';



// ==========================================
// Configuration
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

// Table names (allow override via env)
const ORGANIZATIONS_TABLE = process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations';
const ORG_UNITS_TABLE = process.env.DYNAMODB_TABLE_ORG_UNITS || 'jvtutorcorner-org-units';
const LICENSES_TABLE = process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const PLAN_UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';

// ==========================================
// DynamoDB Client Setup (Clean IAM Pattern)
// ==========================================

/**
 * Create DynamoDB client with automatic credential chain
 * - Local dev: Uses AWS_ACCESS_KEY_ID from .env
 * - Production: Uses IAM role automatically
 */
function createDynamoDBClient(): DynamoDBClient {
  const clientConfig: any = { region: REGION };

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

/**
 * Sleep utility for waiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

/**
 * Get table status
 */
async function getTableStatus(tableName: string): Promise<TableStatus | null> {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return response.Table?.TableStatus || null;
  } catch (error: any) {
    if (error instanceof ResourceNotFoundException) {
      return null;
    }
    throw error;
  }
}

/**
 * Wait for table to become ACTIVE
 */
async function waitForTableActive(tableName: string, maxWaitSeconds: number = 120): Promise<void> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  console.log(`⏳ [${tableName}] Waiting for table to become ACTIVE...`);

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getTableStatus(tableName);

    if (status === TableStatus.ACTIVE) {
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

/**
 * Check if GSI exists on table
 */
async function gsiExists(tableName: string, indexName: string): Promise<boolean> {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const gsis = response.Table?.GlobalSecondaryIndexes || [];
    return gsis.some(gsi => gsi.IndexName === indexName);
  } catch (error: any) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

/**
 * Get GSI status
 */
async function getGSIStatus(tableName: string, indexName: string): Promise<string | null> {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const gsis = response.Table?.GlobalSecondaryIndexes || [];
    const gsi = gsis.find(g => g.IndexName === indexName);
    return gsi?.IndexStatus || null;
  } catch {
    return null;
  }
}

/**
 * Wait for GSI to become ACTIVE
 */
async function waitForGSIActive(tableName: string, indexName: string, maxWaitSeconds: number = 300): Promise<void> {
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

// ==========================================
// Table Creation Functions
// ==========================================

/**
 * Create Organizations table
 */
async function createOrganizationsTable(): Promise<void> {
  console.log(`\n📦 [Organizations] Creating table: ${ORGANIZATIONS_TABLE}`);

  if (await tableExists(ORGANIZATIONS_TABLE)) {
    console.log(`⚠️  [Organizations] Table already exists, skipping creation`);
    return;
  }

  const params: CreateTableCommandInput = {
    TableName: ORGANIZATIONS_TABLE,
    BillingMode: BillingMode.PAY_PER_REQUEST,
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'billingEmail', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'status', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: KeyType.HASH },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'BillingEmailIndex',
        KeySchema: [
          { AttributeName: 'billingEmail', KeyType: KeyType.HASH },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: KeyType.HASH },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: {
      Enabled: true,
    },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-Organizations' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [Organizations] Table creation initiated`);
    await waitForTableActive(ORGANIZATIONS_TABLE);
  } catch (error: any) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [Organizations] Table already exists (race condition)`);
    } else {
      console.error(`❌ [Organizations] Failed to create table:`, error.message);
      throw error;
    }
  }
}

/**
 * Create Org Units table (with hierarchical structure)
 */
async function createOrgUnitsTable(): Promise<void> {
  console.log(`\n📦 [OrgUnits] Creating table: ${ORG_UNITS_TABLE}`);

  if (await tableExists(ORG_UNITS_TABLE)) {
    console.log(`⚠️  [OrgUnits] Table already exists, skipping creation`);
    return;
  }

  const params: CreateTableCommandInput = {
    TableName: ORG_UNITS_TABLE,
    BillingMode: BillingMode.PAY_PER_REQUEST,
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'orgId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'parentId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'path', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: KeyType.HASH },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byOrgId',
        KeySchema: [
          { AttributeName: 'orgId', KeyType: KeyType.HASH },
          { AttributeName: 'path', KeyType: KeyType.RANGE },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
      {
        IndexName: 'byParentId',
        KeySchema: [
          { AttributeName: 'parentId', KeyType: KeyType.HASH },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: {
      Enabled: true,
    },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-OrgUnits' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [OrgUnits] Table creation initiated`);
    await waitForTableActive(ORG_UNITS_TABLE);
  } catch (error: any) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [OrgUnits] Table already exists (race condition)`);
    } else {
      console.error(`❌ [OrgUnits] Failed to create table:`, error.message);
      throw error;
    }
  }
}

/**
 * Create Licenses table
 */
async function createLicensesTable(): Promise<void> {
  console.log(`\n📦 [Licenses] Creating table: ${LICENSES_TABLE}`);

  if (await tableExists(LICENSES_TABLE)) {
    console.log(`⚠️  [Licenses] Table already exists, skipping creation`);
    return;
  }

  const params: CreateTableCommandInput = {
    TableName: LICENSES_TABLE,
    BillingMode: BillingMode.PAY_PER_REQUEST,
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'orgId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'status', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: KeyType.HASH },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byOrgId',
        KeySchema: [
          { AttributeName: 'orgId', KeyType: KeyType.HASH },
          { AttributeName: 'status', KeyType: KeyType.RANGE },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
      {
        IndexName: 'byUserId',
        KeySchema: [
          { AttributeName: 'userId', KeyType: KeyType.HASH },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: {
      Enabled: true,
    },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-Licenses' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [Licenses] Table creation initiated`);
    await waitForTableActive(LICENSES_TABLE);
  } catch (error: any) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [Licenses] Table already exists (race condition)`);
    } else {
      console.error(`❌ [Licenses] Failed to create table:`, error.message);
      throw error;
    }
  }
}

/**
 * Update Profiles table (add byOrgId GSI if missing)
 */
async function updateProfilesTable(): Promise<void> {
  console.log(`\n🔄 [Profiles] Updating table: ${PROFILES_TABLE}`);

  // Check if table exists
  if (!(await tableExists(PROFILES_TABLE))) {
    console.log(`⚠️  [Profiles] Table does not exist yet, skipping GSI update`);
    console.log(`   Note: Create the Profiles table first, then re-run this script`);
    return;
  }

  // Wait for table to be active
  const status = await getTableStatus(PROFILES_TABLE);
  if (status !== TableStatus.ACTIVE) {
    console.log(`⏳ [Profiles] Table is ${status}, waiting for ACTIVE state...`);
    await waitForTableActive(PROFILES_TABLE);
  }

  // Check if byOrgId GSI already exists
  const indexName = 'byOrgId';
  if (await gsiExists(PROFILES_TABLE, indexName)) {
    console.log(`✅ [Profiles] GSI "${indexName}" already exists, no update needed`);
    return;
  }

  console.log(`📝 [Profiles] Adding GSI: ${indexName}`);

  const params: UpdateTableCommandInput = {
    TableName: PROFILES_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'orgId', AttributeType: ScalarAttributeType.S },
    ],
    GlobalSecondaryIndexUpdates: [
      {
        Create: {
          IndexName: indexName,
          KeySchema: [
            { AttributeName: 'orgId', KeyType: KeyType.HASH },
          ],
          Projection: { ProjectionType: ProjectionType.ALL },
        },
      },
    ],
  };

  try {
    await client.send(new UpdateTableCommand(params));
    console.log(`✅ [Profiles] GSI creation initiated`);
    await waitForGSIActive(PROFILES_TABLE, indexName);
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log(`⚠️  [Profiles] GSI already exists (race condition)`);
    } else if (error.message?.includes('ResourceInUseException')) {
      console.log(`⚠️  [Profiles] Table is being updated, GSI may already be creating`);
      // Try to wait for it anyway
      try {
        await waitForGSIActive(PROFILES_TABLE, indexName);
      } catch {
        console.log(`   [Profiles] Could not verify GSI status, please check manually`);
      }
    } else {
      console.error(`❌ [Profiles] Failed to add GSI:`, error.message);
      throw error;
    }
  }
}

/**
 * Verify Courses table exists
 */
async function verifyCoursesTable(): Promise<void> {
  console.log(`\n🔍 [Courses] Verifying table: ${COURSES_TABLE}`);

  if (await tableExists(COURSES_TABLE)) {
    console.log(`✅ [Courses] Table exists`);
    const status = await getTableStatus(COURSES_TABLE);
    console.log(`   Status: ${status}`);
  } else {
    console.log(`⚠️  [Courses] Table does not exist yet`);
    console.log(`   Note: This table should be created separately via your existing CloudFormation/scripts`);
  }
}

/**
 * Create Plan Upgrades table
 */
async function createPlanUpgradesTable(): Promise<void> {
  console.log(`\n📦 [PlanUpgrades] Creating table: ${PLAN_UPGRADES_TABLE}`);

  if (await tableExists(PLAN_UPGRADES_TABLE)) {
    console.log(`⚠️  [PlanUpgrades] Table already exists, skipping creation`);
    return;
  }

  const params: CreateTableCommandInput = {
    TableName: PLAN_UPGRADES_TABLE,
    BillingMode: BillingMode.PAY_PER_REQUEST,
    AttributeDefinitions: [
      { AttributeName: 'upgradeId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'upgradeId', KeyType: KeyType.HASH },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byUserId',
        KeySchema: [
          { AttributeName: 'userId', KeyType: KeyType.HASH },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
    SSESpecification: {
      Enabled: true,
    },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'Plan-Upgrades' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [PlanUpgrades] Table creation initiated`);
    await waitForTableActive(PLAN_UPGRADES_TABLE);
  } catch (error: any) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [PlanUpgrades] Table already exists (race condition)`);
    } else {
      console.error(`❌ [PlanUpgrades] Failed to create table:`, error.message);
      throw error;
    }
  }
}


// ==========================================
// Main Execution
// ==========================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   DynamoDB Setup - B2B/B2C Hybrid LMS Platform         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`Region: ${REGION}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const steps = [
    { name: 'Organizations Table', fn: createOrganizationsTable },
    { name: 'Org Units Table', fn: createOrgUnitsTable },
    { name: 'Licenses Table', fn: createLicensesTable },
    { name: 'Profiles Table Update', fn: updateProfilesTable },
    { name: 'Courses Table Verification', fn: verifyCoursesTable },
    { name: 'Plan Upgrades Table', fn: createPlanUpgradesTable },
  ];

  let successCount = 0;
  let failureCount = 0;
  const errors: Array<{ step: string; error: string }> = [];

  for (const step of steps) {
    try {
      await step.fn();
      successCount++;
    } catch (error: any) {
      failureCount++;
      errors.push({ step: step.name, error: error.message });
      console.error(`\n❌ [${step.name}] FAILED: ${error.message}\n`);
    }
  }

  // Summary
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

  console.log('🎉 All steps completed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Verify tables in AWS Console');
  console.log('  2. Update environment variables in your .env.local:');
  console.log(`     DYNAMODB_TABLE_ORGANIZATIONS=${ORGANIZATIONS_TABLE}`);
  console.log(`     DYNAMODB_TABLE_ORG_UNITS=${ORG_UNITS_TABLE}`);
  console.log(`     DYNAMODB_TABLE_LICENSES=${LICENSES_TABLE}`);
  console.log('  3. Deploy your application\n');
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
