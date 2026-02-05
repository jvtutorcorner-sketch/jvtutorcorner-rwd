// lib/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

console.log('[DynamoDB] Initializing with:', {
  region: awsRegion,
  hasAccessKey: !!accessKey,
  hasSecretKey: !!secretKey,
  isReservedAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  isCiAccessKey: !!process.env.CI_AWS_ACCESS_KEY_ID
});

const client = new DynamoDBClient({
  region: awsRegion,
  credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
  // 在 Amplify 上會自動用執行環境的 IAM Role
  // 本機開發如果有設定 AWS_PROFILE 或環境變數也會自動讀取
});

export const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
