/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 確保 white-web-sdk 被正確編譯
  transpilePackages: ['white-web-sdk'],

  // ★★★ 關鍵修復：強制將 Build Time 的變數注入到 Runtime ★★★
  env: {
    AGORA_WHITEBOARD_APP_ID: process.env.AGORA_WHITEBOARD_APP_ID,
    AGORA_WHITEBOARD_AK: process.env.AGORA_WHITEBOARD_AK,
    AGORA_WHITEBOARD_SK: process.env.AGORA_WHITEBOARD_SK,
    NETLESS_SDK_TOKEN: process.env.NETLESS_SDK_TOKEN,
    NETLESS_APP_ID: process.env.NETLESS_APP_ID,
    // 其他需要的後端變數...
    AGORA_APP_ID: process.env.AGORA_APP_ID,
    AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
    // Feature Flag default to true (Amplify might miss .env.local)
    NEXT_PUBLIC_USE_AGORA_WHITEBOARD: process.env.NEXT_PUBLIC_USE_AGORA_WHITEBOARD || 'true',
    // CI / AWS credentials (prefer CI_ prefixed variables)
    CI_AWS_ACCESS_KEY_ID: process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    CI_AWS_SECRET_ACCESS_KEY: process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    CI_AWS_SESSION_TOKEN: process.env.CI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN,
    CI_AWS_REGION: process.env.CI_AWS_REGION || process.env.AWS_REGION,
    CI_AWS_S3_BUCKET_NAME: process.env.CI_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME,
    // DynamoDB table names used by server APIs
    DYNAMODB_TABLE_COURSES: process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses',
    DYNAMODB_TABLE_TEACHERS: process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers',
    DYNAMODB_TABLE_ENROLLMENTS: process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments',
    DYNAMODB_TABLE_ORDERS: process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders',
    AMPLIFY_REGION: process.env.AMPLIFY_REGION,
  },
};

export default nextConfig;
