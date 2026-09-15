// lib/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

console.log('[DynamoDB] Initializing with:', {
  region: awsRegion,
  hasAccessKey: !!accessKey,
  hasSecretKey: !!secretKey,
  hasSessionToken: !!sessionToken,
  isReservedAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  isCiAccessKey: !!process.env.CI_AWS_ACCESS_KEY_ID
});

const client = new DynamoDBClient({
  region: awsRegion,
  credentials: accessKey && secretKey ? {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    ...(sessionToken ? { sessionToken } : {})
  } : undefined,
});

export const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
