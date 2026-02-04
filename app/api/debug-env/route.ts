import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // ★ 重要：強制動態執行，不使用快取

export async function GET() {
  const envVars = {
    // 檢查 AWS 相關變數
    CI_AWS_ACCESS_KEY_ID: process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    CI_AWS_SECRET_ACCESS_KEY: process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    CI_AWS_SESSION_TOKEN: process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
    CI_AWS_REGION: process.env.CI_AWS_REGION || process.env.AWS_REGION,
    DYNAMODB_TABLE_COURSES: process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses',
    DYNAMODB_TABLE_TEACHERS: process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers',
    DYNAMODB_TABLE_ENROLLMENTS: process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments',
    DYNAMODB_TABLE_ORDERS: process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders',
    // 檢查是否讀取到 Amplify 的自動變數
    AMPLIFY_REGION: process.env.AMPLIFY_REGION,
    
    // 檢查 Node 環境
    NODE_ENV: process.env.NODE_ENV,
  };

  return NextResponse.json({
    message: 'Environment Variable Debug Check',
    env: envVars,
    timestamp: new Date().toISOString()
  });
}