#!/usr/bin/env node
/**
 * DynamoDB Setup Script for B2B/B2C Hybrid LMS Platform (JavaScript version)
 * 
 * Purpose: Initialize and update DynamoDB tables with proper idempotency
 * 
 * Usage:
 *   node scripts/setup-db.mjs
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

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });


// ==========================================
// Configuration
// ==========================================

const REGION = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

const ORGANIZATIONS_TABLE = process.env.DYNAMODB_TABLE_ORGANIZATIONS || 'jvtutorcorner-organizations';
const ORG_UNITS_TABLE = process.env.DYNAMODB_TABLE_ORG_UNITS || 'jvtutorcorner-org-units';
const LICENSES_TABLE = process.env.DYNAMODB_TABLE_LICENSES || 'jvtutorcorner-licenses';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const PLAN_UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';
const POINTS_ESCROW_TABLE = process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

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

// ==========================================
// Table Creation Functions
// ==========================================

async function createOrganizationsTable() {
  console.log(`\n📦 [Organizations] Creating table: ${ORGANIZATIONS_TABLE}`);

  if (await tableExists(ORGANIZATIONS_TABLE)) {
    console.log(`⚠️  [Organizations] Table already exists, skipping creation`);
    return;
  }

  const params = {
    TableName: ORGANIZATIONS_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'billingEmail', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'BillingEmailIndex',
        KeySchema: [{ AttributeName: 'billingEmail', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'StatusIndex',
        KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-Organizations' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [Organizations] Table creation initiated`);
    await waitForTableActive(ORGANIZATIONS_TABLE);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [Organizations] Table already exists (race condition)`);
    } else {
      console.error(`❌ [Organizations] Failed to create table:`, error.message);
      throw error;
    }
  }
}

async function createOrgUnitsTable() {
  console.log(`\n📦 [OrgUnits] Creating table: ${ORG_UNITS_TABLE}`);

  if (await tableExists(ORG_UNITS_TABLE)) {
    console.log(`⚠️  [OrgUnits] Table already exists, skipping creation`);
    return;
  }

  const params = {
    TableName: ORG_UNITS_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'orgId', AttributeType: 'S' },
      { AttributeName: 'parentId', AttributeType: 'S' },
      { AttributeName: 'path', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byOrgId',
        KeySchema: [
          { AttributeName: 'orgId', KeyType: 'HASH' },
          { AttributeName: 'path', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'byParentId',
        KeySchema: [{ AttributeName: 'parentId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-OrgUnits' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [OrgUnits] Table creation initiated`);
    await waitForTableActive(ORG_UNITS_TABLE);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [OrgUnits] Table already exists (race condition)`);
    } else {
      console.error(`❌ [OrgUnits] Failed to create table:`, error.message);
      throw error;
    }
  }
}

async function createLicensesTable() {
  console.log(`\n📦 [Licenses] Creating table: ${LICENSES_TABLE}`);

  if (await tableExists(LICENSES_TABLE)) {
    console.log(`⚠️  [Licenses] Table already exists, skipping creation`);
    return;
  }

  const params = {
    TableName: LICENSES_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'orgId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byOrgId',
        KeySchema: [
          { AttributeName: 'orgId', KeyType: 'HASH' },
          { AttributeName: 'status', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'byUserId',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'B2B-Licenses' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [Licenses] Table creation initiated`);
    await waitForTableActive(LICENSES_TABLE);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [Licenses] Table already exists (race condition)`);
    } else {
      console.error(`❌ [Licenses] Failed to create table:`, error.message);
      throw error;
    }
  }
}

async function updateProfilesTable() {
  console.log(`\n🔄 [Profiles] Updating table: ${PROFILES_TABLE}`);

  if (!(await tableExists(PROFILES_TABLE))) {
    console.log(`⚠️  [Profiles] Table does not exist yet, skipping GSI update`);
    console.log(`   Note: Create the Profiles table first, then re-run this script`);
    return;
  }

  const status = await getTableStatus(PROFILES_TABLE);
  if (status !== 'ACTIVE') {
    console.log(`⏳ [Profiles] Table is ${status}, waiting for ACTIVE state...`);
    await waitForTableActive(PROFILES_TABLE);
  }

  const indexName = 'byOrgId';
  if (await gsiExists(PROFILES_TABLE, indexName)) {
    console.log(`✅ [Profiles] GSI "${indexName}" already exists, no update needed`);
    return;
  }

  console.log(`📝 [Profiles] Adding GSI: ${indexName}`);

  const params = {
    TableName: PROFILES_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'orgId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexUpdates: [
      {
        Create: {
          IndexName: indexName,
          KeySchema: [{ AttributeName: 'orgId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      },
    ],
  };

  try {
    await client.send(new UpdateTableCommand(params));
    console.log(`✅ [Profiles] GSI creation initiated`);
    await waitForGSIActive(PROFILES_TABLE, indexName);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log(`⚠️  [Profiles] GSI already exists (race condition)`);
    } else if (error.message?.includes('ResourceInUseException')) {
      console.log(`⚠️  [Profiles] Table is being updated, GSI may already be creating`);
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

async function verifyCoursesTable() {
  console.log(`\n🔍 [Courses] Verifying table: ${COURSES_TABLE}`);

  if (await tableExists(COURSES_TABLE)) {
    console.log(`✅ [Courses] Table exists`);
    const status = await getTableStatus(COURSES_TABLE);
    console.log(`   Status: ${status}`);
  } else {
    console.log(`⚠️  [Courses] Table does not exist yet`);
    console.log(`   Note: This table should be created separately`);
  }
}

async function createPlanUpgradesTable() {
  console.log(`\n📦 [PlanUpgrades] Creating table: ${PLAN_UPGRADES_TABLE}`);

  if (await tableExists(PLAN_UPGRADES_TABLE)) {
    console.log(`⚠️  [PlanUpgrades] Table already exists, skipping creation`);
    return;
  }

  const params = {
    TableName: PLAN_UPGRADES_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'upgradeId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'upgradeId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byUserId',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'Plan-Upgrades' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [PlanUpgrades] Table creation initiated`);
    await waitForTableActive(PLAN_UPGRADES_TABLE);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [PlanUpgrades] Table already exists (race condition)`);
    } else {
      console.error(`❌ [PlanUpgrades] Failed to create table:`, error.message);
      throw error;
    }
  }
}


async function createPointsEscrowTable() {
  console.log(`\n📦 [PointsEscrow] Creating table: ${POINTS_ESCROW_TABLE}`);

  if (await tableExists(POINTS_ESCROW_TABLE)) {
    console.log(`⚠️  [PointsEscrow] Table already exists, skipping creation`);
    return;
  }

  const params = {
    TableName: POINTS_ESCROW_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'escrowId', AttributeType: 'S' },
      { AttributeName: 'orderId',  AttributeType: 'S' },
      { AttributeName: 'studentId', AttributeType: 'S' },
      { AttributeName: 'teacherId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'escrowId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byOrderId',
        KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'byStudentId',
        KeySchema: [{ AttributeName: 'studentId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'byTeacherId',
        KeySchema: [{ AttributeName: 'teacherId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    SSESpecification: { Enabled: true },
    Tags: [
      { Key: 'Project', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'Points-Escrow' },
    ],
  };

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ [PointsEscrow] Table creation initiated`);
    await waitForTableActive(POINTS_ESCROW_TABLE);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`⚠️  [PointsEscrow] Table already exists (race condition)`);
    } else {
      console.error(`❌ [PointsEscrow] Failed to create table:`, error.message);
      throw error;
    }
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

  const steps = [
    { name: 'Organizations Table', fn: createOrganizationsTable },
    { name: 'Org Units Table', fn: createOrgUnitsTable },
    { name: 'Licenses Table', fn: createLicensesTable },
    { name: 'Profiles Table Update', fn: updateProfilesTable },
    { name: 'Courses Table Verification', fn: verifyCoursesTable },
    { name: 'Plan Upgrades Table', fn: createPlanUpgradesTable },
    { name: 'Points Escrow Table', fn: createPointsEscrowTable },
  ];

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

  console.log('🎉 All steps completed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Verify tables in AWS Console');
  console.log('  2. Update environment variables in your .env.local:');
  console.log(`     DYNAMODB_TABLE_ORGANIZATIONS=${ORGANIZATIONS_TABLE}`);
  console.log(`     DYNAMODB_TABLE_ORG_UNITS=${ORG_UNITS_TABLE}`);
  console.log(`     DYNAMODB_TABLE_LICENSES=${LICENSES_TABLE}`);
  console.log(`     DYNAMODB_TABLE_POINTS_ESCROW=${POINTS_ESCROW_TABLE}`);
  console.log('  3. Deploy your application\n');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
