#!/usr/bin/env node
/**
 * Cleanup Test Data Script (SAFE MODE)
 * 
 * 安全的測試資料清理工具，支援：
 * - 環境防護檢查（禁止在 Production 執行）
 * - Dry-run 模式（預覽要刪除的資料但不實際刪除）
 * - 互動式確認提示
 * - 精確的測試資料比對
 * 
 * 使用方法:
 * node cleanup-test-data.mjs                  # Dry-run 模式（預覽）
 * node cleanup-test-data.mjs --execute        # 執行實際刪除
 * node cleanup-test-data.mjs --execute --force  # 跳過確認提示（不建議）
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入環境變數
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// ═══════════════════════════════════════════════════════
// 配置與環境檢查
// ═══════════════════════════════════════════════════════

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const region = process.env.AWS_REGION || 'ap-northeast-1';
const coursesTable = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const ordersTable = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const enrollmentsTable = process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';

const isDryRun = !process.argv.includes('--execute');
const isForce = process.argv.includes('--force');

// 測試資料比對規則（前綴匹配更精確）
const TEST_PATTERNS = {
  courseId: ['test-', 'stress-', 'e2e-', 'sync-', 'smoke-', 'debug-', 'net-'],
  courseTitle: ['E2E', 'E2e', '自動驗證'],
  email: ['@test.com', '@example.com'],
};

const client = new DynamoDBClient({ region });

// ═══════════════════════════════════════════════════════
// 環境檢查（禁止在 Production 執行）
// ═══════════════════════════════════════════════════════

function checkEnvironmentSafety() {
  console.log('\n🔒 Checking environment safety...');
  
  const isProdUrl = baseUrl.includes('prod') || 
                    baseUrl.includes('production') ||
                    baseUrl.includes('jvtutorcorner.com') ||
                    (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1'));
  
  const isProdTable = coursesTable.includes('prod') || 
                      ordersTable.includes('prod');
  
  if (isProdUrl || isProdTable) {
    console.error('\n❌ DANGER: PRODUCTION ENVIRONMENT DETECTED!');
    console.error(`   Base URL: ${baseUrl}`);
    console.error(`   Courses Table: ${coursesTable}`);
    console.error(`   Orders Table: ${ordersTable}`);
    console.error('\n⛔ Cleanup script will NOT run against production databases.');
    console.error('   To prevent accidental data loss, this script only works with local/staging environments.\n');
    process.exit(1);
  }

  console.log(`   ✅ Environment verified as safe (dev/staging)`);
  console.log(`      Base URL: ${baseUrl}`);
  console.log(`      Region: ${region}`);
}

// ═══════════════════════════════════════════════════════
// 比對邏輯（精確測試資料識別）
// ═══════════════════════════════════════════════════════

function isTestCourseId(id) {
  if (!id) return false;
  const idLower = id.toLowerCase();
  return TEST_PATTERNS.courseId.some(pattern => idLower.startsWith(pattern));
}

function isTestCourseTitle(title) {
  if (!title) return false;
  const titleLower = title.toLowerCase();
  return TEST_PATTERNS.courseTitle.some(pattern => titleLower.includes(pattern));
}

function isTestEmail(email) {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  return TEST_PATTERNS.email.some(pattern => emailLower.includes(pattern));
}

function isTestCourse(course) {
  const id = course.id?.S || '';
  const title = course.title?.S || '';
  return isTestCourseId(id) || isTestCourseTitle(title);
}

function isTestOrder(order) {
  const courseId = order.courseId?.S || '';
  const userId = order.userId?.S || '';
  return isTestCourseId(courseId) || isTestEmail(userId);
}

function isTestEnrollment(enrollment) {
  const courseId = enrollment.courseId?.S || '';
  const email = enrollment.studentEmail?.S || enrollment.email?.S || '';
  return isTestCourseId(courseId) || isTestEmail(email);
}

// ═══════════════════════════════════════════════════════
// 互動式確認
// ═══════════════════════════════════════════════════════

async function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ═══════════════════════════════════════════════════════
// 掃描與刪除邏輯
// ═══════════════════════════════════════════════════════

async function scanTable(tableName, projectionExpression, expressionNames = {}) {
  const scanParams = {
    TableName: tableName,
    ProjectionExpression: projectionExpression,
    ...(Object.keys(expressionNames).length > 0 && { ExpressionAttributeNames: expressionNames })
  };

  let items = [];
  let lastEvaluatedKey = undefined;

  try {
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const response = await client.send(new ScanCommand(scanParams));
      items = items.concat(response.Items || []);
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (err) {
    console.error(`   ❌ Error scanning ${tableName}: ${err.message}`);
  }

  return items;
}

async function cleanupCourses() {
  console.log(`\n📚 [1/3] Scanning courses table: ${coursesTable}`);
  
  const courses = await scanTable(
    coursesTable,
    'id, #title',
    { '#title': 'title' }
  );

  console.log(`   📋 Total courses found: ${courses.length}`);

  const testCourses = courses.filter(isTestCourse);
  console.log(`   🎯 Test courses identified: ${testCourses.length}`);

  if (testCourses.length === 0) {
    console.log(`   ℹ️  No test courses to clean up.`);
    return 0;
  }

  // 顯示要刪除的課程
  console.log(`\n   📋 Test courses to be deleted:`);
  for (const course of testCourses.slice(0, 10)) {
    const id = course.id?.S || '?';
    const title = course.title?.S || '?';
    console.log(`      • ${title} (${id})`);
  }
  if (testCourses.length > 10) {
    console.log(`      ... and ${testCourses.length - 10} more`);
  }

  if (isDryRun) {
    console.log(`\n   ℹ️  DRY-RUN MODE: No courses will be deleted. Use --execute to actually delete.`);
    return testCourses.length;
  }

  // 要求確認
  if (!isForce) {
    const confirmed = await askConfirmation(`\n   ⚠️  Are you sure you want to delete ${testCourses.length} test courses? (yes/no): `);
    if (!confirmed) {
      console.log(`   ❌ Deletion cancelled by user.`);
      return 0;
    }
  }

  let deletedCount = 0;
  for (const course of testCourses) {
    const courseId = course.id?.S;
    if (!courseId) continue;

    try {
      await client.send(new DeleteItemCommand({
        TableName: coursesTable,
        Key: { id: { S: courseId } }
      }));
      
      const title = course.title?.S || '?';
      console.log(`   ✅ Deleted: "${title}" (${courseId})`);
      deletedCount++;
    } catch (err) {
      console.warn(`   ⚠️  Error deleting ${courseId}: ${err.message}`);
    }
  }

  console.log(`   📊 Total courses deleted: ${deletedCount}/${testCourses.length}`);
  return deletedCount;
}

async function cleanupOrders() {
  console.log(`\n🛒 [2/3] Scanning orders table: ${ordersTable}`);
  
  const orders = await scanTable(
    ordersTable,
    'orderId, courseId, userId',
    {}
  );

  console.log(`   📋 Total orders found: ${orders.length}`);

  const testOrders = orders.filter(isTestOrder);
  console.log(`   🎯 Test orders identified: ${testOrders.length}`);

  if (testOrders.length === 0) {
    console.log(`   ℹ️  No test orders to clean up.`);
    return 0;
  }

  // 顯示要刪除的訂單
  console.log(`\n   📋 Test orders to be deleted:`);
  for (const order of testOrders.slice(0, 10)) {
    const orderId = order.orderId?.S || '?';
    const courseId = order.courseId?.S || '?';
    console.log(`      • Order ${orderId.slice(0, 16)}... (Course: ${courseId})`);
  }
  if (testOrders.length > 10) {
    console.log(`      ... and ${testOrders.length - 10} more`);
  }

  if (isDryRun) {
    console.log(`\n   ℹ️  DRY-RUN MODE: No orders will be deleted. Use --execute to actually delete.`);
    return testOrders.length;
  }

  // 要求確認
  if (!isForce) {
    const confirmed = await askConfirmation(`\n   ⚠️  Are you sure you want to delete ${testOrders.length} test orders? (yes/no): `);
    if (!confirmed) {
      console.log(`   ❌ Deletion cancelled by user.`);
      return 0;
    }
  }

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
      console.warn(`   ⚠️  Error deleting ${orderId}: ${err.message}`);
    }
  }

  console.log(`   📊 Total orders deleted: ${deletedCount}/${testOrders.length}`);
  return deletedCount;
}

async function cleanupEnrollments() {
  console.log(`\n📝 [3/3] Scanning enrollments table: ${enrollmentsTable}`);
  
  const enrollments = await scanTable(
    enrollmentsTable,
    'id, courseId, studentEmail',
    {}
  );

  console.log(`   📋 Total enrollments found: ${enrollments.length}`);

  const testEnrollments = enrollments.filter(isTestEnrollment);
  console.log(`   🎯 Test enrollments identified: ${testEnrollments.length}`);

  if (testEnrollments.length === 0) {
    console.log(`   ℹ️  No test enrollments to clean up.`);
    return 0;
  }

  // 顯示要刪除的報名記錄
  console.log(`\n   📋 Test enrollments to be deleted:`);
  for (const enrollment of testEnrollments.slice(0, 10)) {
    const enrollmentId = enrollment.id?.S || '?';
    const courseId = enrollment.courseId?.S || '?';
    console.log(`      • Enrollment ${enrollmentId.slice(0, 16)}... (Course: ${courseId})`);
  }
  if (testEnrollments.length > 10) {
    console.log(`      ... and ${testEnrollments.length - 10} more`);
  }

  if (isDryRun) {
    console.log(`\n   ℹ️  DRY-RUN MODE: No enrollments will be deleted. Use --execute to actually delete.`);
    return testEnrollments.length;
  }

  // 要求確認
  if (!isForce) {
    const confirmed = await askConfirmation(`\n   ⚠️  Are you sure you want to delete ${testEnrollments.length} test enrollments? (yes/no): `);
    if (!confirmed) {
      console.log(`   ❌ Deletion cancelled by user.`);
      return 0;
    }
  }

  let deletedCount = 0;
  for (const enrollment of testEnrollments) {
    const enrollmentId = enrollment.id?.S;
    if (!enrollmentId) continue;

    try {
      await client.send(new DeleteItemCommand({
        TableName: enrollmentsTable,
        Key: { id: { S: enrollmentId } }
      }));
      
      console.log(`   ✅ Deleted enrollment: ${enrollmentId.slice(0, 20)}...`);
      deletedCount++;
    } catch (err) {
      console.warn(`   ⚠️  Error deleting ${enrollmentId}: ${err.message}`);
    }
  }

  console.log(`   📊 Total enrollments deleted: ${deletedCount}/${testEnrollments.length}`);
  return deletedCount;
}

// ═══════════════════════════════════════════════════════
// 主函式
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  🧹 TEST DATA CLEANUP UTILITY (SAFE MODE)            ║');
  console.log('║  Mode: ' + (isDryRun ? 'DRY-RUN (Preview only)       ' : 'EXECUTE (Real deletion)   ') + '║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    // 環境檢查
    checkEnvironmentSafety();

    // 清理各個表格
    const coursesDeleted = await cleanupCourses();
    const ordersDeleted = await cleanupOrders();
    const enrollmentsDeleted = await cleanupEnrollments();

    // 摘要
    const totalDeleted = coursesDeleted + ordersDeleted + enrollmentsDeleted;
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    if (isDryRun) {
      console.log('║  ℹ️  DRY-RUN SUMMARY (Preview)                       ║');
      console.log(`║  Would delete: ${totalDeleted} test items                         ║`.padEnd(57) + '║');
      console.log('║  Courses: ' + coursesDeleted + ', Orders: ' + ordersDeleted + ', Enrollments: ' + enrollmentsDeleted);
      console.log('║                                                       ║');
      console.log('║  Run with --execute to actually delete these items   ║');
    } else {
      console.log('║  ✅ CLEANUP COMPLETED                                ║');
      console.log(`║  Deleted: ${totalDeleted} test items                            ║`.padEnd(57) + '║');
    }
    console.log('╚═══════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Cleanup failed with error:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
