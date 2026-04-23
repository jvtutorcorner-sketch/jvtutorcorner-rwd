import { ddbDocClient } from './lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';

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
