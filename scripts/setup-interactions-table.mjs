
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, TableStatus, BillingMode, KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_USER_INTERACTIONS || 'jvtutorcorner-user-interactions';

const client = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupTable() {
  console.log(`📦 [Interactions] Setting up table: ${TABLE_NAME}`);

  try {
    // 1. Check if exists
    try {
      await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      console.log(`⚠️  [Interactions] Table already exists, skipping creation.`);
      return;
    } catch (err) {
      if (err.name !== 'ResourceNotFoundException') throw err;
    }

    // 2. Create
    const params = {
      TableName: TABLE_NAME,
      BillingMode: BillingMode.PAY_PER_REQUEST,
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
        { AttributeName: 'interactionId', AttributeType: ScalarAttributeType.S },
      ],
      KeySchema: [
        { AttributeName: 'userId', KeyType: KeyType.HASH },
        { AttributeName: 'interactionId', KeyType: KeyType.RANGE },
      ],
      SSESpecification: {
        Enabled: true,
      },
      Tags: [
        { Key: 'Project', Value: 'jvtutorcorner' },
        { Key: 'Purpose', Value: 'User-Interactions-Recommendations' },
      ],
    };

    await client.send(new CreateTableCommand(params));
    console.log(`✅ [Interactions] Table creation initiated`);

    // 3. Wait for ACTIVE
    let isActive = false;
    for (let i = 0; i < 20; i++) {
      const res = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (res.Table.TableStatus === TableStatus.ACTIVE) {
        isActive = true;
        break;
      }
      console.log(`   [Interactions] Status: ${res.Table.TableStatus}, waiting 5s...`);
      await sleep(5000);
    }

    if (isActive) {
      console.log(`✅ [Interactions] Table is now ACTIVE`);
    } else {
      console.error(`❌ [Interactions] Timeout waiting for table to become ACTIVE`);
    }

  } catch (err) {
    console.error(`❌ [Interactions] Error:`, err.message);
    process.exit(1);
  }
}

setupTable();
