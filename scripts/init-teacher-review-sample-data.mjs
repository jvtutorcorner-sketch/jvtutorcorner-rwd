// scripts/init-teacher-review-sample-data.mjs
/**
 * 初始化教师审核测试数据
 * 创建一些待审核的教师资料变更申请
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env.local');

config({ path: envPath });

import { ddbDocClient } from '../lib/dynamo.ts';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

// 测试数据：待审核的教师变更申请
const samplePendingReviews = [
  {
    id: 'teacher-review-001',
    email: 'zhang.teacher@test.com',
    name: '張老師',
    subjects: ['數學'],
    languages: ['中文'],
    intro: '我是一位專業的數學老師，有5年教學經驗。',
    profileReviewStatus: 'PENDING',
    pendingProfileChanges: {
      name: '張大明老師',
      subjects: ['數學', '物理'],
      languages: ['中文', '英文'],
      intro: '我是一位專業的數學和物理老師，有5年教學經驗，擅長用生動的方式講解複雜概念。',
      requestedAt: new Date(Date.now() - 2 * 86400000).toISOString() // 2天前申請
    },
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'teacher-review-002',
    email: 'wang.teacher@test.com',
    name: '王老師',
    subjects: ['英文'],
    languages: ['中文', '英文'],
    intro: '專業英文教師，擅長英檢和多益課程。',
    profileReviewStatus: 'PENDING',
    pendingProfileChanges: {
      name: '王美玲老師',
      intro: '專業英文教師，擅長英檢、多益和雅思課程。曾獲優秀教師獎，學生通過率達95%以上。',
      requestedAt: new Date(Date.now() - 1 * 86400000).toISOString() // 1天前申請
    },
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'teacher-review-003',
    email: 'li.teacher@test.com',
    name: '李老師',
    subjects: ['日文', '韓文'],
    languages: ['中文', '日文', '韓文'],
    intro: '語言學習專家，精通多國語言。',
    profileReviewStatus: 'PENDING',
    pendingProfileChanges: {
      subjects: ['日文', '韓文', '西班牙文'],
      languages: ['中文', '日文', '韓文', '英文', '西班牙文'],
      intro: '語言學習專家，精通五國語言。擁有JLPT N1和TOPIK 6級證書，教學風格輕鬆活潑。',
      requestedAt: new Date(Date.now() - 3 * 3600000).toISOString() // 3小時前申請
    },
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString()
  },
  {
    id: 'teacher-review-004',
    email: 'chen.teacher@test.com',
    name: '陳老師',
    subjects: ['化學', '生物'],
    languages: ['中文'],
    intro: '理科專業教師。',
    profileReviewStatus: 'PENDING',
    pendingProfileChanges: {
      name: '陳博士',
      subjects: ['化學', '生物', '地球科學'],
      intro: '理科專業教師，擁有化學博士學位。專精高中化學、生物和地球科學課程，曾指導學生獲科展金牌。',
      requestedAt: new Date(Date.now() - 30 * 60000).toISOString() // 30分鐘前申請
    },
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60000).toISOString()
  }
];

async function checkExistingTeachers() {
  try {
    const scanCmd = new ScanCommand({
      TableName: TEACHERS_TABLE,
      FilterExpression: 'profileReviewStatus = :status',
      ExpressionAttributeValues: {
        ':status': 'PENDING'
      }
    });

    const result = await ddbDocClient.send(scanCmd);
    return result.Items || [];
  } catch (error) {
    console.error('Error checking existing teachers:', error);
    return [];
  }
}

async function writeTeacher(teacher) {
  try {
    const putCmd = new PutCommand({
      TableName: TEACHERS_TABLE,
      Item: teacher
    });

    await ddbDocClient.send(putCmd);
    console.log(`✅ Written: ${teacher.name} (${teacher.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to write ${teacher.name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('=== 初始化教師審核測試數據 ===');
  console.log(`目標表: ${TEACHERS_TABLE}`);
  console.log(`區域: ${process.env.AWS_REGION || 'ap-northeast-1'}`);
  console.log();

  // 檢查是否已有待審核數據
  console.log('檢查現有待審核申請...');
  const existing = await checkExistingTeachers();
  
  if (existing.length > 0) {
    console.log(`\n⚠️  已存在 ${existing.length} 個待審核申請：`);
    existing.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.name || t.id} (申請於: ${t.pendingProfileChanges?.requestedAt || '未知'})`);
    });
    console.log('\n是否要繼續添加測試數據? (將覆蓋相同 ID 的記錄)');
    console.log('繼續執行...\n');
  } else {
    console.log('✓ 目前沒有待審核申請\n');
  }

  // 寫入測試數據
  console.log(`準備寫入 ${samplePendingReviews.length} 個測試教師審核申請...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const teacher of samplePendingReviews) {
    const success = await writeTeacher(teacher);
    if (success) {
      successCount++;
      
      // 顯示變更摘要
      const changes = teacher.pendingProfileChanges;
      const changedFields = Object.keys(changes).filter(k => k !== 'requestedAt');
      console.log(`   變更欄位: ${changedFields.join(', ')}`);
      console.log();
    } else {
      failCount++;
    }
  }

  // 最終統計
  console.log('='.repeat(50));
  console.log('✅ 初始化完成！');
  console.log(`   成功: ${successCount}/${samplePendingReviews.length}`);
  if (failCount > 0) {
    console.log(`   失敗: ${failCount}`);
  }
  console.log();
  console.log('現在可以訪問 /admin/teacher-reviews 查看待審核申請');
  console.log('='.repeat(50));
}

// 驗證環境變數
if (!process.env.DYNAMODB_TABLE_TEACHERS) {
  console.error('❌ 錯誤: 未設置 DYNAMODB_TABLE_TEACHERS 環境變數');
  console.error('請在 .env.local 中設置此變數');
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ 錯誤: 未設置 AWS 憑證');
  console.error('請在 .env.local 中設置 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

main().catch(error => {
  console.error('\n❌ 執行失敗:', error.message);
  process.exit(1);
});
