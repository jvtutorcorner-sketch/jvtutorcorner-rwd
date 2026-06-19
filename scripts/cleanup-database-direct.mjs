#!/usr/bin/env node
/**
 * ⚠️ DEPRECATED - DO NOT USE
 * 
 * This script has been deprecated and replaced by cleanup-test-data.mjs
 * 
 * Reasons for deprecation:
 * - Performs direct DynamoDB operations without environment protection
 * - No dry-run mode to preview changes before executing
 * - No user confirmation prompts
 * - High risk of accidentally deleting production data
 * 
 * MIGRATION GUIDE:
 * Instead, use: node cleanup-test-data.mjs
 * 
 * For more information, see the improved cleanup-test-data.mjs script
 */

console.error('❌ ERROR: cleanup-database-direct.mjs is DEPRECATED');
console.error('');
console.error('This script has been deprecated due to safety concerns.');
console.error('Please use the safer version instead:');
console.error('');
console.error('  node cleanup-test-data.mjs          # Preview mode (dry-run)');
console.error('  node cleanup-test-data.mjs --execute  # Execute with confirmation');
console.error('');
process.exit(1);

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

// Load env variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const coursesTable = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const teachersTable = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
const ordersTable = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const enrollmentsTable = process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';
const pointsEscrowTable = process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

const client = new DynamoDBClient({ region });

