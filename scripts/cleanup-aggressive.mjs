#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const coursesTable = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const ordersTable = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const enrollmentsTable = process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';
const pointsEscrowTable = process.env.DYNAMODB_TABLE_POINTS_ESCROW || 'jvtutorcorner-points-escrow';

const client = new DynamoDBClient({ region });

// More aggressive patterns - catch anything suspicious
const testPatterns = [
  'stress-group-',
  'E2E',
  'stress',
  'sync-',
  'smoke-',
  'net-',
  'debug-',
  '自動驗證',
  'test-course-',
  'test_course_',
  'e2e-',
  'e2e_',
];

const testEmailPatterns = [
  '@test.com',
  'group-0-',
  'group-1-',
  'group-2-',
];

async function getAllCourses() {
  console.log(`\n📥 Fetching all courses from ${coursesTable}...`);
  
  const scanParams = {
    TableName: coursesTable,
    ProjectionExpression: 'id, #title, startTime, endTime, #status, createdAt',
    ExpressionAttributeNames: { 
      '#title': 'title',
      '#status': 'status'
    }
  };

  let allCourses = [];
  let lastEvaluatedKey = undefined;
  let scannedCount = 0;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const response = await client.send(new ScanCommand(scanParams));
      const courses = response.Items || [];
      allCourses = allCourses.concat(courses);
      scannedCount += courses.length;
      console.log(`   🔄 Scanned ${scannedCount} courses (current batch: ${courses.length})`);
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   ✅ Total courses found: ${allCourses.length}`);
    return allCourses;
  } catch (err) {
    console.error(`   ❌ Error scanning courses: ${err.message}`);
    return [];
  }
}

function isTestCourse(course) {
  const id = (course.id?.S || '').toLowerCase();
  const title = (course.title?.S || '').toLowerCase();
  
  return testPatterns.some(pattern => 
    id.includes(pattern.toLowerCase()) || title.includes(pattern.toLowerCase())
  );
}

function getTimeRange(course) {
  const startTime = course.startTime?.N || course.startTime?.S;
  const endTime = course.endTime?.N || course.endTime?.S;
  
  if (!startTime || !endTime) return null;
  
  const start = isNaN(startTime) ? new Date(startTime).getTime() : parseInt(startTime);
  const end = isNaN(endTime) ? new Date(endTime).getTime() : parseInt(endTime);
  
  return { start, end };
}

function hasTimeOverlap(course1, course2) {
  const range1 = getTimeRange(course1);
  const range2 = getTimeRange(course2);
  
  if (!range1 || !range2) return false;
  
  // Check if ranges overlap
  return !(range1.end <= range2.start || range2.end <= range1.start);
}

async function deleteTestCourses() {
  console.log(`\n🧹 [1/3] Deleting test courses from ${coursesTable}...`);
  
  const courses = await getAllCourses();
  if (courses.length === 0) {
    console.log(`   ⚠️ No courses found`);
    return 0;
  }

  let deletedCount = 0;
  
  // Strategy 1: Delete obvious test courses
  const testCourses = courses.filter(isTestCourse);
  console.log(`   🎯 Found ${testCourses.length} obvious test courses (pattern match)`);
  
  for (const course of testCourses) {
    const courseId = course.id?.S;
    if (!courseId) continue;
    
    try {
      await client.send(new DeleteItemCommand({
        TableName: coursesTable,
        Key: { id: { S: courseId } }
      }));
      
      const title = course.title?.S || '?';
      console.log(`   ✅ Deleted test course: ${title} (${courseId})`);
      deletedCount++;
    } catch (err) {
      console.warn(`   ⚠️ Error deleting ${courseId}: ${err.message}`);
    }
  }

  // Strategy 2: OLD LOGIC REMOVED
  // ⚠️ We no longer delete courses based on creation date alone
  // This was too dangerous as it could delete legitimate production data
  // To safely clean old test data, use cleanup-test-data.mjs instead

  console.log(`   📊 Total courses deleted: ${deletedCount}`);
  return deletedCount;
}

async function deleteTestOrders() {
  console.log(`\n🧹 [2/3] Deleting test orders from ${ordersTable}...`);
  
  const scanParams = {
    TableName: ordersTable,
    ProjectionExpression: 'orderId, courseId, userId, createdAt'
  };

  let allOrders = [];
  let lastEvaluatedKey = undefined;
  let scannedCount = 0;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const response = await client.send(new ScanCommand(scanParams));
      const orders = response.Items || [];
      allOrders = allOrders.concat(orders);
      scannedCount += orders.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total orders found: ${allOrders.length}`);

    const testOrders = allOrders.filter(order => {
      const courseId = (order.courseId?.S || '').toLowerCase();
      const userId = (order.userId?.S || '').toLowerCase();
      
      const isCourseTest = testPatterns.some(p => courseId.includes(p.toLowerCase()));
      const isUserTest = testEmailPatterns.some(p => userId.includes(p.toLowerCase()));
      
      return isCourseTest || isUserTest;
    });

    console.log(`   🎯 Found ${testOrders.length} test orders`);

    let deletedCount = 0;
    for (const order of testOrders) {
      const orderId = order.orderId?.S;
      if (!orderId) continue;
      
      try {
        await client.send(new DeleteItemCommand({
          TableName: ordersTable,
          Key: { orderId: { S: orderId } }
        }));
        
        console.log(`   ✅ Deleted order: ${orderId.slice(0, 20)}...`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting ${orderId}: ${err.message}`);
      }
    }

    console.log(`   📊 Total orders deleted: ${deletedCount}`);
    return deletedCount;
  } catch (err) {
    console.error(`   ❌ Error scanning orders: ${err.message}`);
    return 0;
  }
}

async function deleteTestEnrollments() {
  console.log(`\n🧹 [3/3] Deleting test enrollments from ${enrollmentsTable}...`);
  
  const scanParams = {
    TableName: enrollmentsTable,
    ProjectionExpression: 'enrollmentId, studentEmail, courseId'
  };

  let allEnrollments = [];
  let lastEvaluatedKey = undefined;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const response = await client.send(new ScanCommand(scanParams));
      const enrollments = response.Items || [];
      allEnrollments = allEnrollments.concat(enrollments);
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total enrollments found: ${allEnrollments.length}`);

    const testEnrollments = allEnrollments.filter(e => {
      const email = (e.studentEmail?.S || '').toLowerCase();
      const courseId = (e.courseId?.S || '').toLowerCase();
      
      const isEmailTest = testEmailPatterns.some(p => email.includes(p.toLowerCase()));
      const isCourseTest = testPatterns.some(p => courseId.includes(p.toLowerCase()));
      
      return isEmailTest || isCourseTest;
    });

    console.log(`   🎯 Found ${testEnrollments.length} test enrollments`);

    let deletedCount = 0;
    for (const enrollment of testEnrollments) {
      const enrollmentId = enrollment.enrollmentId?.S;
      if (!enrollmentId) continue;
      
      try {
        await client.send(new DeleteItemCommand({
          TableName: enrollmentsTable,
          Key: { enrollmentId: { S: enrollmentId } }
        }));
        
        console.log(`   ✅ Deleted enrollment: ${enrollmentId.slice(0, 20)}...`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting ${enrollmentId}: ${err.message}`);
      }
    }

    console.log(`   📊 Total enrollments deleted: ${deletedCount}`);
    return deletedCount;
  } catch (err) {
    console.error(`   ❌ Error scanning enrollments: ${err.message}`);
    return 0;
  }
}

async function deleteTestEscrows() {
  console.log(`\n🧹 [4/4] Deleting test escrows from ${pointsEscrowTable}...`);
  
  const scanParams = {
    TableName: pointsEscrowTable,
    ProjectionExpression: 'escrowId, courseId, createdAt'
  };

  let allEscrows = [];
  let lastEvaluatedKey = undefined;
  let scannedCount = 0;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const response = await client.send(new ScanCommand(scanParams));
      const escrows = response.Items || [];
      allEscrows = allEscrows.concat(escrows);
      scannedCount += escrows.length;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`   📋 Total escrows found: ${allEscrows.length}`);

    const testEscrows = allEscrows.filter(escrow => {
      const courseId = (escrow.courseId?.S || '').toLowerCase();
      return testPatterns.some(p => courseId.includes(p.toLowerCase()));
    });

    console.log(`   🎯 Found ${testEscrows.length} test escrows`);

    let deletedCount = 0;
    for (const escrow of testEscrows) {
      const escrowId = escrow.escrowId?.S;
      if (!escrowId) continue;
      
      try {
        await client.send(new DeleteItemCommand({
          TableName: pointsEscrowTable,
          Key: { escrowId: { S: escrowId } }
        }));
        
        console.log(`   ✅ Deleted escrow: ${escrowId.slice(0, 20)}...`);
        deletedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Error deleting ${escrowId}: ${err.message}`);
      }
    }

    console.log(`   📊 Total escrows deleted: ${deletedCount}`);
    return deletedCount;
  } catch (err) {
    console.error(`   ❌ Error scanning escrows: ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 AGGRESSIVE TEST DATA CLEANUP                      ║`);
  console.log(`║  Region: ${region.padEnd(42)} ║`);
  console.log(`║  Time: ${new Date().toISOString()} ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝`);

  try {
    const coursesDeleted = await deleteTestCourses();
    const ordersDeleted = await deleteTestOrders();
    const enrollmentsDeleted = await deleteTestEnrollments();
    const escrowsDeleted = await deleteTestEscrows();

    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║  ✅ CLEANUP SUMMARY                                  ║`);
    console.log(`║  • Courses deleted: ${coursesDeleted.toString().padEnd(30)} ║`);
    console.log(`║  • Orders deleted: ${ordersDeleted.toString().padEnd(31)} ║`);
    console.log(`║  • Enrollments deleted: ${enrollmentsDeleted.toString().padEnd(25)} ║`);
    console.log(`║  • Escrows deleted: ${escrowsDeleted.toString().padEnd(31)} ║`);
    console.log(`║  Total: ${(coursesDeleted + ordersDeleted + enrollmentsDeleted + escrowsDeleted).toString().padEnd(42)} ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Cleanup failed:`, err);
    process.exit(1);
  }
}

main();
