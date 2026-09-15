// lib/dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Region: explicit > environment > default
// Credentials: let AWS SDK auto-discover from IAM Role (Amplify) or env vars (.env.local for local dev)
const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';

console.log('[DynamoDB] Initializing with:', {
  region: awsRegion,
  credentialSource: 'IAM Role or environment auto-discovery',
  node_env: process.env.NODE_ENV,
});

const client = new DynamoDBClient({
  region: awsRegion,
  // Omit credentials to let AWS SDK auto-discover:
  // - Production (Amplify): uses IAM Role
  // - Local dev: uses AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from .env.local or ~/.aws/credentials
});

export const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
