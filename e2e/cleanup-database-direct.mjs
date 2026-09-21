#!/usr/bin/env node
/**
 * cleanup-database-direct.mjs
 *
 * Standalone DynamoDB cleanup script — no browser, no Playwright required.
 * Deletes orphaned stress-test courses, orders, and enrollments directly via
 * the AWS SDK. Run this after stress tests or escalation tests to prevent
 * unbounded DynamoDB growth.
 *
 * Usage:
 *   node e2e/cleanup-database-direct.mjs
 *   node e2e/cleanup-database-direct.mjs --dry-run
 *
 * Env vars read from: .env.local (via dotenv)
 * Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (or CI_* variants)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const isDryRun = process.argv.includes('--dry-run');

// ── Load .env.local ────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const appEnv = process.env.APP_ENV || 'local';
loadEnvFile(resolve(projectRoot, `.env.${appEnv}`));
loadEnvFile(resolve(projectRoot, '.env.local'));

// ── DynamoDB client ────────────────────────────────────────────────────────────
const region = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';
const accessKeyId = process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;

if (!accessKeyId || !secretAccessKey) {
  console.error('[cleanup] ❌ AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  process.exit(1);
}

const client = new DynamoDBClient({
  region,
  credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) },
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const COURSES_TABLE     = process.env.DYNAMODB_TABLE_COURSES     || 'jvtutorcorner-courses';
const ORDERS_TABLE      = process.env.DYNAMODB_TABLE_ORDERS      || 'jvtutorcorner-orders';
const ENROLLMENTS_TABLE = process.env.ENROLLMENTS_TABLE || process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';
const ESCROW_TABLE      = process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

// ── Patterns that identify test-generated data ─────────────────────────────────
const TEST_COURSE_ID_PATTERNS = [
  'stress-group-',
  'sync-',
  'smoke-',
  'debug-',
  'net-',
  'test-course-',
];

const TEST_COURSE_TITLE_PATTERNS = [
  'stress-group-',
  'E2E 自動驗證課程-',
  'e2e',
  '自動驗證',
];

const TEST_USER_EMAILS = [
  'group-0-teacher@test.com',
  'group-1-teacher@test.com',
  'group-2-teacher@test.com',
  'group-3-teacher@test.com',
  'group-4-teacher@test.com',
  'group-5-teacher@test.com',
  'group-6-teacher@test.com',
  'group-7-teacher@test.com',
  'group-8-teacher@test.com',
  'group-9-teacher@test.com',
  'group-0-student@test.com',
  'group-1-student@test.com',
  'group-2-student@test.com',
  'group-3-student@test.com',
  'group-4-student@test.com',
  'group-5-student@test.com',
  'group-6-student@test.com',
  'group-7-student@test.com',
  'group-8-student@test.com',
  'group-9-student@test.com',
];

function isTestCourse(item) {
  const id = (item.id || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  return (
    TEST_COURSE_ID_PATTERNS.some(p => id.includes(p.toLowerCase())) ||
    TEST_COURSE_TITLE_PATTERNS.some(p => title.includes(p.toLowerCase()))
  );
}

async function scanAll(tableName, filterExpression, expressionAttributeValues, projectionExpression) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: tableName,
      ...(filterExpression ? { FilterExpression: filterExpression, ExpressionAttributeValues: expressionAttributeValues } : {}),
      ...(projectionExpression ? { ProjectionExpression: projectionExpression } : {}),
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    };
    const res = await ddb.send(new ScanCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function queryAll(tableName, indexName, keyCondition, expressionAttributeValues, projectionExpression) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(projectionExpression ? { ProjectionExpression: projectionExpression } : {}),
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    };
    const res = await ddb.send(new QueryCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function deleteItem(tableName, key) {
  if (isDryRun) return;
  await ddb.send(new DeleteCommand({ TableName: tableName, Key: key }));
}

// ── Main cleanup logic ─────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[cleanup] ${isDryRun ? '🔍 DRY RUN — no data will be deleted' : '🗑️  Starting DynamoDB cleanup'}`);
  console.log(`[cleanup] Region: ${region}`);
  console.log(`[cleanup] Tables: courses=${COURSES_TABLE}, orders=${ORDERS_TABLE}, enrollments=${ENROLLMENTS_TABLE}\n`);

  let deletedCourses = 0;
  let deletedOrders = 0;
  let deletedEnrollments = 0;
  let deletedEscrows = 0;

  // Step 1: Find and delete test courses
  console.log('[cleanup] Step 1: Scanning for test courses...');
  const allCourses = await scanAll(COURSES_TABLE);
  const testCourses = allCourses.filter(isTestCourse);
  console.log(`[cleanup]   Found ${testCourses.length} test course(s) out of ${allCourses.length} total`);

  for (const course of testCourses) {
    const courseId = course.id;
    console.log(`[cleanup]   Deleting course: "${course.title}" (${courseId})`);

    // Step 1a: Refund HOLDING escrows for this course before deleting
    try {
      const escrows = await scanAll(
        ESCROW_TABLE,
        'courseId = :cid AND #s = :holding',
        { ':cid': courseId, ':holding': 'HOLDING' },
        'escrowId'
      );
      for (const e of escrows) {
        // We can't call refundEscrow() here (TypeScript module), so just mark as REFUNDED
        // and return points via a direct update. For test data, simply deleting is acceptable
        // since test accounts don't hold real points.
        console.log(`[cleanup]     Deleting HOLDING escrow ${e.escrowId} (test data — no real points to refund)`);
        await deleteItem(ESCROW_TABLE, { escrowId: e.escrowId });
        deletedEscrows++;
      }
    } catch (e) {
      console.warn(`[cleanup]     Warning: escrow cleanup failed for course ${courseId}: ${e.message}`);
    }

    // Step 1b: Delete orders for this course
    try {
      const orders = await queryAll(
        ORDERS_TABLE,
        'CourseIdIndex',
        'courseId = :cid',
        { ':cid': courseId },
        'orderId'
      );
      for (const o of orders) {
        await deleteItem(ORDERS_TABLE, { orderId: o.orderId });
        deletedOrders++;
      }
    } catch (e) {
      console.warn(`[cleanup]     Warning: orders cleanup failed for course ${courseId}: ${e.message}`);
    }

    // Step 1c: Delete enrollments for this course
    try {
      const enrollments = await queryAll(
        ENROLLMENTS_TABLE,
        'CourseIdIndex',
        'courseId = :cid',
        { ':cid': courseId },
        'id'
      );
      for (const en of enrollments) {
        await deleteItem(ENROLLMENTS_TABLE, { id: en.id });
        deletedEnrollments++;
      }
    } catch (e) {
      console.warn(`[cleanup]     Warning: enrollments cleanup failed for course ${courseId}: ${e.message}`);
    }

    // Step 1d: Delete the course itself
    await deleteItem(COURSES_TABLE, { id: courseId });
    deletedCourses++;
  }

  // Step 2: Delete orphaned orders/enrollments for known test emails
  console.log('\n[cleanup] Step 2: Cleaning up orphaned records for test user emails...');
  for (const email of TEST_USER_EMAILS) {
    try {
      // Orders by userId (email)
      const orders = await queryAll(
        ORDERS_TABLE,
        'UserIdIndex',
        'userId = :uid',
        { ':uid': email },
        'orderId'
      );
      for (const o of orders) {
        await deleteItem(ORDERS_TABLE, { orderId: o.orderId });
        deletedOrders++;
      }

      // Enrollments by email (scan — no email GSI)
      const enrollments = await scanAll(
        ENROLLMENTS_TABLE,
        'email = :email',
        { ':email': email },
        'id'
      );
      for (const en of enrollments) {
        await deleteItem(ENROLLMENTS_TABLE, { id: en.id });
        deletedEnrollments++;
      }
    } catch (e) {
      console.warn(`[cleanup]   Warning: cleanup failed for ${email}: ${e.message}`);
    }
  }

  // Summary
  console.log('\n[cleanup] ✅ Cleanup complete:');
  console.log(`[cleanup]   Courses deleted    : ${deletedCourses}`);
  console.log(`[cleanup]   Orders deleted     : ${deletedOrders}`);
  console.log(`[cleanup]   Enrollments deleted: ${deletedEnrollments}`);
  console.log(`[cleanup]   Escrows deleted    : ${deletedEscrows}`);
  if (isDryRun) {
    console.log('[cleanup] (DRY RUN — no actual deletions were performed)');
  }
}

main().catch(err => {
  console.error('[cleanup] ❌ Fatal error:', err.message || err);
  process.exit(1);
});
