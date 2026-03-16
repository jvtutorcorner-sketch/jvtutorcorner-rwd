// scripts/test-teacher-review-service.mjs
/**
 * Test script for teacher review service
 * Tests creating and querying review records
 */

import { 
  createReviewRecord,
  getReviewRecordsByTeacherId,
  getRecentReviewRecords,
  getReviewStats
} from '../lib/teacherReviewService.ts';

async function testCreateReviewRecord() {
  console.log('\n=== Test: Create Review Record ===');
  
  try {
    const record = await createReviewRecord({
      teacherId: 'test-teacher-001',
      teacherName: '測試老師',
      requestedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'admin@test.com',
      action: 'approve',
      originalData: {
        name: '測試老師',
        subjects: ['數學'],
        intro: '原始介紹'
      },
      requestedChanges: {
        name: '測試老師（更新）',
        subjects: ['數學', '物理'],
        intro: '更新後的介紹'
      },
      notes: '測試審核記錄 - 自動創建'
    });

    console.log('✅ Review record created successfully!');
    console.log('Record ID:', record.id);
    console.log('Teacher:', record.teacherName);
    console.log('Action:', record.action);
    return record;
  } catch (error) {
    console.error('❌ Failed to create review record:', error.message);
    throw error;
  }
}

async function testGetReviewsByTeacherId(teacherId) {
  console.log('\n=== Test: Get Reviews by Teacher ID ===');
  console.log('Teacher ID:', teacherId);
  
  try {
    const records = await getReviewRecordsByTeacherId(teacherId);
    console.log(`✅ Found ${records.length} review record(s)`);
    
    records.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log('  ID:', record.id);
      console.log('  Action:', record.action);
      console.log('  Reviewed by:', record.reviewedBy);
      console.log('  Reviewed at:', new Date(record.reviewedAt).toLocaleString());
    });
    
    return records;
  } catch (error) {
    console.error('❌ Failed to get reviews:', error.message);
    throw error;
  }
}

async function testGetRecentReviews() {
  console.log('\n=== Test: Get Recent Reviews ===');
  
  try {
    const records = await getRecentReviewRecords(5);
    console.log(`✅ Found ${records.length} recent review(s)`);
    
    records.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log('  Teacher:', record.teacherName);
      console.log('  Action:', record.action);
      console.log('  Reviewed at:', new Date(record.reviewedAt).toLocaleString());
    });
    
    return records;
  } catch (error) {
    console.error('❌ Failed to get recent reviews:', error.message);
    throw error;
  }
}

async function testGetStats() {
  console.log('\n=== Test: Get Review Statistics ===');
  
  try {
    const stats = await getReviewStats();
    console.log('✅ Statistics retrieved successfully!');
    console.log('Total reviews:', stats.total);
    console.log('Approved:', stats.approved);
    console.log('Rejected:', stats.rejected);
    console.log('Approval rate:', `${((stats.approved / stats.total) * 100).toFixed(1)}%`);
    
    return stats;
  } catch (error) {
    console.error('❌ Failed to get statistics:', error.message);
    throw error;
  }
}

async function main() {
  console.log('===================================');
  console.log('Teacher Review Service Test Suite');
  console.log('===================================');
  
  try {
    // Test 1: Create a review record
    const createdRecord = await testCreateReviewRecord();
    
    // Test 2: Get reviews by teacher ID
    await testGetReviewsByTeacherId(createdRecord.teacherId);
    
    // Test 3: Get recent reviews
    await testGetRecentReviews();
    
    // Test 4: Get statistics
    await testGetStats();
    
    console.log('\n===================================');
    console.log('✅ All tests passed!');
    console.log('===================================\n');
  } catch (error) {
    console.error('\n===================================');
    console.error('❌ Test suite failed!');
    console.error('Error:', error.message);
    console.error('===================================\n');
    process.exit(1);
  }
}

// Check if table environment variable is set
if (!process.env.DYNAMODB_TABLE_TEACHER_REVIEWS) {
  console.error('❌ Error: DYNAMODB_TABLE_TEACHER_REVIEWS environment variable not set');
  console.error('Please set it in .env.local file');
  process.exit(1);
}

console.log('Using table:', process.env.DYNAMODB_TABLE_TEACHER_REVIEWS);
console.log('Region:', process.env.AWS_REGION || 'ap-northeast-1');

main();
