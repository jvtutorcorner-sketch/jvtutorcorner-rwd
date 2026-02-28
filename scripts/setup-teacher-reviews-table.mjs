// scripts/setup-teacher-reviews-table.mjs
/**
 * Setup script for teacher-reviews DynamoDB table
 * Creates the table with appropriate indexes if it doesn't exist
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env.local');

config({ path: envPath });

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  CreateTableCommand, 
  DescribeTableCommand,
  waitUntilTableExists 
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_TEACHER_REVIEWS || 'jvtutorcorner-teacher-reviews';

async function tableExists() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable() {
  console.log(`Creating table: ${TABLE_NAME}...`);

  const command = new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'teacherId', AttributeType: 'S' },
      { AttributeName: 'reviewedAt', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'teacherId-reviewedAt-index',
        KeySchema: [
          { AttributeName: 'teacherId', KeyType: 'HASH' },
          { AttributeName: 'reviewedAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'reviewedAt-index',
        KeySchema: [
          { AttributeName: 'reviewedAt', KeyType: 'HASH' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    Tags: [
      { Key: 'Application', Value: 'jvtutorcorner' },
      { Key: 'Purpose', Value: 'teacher-review-audit' },
    ],
  });

  try {
    await client.send(command);
    console.log('Table creation initiated. Waiting for table to become active...');

    // Wait for table to be created
    await waitUntilTableExists(
      { client, maxWaitTime: 120, minDelay: 2, maxDelay: 5 },
      { TableName: TABLE_NAME }
    );

    console.log(`✅ Table ${TABLE_NAME} created successfully!`);
    return true;
  } catch (error) {
    console.error('❌ Failed to create table:', error);
    throw error;
  }
}

async function main() {
  console.log('=== Teacher Reviews Table Setup ===');
  console.log(`Table name: ${TABLE_NAME}`);
  console.log(`Region: ${process.env.AWS_REGION || 'ap-northeast-1'}`);
  console.log();

  try {
    const exists = await tableExists();

    if (exists) {
      console.log(`ℹ️  Table ${TABLE_NAME} already exists.`);
      console.log('No action needed.');
    } else {
      await createTable();
      console.log();
      console.log('Table is ready to use!');
      console.log();
      console.log('Features:');
      console.log('  - Primary key: id (UUID)');
      console.log('  - GSI: teacherId-reviewedAt-index (query reviews by teacher)');
      console.log('  - GSI: reviewedAt-index (query reviews by date)');
      console.log('  - Billing: PAY_PER_REQUEST (on-demand)');
    }
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

main();
