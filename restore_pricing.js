const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.CI_AWS_SESSION_TOKEN;

const client = new DynamoDBClient({
  region: awsRegion,
  credentials: accessKey && secretKey ? {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    ...(sessionToken ? { sessionToken } : {})
  } : undefined,
});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const PRICING_TABLE = process.env.DYNAMODB_TABLE_PRICING || 'jvtutorcorner-pricing';
const PRICING_CONFIG_ID = 'pricing-config';

async function restore() {
  const filePath = path.resolve(process.cwd(), '.next/standalone/.local_data/pricing_settings.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const settings = JSON.parse(raw);

  const command = new PutCommand({
    TableName: PRICING_TABLE,
    Item: {
      id: PRICING_CONFIG_ID,
      ...settings,
      updatedAt: new Date().toISOString(),
    },
  });

  await ddbDocClient.send(command);
  console.log('Restoration complete!');
}

restore().catch(console.error);
