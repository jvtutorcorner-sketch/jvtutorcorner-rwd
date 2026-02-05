import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // ★ 重要：強制動態執行，不使用快取

export async function GET() {
  const envVars = {
    // 檢查 AWS 相關變數
    CI_AWS_ACCESS_KEY_ID: process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    CI_AWS_SECRET_ACCESS_KEY: process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    CI_AWS_SESSION_TOKEN: process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
    CI_AWS_REGION: process.env.CI_AWS_REGION || process.env.AWS_REGION,
    DYNAMODB_TABLE_COURSES: process.env.DYNAMODB_TABLE_COURSES ,
    DYNAMODB_TABLE_TEACHERS: process.env.DYNAMODB_TABLE_TEACHERS ,
    DYNAMODB_TABLE_ENROLLMENTS: process.env.DYNAMODB_TABLE_ENROLLMENTS ,
    DYNAMODB_TABLE_ORDERS: process.env.DYNAMODB_TABLE_ORDERS ,
    // 檢查是否讀取到 Amplify 的自動變數
    AMPLIFY_REGION: process.env.AMPLIFY_REGION,
    
    // 檢查 Node 環境
    NODE_ENV: process.env.NODE_ENV,
    // Agora and Netless variables
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    NETLESS_SDK_TOKEN: process.env.NETLESS_SDK_TOKEN,
    NETLESS_APP_ID: process.env.NETLESS_APP_ID,
    AGORA_APP_ID: process.env.AGORA_APP_ID,
    AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
    NEXT_PUBLIC_USE_AGORA_WHITEBOARD: process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD ,
    CI_AWS_S3_BUCKET_NAME: process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME,
  };

  return NextResponse.json({
    message: 'Environment Variable Debug Check',
    env: envVars,
    timestamp: new Date().toISOString()
  });
}