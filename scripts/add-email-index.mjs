#!/usr/bin/env node
/**
 * Critical Fix: Add EmailIndex GSI to Profiles Table
 * 
 * This script adds the missing EmailIndex to the Profiles table to eliminate
 * expensive Scan operations during login and registration.
 * 
 * BEFORE running this script:
 * - Ensure AWS credentials are configured
 * - Verify PROFILES_TABLE environment variable is set
 * - Run in staging environment first
 * 
 * Usage:
 *   node scripts/add-email-index.mjs
 * 
 * Or with custom table name:
 *   PROFILES_TABLE=my-custom-profiles-table node scripts/add-email-index.mjs
 */

import { DynamoDBClient, DescribeTableCommand, UpdateTableCommand } from '@aws-sdk/client-dynamodb';

const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

const client = new DynamoDBClient({ region });

async function checkTableExists() {
  try {
    const command = new DescribeTableCommand({ TableName: PROFILES_TABLE });
    const response = await client.send(command);
    return response.Table;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.error(`❌ Table '${PROFILES_TABLE}' does not exist.`);
      console.error(`   Please create the table first or check the table name.`);
      process.exit(1);
    }
    throw error;
  }
}

async function checkIndexExists(table) {
  const gsis = table.GlobalSecondaryIndexes || [];
  const emailIndex = gsis.find(gsi => gsi.IndexName === 'EmailIndex');
  
  if (emailIndex) {
    console.log(`✅ EmailIndex already exists on table '${PROFILES_TABLE}'`);
    console.log(`   Status: ${emailIndex.IndexStatus}`);
    
    if (emailIndex.IndexStatus === 'CREATING') {
      console.log(`⏳ Index is still being created. Please wait...`);
    } else if (emailIndex.IndexStatus === 'ACTIVE') {
      console.log(`✅ Index is ACTIVE and ready to use.`);
    }
    
    return true;
  }
  
  return false;
}

async function addEmailIndex() {
  console.log(`📊 Checking table: ${PROFILES_TABLE}`);
  console.log(`   Region: ${region}`);
  console.log('');
  
  // Check if table exists
  const table = await checkTableExists();
  console.log(`✅ Table '${PROFILES_TABLE}' exists.`);
  console.log('');
  
  // Check if EmailIndex already exists
  const indexExists = await checkIndexExists(table);
  if (indexExists) {
    return;
  }
  
  console.log(`📝 EmailIndex does not exist. Creating...`);
  console.log('');
  
  // Create the index
  try {
    const updateCommand = new UpdateTableCommand({
      TableName: PROFILES_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'email', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: 'EmailIndex',
            KeySchema: [
              { AttributeName: 'email', KeyType: 'HASH' }
            ],
            Projection: {
              ProjectionType: 'ALL'
            }
          }
        }
      ]
    });
    
    const response = await client.send(updateCommand);
    
    console.log(`✅ EmailIndex creation initiated successfully!`);
    console.log('');
    console.log(`ℹ️  Index Status: CREATING`);
    console.log(`   This may take several minutes depending on table size.`);
    console.log('');
    console.log(`📊 Table Info:`);
    console.log(`   Table Status: ${response.TableDescription?.TableStatus}`);
    console.log('');
    console.log(`⏳ To check index status later, run:`);
    console.log(`   aws dynamodb describe-table --table-name ${PROFILES_TABLE} --region ${region}`);
    console.log('');
    console.log(`✅ Once IndexStatus shows 'ACTIVE', you can start using the index.`);
    
  } catch (error) {
    console.error(`❌ Failed to create EmailIndex:`, error.message);
    
    if (error.name === 'LimitExceededException') {
      console.error(`   You have reached the limit for GSIs on this table.`);
    } else if (error.name === 'ResourceInUseException') {
      console.error(`   The table is currently being updated. Please try again later.`);
    }
    
    process.exit(1);
  }
}

async function main() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  Critical Fix: Add EmailIndex GSI to Profiles Table');
  console.log('='.repeat(70));
  console.log('');
  
  await addEmailIndex();
  
  console.log('');
  console.log('='.repeat(70));
  console.log('  Done!');
  console.log('='.repeat(70));
  console.log('');
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