async function deleteTestCoursesFromDB() {
  console.log(`\n🎯 Deleting test courses directly from DynamoDB...`);
  console.log(`   📊 Table: ${coursesTable}`);
  
  const testPatterns = ['stress-group-', 'E2E 自動驗證課程-', 'E2E', 'stress'];
  let deletedCount = 0;
  let scannedCount = 0;

  try {
    // Scan all courses
    const scanParams = {
      TableName: coursesTable,
      ProjectionExpression: 'id, #title',
      ExpressionAttributeNames: { '#title': 'title' }
    };

    let allCourses = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      console.log(`   🔍 Scanning courses... (scanned: ${scannedCount})`);
      const response = await client.send(new ScanCommand(scanParams));
      
      const courses = response.Items || [];
      allCourses = allCourses.concat(courses);
      scannedCount += courses.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);

    console.log(`   📋 Total courses in table: ${allCourses.length}`);

    // Filter test courses
    const testCourses = allCourses.filter(course => {
      const id = (course.id?.S || '').toLowerCase();
      const title = (course.title?.S || '').toLowerCase();
      return testPatterns.some(pattern => 
        id.includes(pattern.toLowerCase()) || title.includes(pattern.toLowerCase())
      );
    });

    console.log(`   🎯 Test courses found: ${testCourses.length}`);

    // Delete test courses
    for (const course of testCourses) {
      const courseId = course.id.S;
      const courseTitle = course.title?.S || 'Unknown';
      
      try {
        await client.send(new DeleteItemCommand({
          TableName: coursesTable,
          Key: { id: { S: courseId } }
        }));
        
        console.log(`   ✅ Deleted: "${courseTitle}" (${courseId})`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting ${courseId}: ${err.message}`);
      }
    }

  } catch (err) {
    console.warn(`   ⚠️ Error scanning table: ${err.message}`);
  }

  console.log(`   📊 Total courses deleted from DB: ${deletedCount}`);
}

async function deleteTestOrdersFromDB() {
  console.log(`\n🎯 Deleting test orders directly from DynamoDB...`);
  console.log(`   📊 Table: ${ordersTable}`);

  // Match courseId patterns used by stress / enrollment tests
  const testPatterns = ['stress-group-', 'E2E', 'stress', 'sync-', 'smoke-', 'net-', 'debug-'];
  const testEmailPatterns = ['@test.com', '@example.com', 'group-'];
  let deletedCount = 0;
  let scannedCount = 0;

  try {
    const scanParams = {
      TableName: ordersTable,
      ProjectionExpression: 'orderId, courseId, #uid',
      ExpressionAttributeNames: { '#uid': 'userId' }
    };

    let allOrders = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      console.log(`   🔍 Scanning orders... (scanned: ${scannedCount})`);
      const response = await client.send(new ScanCommand(scanParams));
      const items = response.Items || [];
      allOrders = allOrders.concat(items);
      scannedCount += items.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total orders in table: ${allOrders.length}`);

    const testOrders = allOrders.filter(order => {
      const courseId = (order.courseId?.S || '').toLowerCase();
      const userId = (order.userId?.S || order['#uid']?.S || '').toLowerCase();
      return (
        testPatterns.some(p => courseId.includes(p.toLowerCase())) ||
        testEmailPatterns.some(p => userId.includes(p.toLowerCase()))
      );
    });

    console.log(`   🎯 Test orders found: ${testOrders.length}`);

    for (const order of testOrders) {
      const orderId = order.orderId?.S;
      if (!orderId) continue;
      try {
        await client.send(new DeleteItemCommand({
          TableName: ordersTable,
          Key: { orderId: { S: orderId } }
        }));
        console.log(`   ✅ Deleted order: ${orderId} (courseId: ${order.courseId?.S || '?'})`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting order ${orderId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Error scanning orders table: ${err.message}`);
  }

  console.log(`   📊 Total orders deleted from DB: ${deletedCount}`);
}

async function deleteTestEnrollmentsFromDB() {
  console.log(`\n🎯 Deleting test enrollments directly from DynamoDB...`);
  console.log(`   📊 Table: ${enrollmentsTable}`);

  const testPatterns = ['stress-group-', 'E2E', 'stress', 'sync-', 'smoke-', 'net-', 'debug-'];
  const testEmailPatterns = ['@test.com', '@example.com', 'group-'];
  let deletedCount = 0;
  let scannedCount = 0;

  try {
    const scanParams = {
      TableName: enrollmentsTable,
      ProjectionExpression: 'id, courseId, #em',
      ExpressionAttributeNames: { '#em': 'email' }
    };

    let allEnrollments = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      console.log(`   🔍 Scanning enrollments... (scanned: ${scannedCount})`);
      const response = await client.send(new ScanCommand(scanParams));
      const items = response.Items || [];
      allEnrollments = allEnrollments.concat(items);
      scannedCount += items.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total enrollments in table: ${allEnrollments.length}`);

    const testEnrollments = allEnrollments.filter(enrollment => {
      const courseId = (enrollment.courseId?.S || '').toLowerCase();
      const email = (enrollment.email?.S || enrollment['#em']?.S || '').toLowerCase();
      return (
        testPatterns.some(p => courseId.includes(p.toLowerCase())) ||
        testEmailPatterns.some(p => email.includes(p.toLowerCase()))
      );
    });

    console.log(`   🎯 Test enrollments found: ${testEnrollments.length}`);

    for (const enrollment of testEnrollments) {
      const enrollmentId = enrollment.id?.S;
      if (!enrollmentId) continue;
      try {
        await client.send(new DeleteItemCommand({
          TableName: enrollmentsTable,
          Key: { id: { S: enrollmentId } }
        }));
        console.log(`   ✅ Deleted enrollment: ${enrollmentId} (courseId: ${enrollment.courseId?.S || '?'})`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting enrollment ${enrollmentId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Error scanning enrollments table: ${err.message}`);
  }

  console.log(`   📊 Total enrollments deleted from DB: ${deletedCount}`);
}

async function deleteTestProfilesFromDB() {
  console.log(`\n🎯 Deleting test profiles/teachers directly from DynamoDB...`);
  
  const profilesTable = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
  const testPatterns = ['testuser_', 'teacher_', 'group-', '@example.com', '@test.com'];
  let deletedCount = 0;
  let scannedCount = 0;

  try {
    const scanParams = {
      TableName: profilesTable,
      ProjectionExpression: 'id, #email',
      ExpressionAttributeNames: { '#email': 'email' }
    };

    let allProfiles = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      console.log(`   🔍 Scanning profiles... (scanned: ${scannedCount})`);
      const response = await client.send(new ScanCommand(scanParams));
      
      const profiles = response.Items || [];
      allProfiles = allProfiles.concat(profiles);
      scannedCount += profiles.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);

    console.log(`   📋 Total profiles in table: ${allProfiles.length}`);

    // Filter test profiles
    const testProfiles = allProfiles.filter(profile => {
      const email = (profile['#email']?.S || profile.email?.S || '').toLowerCase();
      return testPatterns.some(pattern => email.includes(pattern.toLowerCase()));
    });

    console.log(`   🎯 Test profiles found: ${testProfiles.length}`);

    // Delete test profiles
    for (const profile of testProfiles) {
      const profileId = profile.id.S;
      const email = profile['#email']?.S || profile.email?.S || 'Unknown';
      
      try {
        await client.send(new DeleteItemCommand({
          TableName: profilesTable,
          Key: { id: { S: profileId } }
        }));
        
        console.log(`   ✅ Deleted: ${email} (${profileId})`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting ${profileId}: ${err.message}`);
      }
    }

  } catch (err) {
    console.warn(`   ⚠️ Error scanning profiles: ${err.message}`);
  }

  console.log(`   📊 Total profiles deleted from DB: ${deletedCount}`);
}

async function deleteTestEscrowsFromDB() {
  console.log(`\n🎯 Deleting test escrows directly from DynamoDB...`);
  console.log(`   📊 Table: ${pointsEscrowTable}`);

  // Match courseId patterns used by stress / enrollment tests
  const testPatterns = ['stress-group-', 'E2E', 'stress', 'sync-', 'smoke-', 'net-', 'debug-'];
  let deletedCount = 0;
  let scannedCount = 0;

  try {
    const scanParams = {
      TableName: pointsEscrowTable,
      ProjectionExpression: 'escrowId, courseId, orderId'
    };

    let allEscrows = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      console.log(`   🔍 Scanning escrows... (scanned: ${scannedCount})`);
      const response = await client.send(new ScanCommand(scanParams));
      const items = response.Items || [];
      allEscrows = allEscrows.concat(items);
      scannedCount += items.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total escrows in table: ${allEscrows.length}`);

    const testEscrows = allEscrows.filter(escrow => {
      const courseId = (escrow.courseId?.S || '').toLowerCase();
      return testPatterns.some(p => courseId.includes(p.toLowerCase()));
    });

    console.log(`   🎯 Test escrows found: ${testEscrows.length}`);

    for (const escrow of testEscrows) {
      const escrowId = escrow.escrowId?.S;
      if (!escrowId) continue;
      try {
        await client.send(new DeleteItemCommand({
          TableName: pointsEscrowTable,
          Key: { escrowId: { S: escrowId } }
        }));
        console.log(`   ✅ Deleted escrow: ${escrowId} (courseId: ${escrow.courseId?.S || '?'})`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting escrow ${escrowId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Error scanning escrows table: ${err.message}`);
  }

  console.log(`   📊 Total escrows deleted from DB: ${deletedCount}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧹 DIRECT DATABASE CLEANUP (DynamoDB)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Region: ${region}`);
  console.log('');

  try {
    await deleteTestCoursesFromDB();
    await deleteTestOrdersFromDB();
    await deleteTestEnrollmentsFromDB();
    await deleteTestEscrowsFromDB();
    await deleteTestProfilesFromDB();

    console.log('\n✅ Direct database cleanup completed successfully');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error(`\n❌ Cleanup failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
