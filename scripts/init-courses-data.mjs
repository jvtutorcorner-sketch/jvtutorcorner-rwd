#!/usr/bin/env node
/**
 * Initialize courses data in DynamoDB from data/courses.ts
 * Usage: node scripts/init-courses-data.mjs
 */

import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

console.log(`📚 Initializing Courses Data`);
console.log(`   Table: ${COURSES_TABLE}`);
console.log(`   Region: ${AWS_REGION}\n`);

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);

// Built-in courses data (matching data/courses.ts)
const COURSES_DATA = [
  {
    id: 'c1',
    title: '英檢中級衝刺班（12 週）',
    subject: '英文',
    level: '國高中',
    language: '中文＋英文',
    teacherName: '林老師',
    pricePerSession: 900,
    durationMinutes: 90,
    sessionDurationMinutes: 50,
    tags: ['英檢中級', '聽力閱讀', '寫作口說'],
    mode: 'online',
    description: '針對英檢中級設計的完整衝刺課程，每週 2 堂，涵蓋聽、說、讀、寫四大範疇，課堂中會演練歷屆試題並教你掌握得分關鍵。',
    nextStartDate: '2025-12-10',
    totalSessions: 24,
    seatsLeft: 5,
    currency: 'TWD',
    status: '上架',
    pointCost: 10,
    enrollmentType: 'both',
  },
  {
    id: 'c2',
    title: '國三會考總復習：數學重點題型',
    subject: '數學',
    level: '國中',
    language: '中文',
    teacherName: '陳老師',
    pricePerSession: 750,
    durationMinutes: 90,
    sessionDurationMinutes: 50,
    tags: ['會考', '歷屆試題', '觀念統整'],
    mode: 'online',
    description: '針對國三會考數學設計，重點整理＋歷屆試題分析，用系統化方式幫助學生建立解題架構，而不是死背公式。',
    nextStartDate: '2025-12-05',
    totalSessions: 16,
    seatsLeft: 8,
    currency: 'TWD',
    status: '上架',
    pointCost: 8,
    enrollmentType: 'both',
  },
  {
    id: 'c3',
    title: '商用英語會議表達技巧',
    subject: '英文',
    level: '大專 / 社會人士',
    language: '英文',
    teacherName: '王老師',
    pricePerSession: 1200,
    durationMinutes: 60,
    sessionDurationMinutes: 50,
    tags: ['商用英文', '簡報', '會議'],
    mode: 'online',
    description: '針對需要參與英文會議的職場人士設計，實際演練會議開場、意見表達、反對與折衷、結論收斂等情境。',
    nextStartDate: '2025-12-15',
    totalSessions: 10,
    seatsLeft: 3,
    currency: 'TWD',
    status: '上架',
    requiredPlan: 'pro',
    pointCost: 15,
    enrollmentType: 'both',
  },
  {
    id: 'c4',
    title: '旅遊日文：跟團自助都好用',
    subject: '日文',
    level: '入門',
    language: '日文',
    teacherName: '佐藤老師',
    pricePerSession: 600,
    durationMinutes: 60,
    sessionDurationMinutes: 50,
    tags: ['旅遊', '初級', '日常會話'],
    mode: 'online',
    description: '針對想自助旅遊或跟團旅遊的學習者，教你旅途中必備的日文會話、購物、用餐等情境表達。',
    nextStartDate: '2025-12-20',
    totalSessions: 12,
    seatsLeft: 10,
    currency: 'TWD',
    status: '上架',
    pointCost: 6,
    enrollmentType: 'both',
  },
];

async function initCoursesData() {
  try {
    // Step 1: Check existing data
    console.log('📖 Checking existing data in DynamoDB...\n');
    const scanCmd = new ScanCommand({ TableName: COURSES_TABLE });
    const existingResult = await ddbDocClient.send(scanCmd);
    const existingCourses = existingResult.Items || [];

    console.log(`📊 Current state:`);
    console.log(`   Existing courses: ${existingCourses.length}\n`);
    if (existingCourses.length > 0) {
      console.log('   Existing course IDs:');
      existingCourses.forEach((c, idx) => {
        console.log(`     ${idx + 1}. ${c.id} - ${c.title}`);
      });
      console.log();
    }

    // Step 2: Write built-in courses
    console.log('💾 Writing built-in courses to DynamoDB...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const course of COURSES_DATA) {
      try {
        const putCmd = new PutCommand({
          TableName: COURSES_TABLE,
          Item: {
            ...course,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        });

        await ddbDocClient.send(putCmd);
        successCount++;
        console.log(`   ✅ ${course.id} - ${course.title}`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ ${course.id} - ${error.message}`);
      }
    }

    console.log(`\n✨ Initialization complete!`);
    console.log(`   Successfully written: ${successCount}/${COURSES_DATA.length}`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount}`);
    }

    // Step 3: Verify
    console.log(`\n📖 Verifying data in database...\n`);
    const verifyResult = await ddbDocClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
    const finalCourses = verifyResult.Items || [];
    console.log(`   Total courses in database: ${finalCourses.length}`);
    console.log(`   Course IDs:`);
    finalCourses.forEach((c, idx) => {
      console.log(`     ${idx + 1}. ${c.id} - ${c.title} (${c.subject})`);
    });

    console.log(`\n✅ Ready! Visit http://localhost:3000/courses to see the data\n`);
  } catch (error) {
    console.error('❌ Error initializing courses:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check AWS credentials in .env.local');
    console.error('  2. Verify table exists: ' + COURSES_TABLE);
    console.error('  3. Ensure IAM permissions include PutItem/ScanItem on DynamoDB');
    process.exit(1);
  }
}

// Run initialization
initCoursesData();
