#!/usr/bin/env node

// Direct DynamoDB write script using AWS CLI profiles and Amplify configuration
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const POINTS_TABLE = 'jvtutorcorner-user-points';
const PROFILES_TABLE = 'jvtutorcorner-profiles';

async function grantPointsViaDynamoDB() {
  console.log('🔧 [Grant Points] Starting direct DynamoDB write...');
  console.log(`📍 Tables: ${PROFILES_TABLE} → ${POINTS_TABLE}`);

  try {
    // 1. Read profiles from DynamoDB using AWS CLI
    console.log('\n📖 Step 1: Scanning profiles...');
    const scanCmd = `aws dynamodb scan --table-name ${PROFILES_TABLE} --output json`;
    const { stdout: scanOutput } = await execAsync(scanCmd, { 
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024 
    });

    const scanResult = JSON.parse(scanOutput);
    const profiles = scanResult.Items || [];
    console.log(`✅ Found ${profiles.length} profiles`);

    if (profiles.length === 0) {
      console.warn('⚠️  No profiles found. Exiting.');
      return { ok: false, message: 'No profiles found' };
    }

    // 2. Prepare batch writes
    console.log('\n📝 Step 2: Preparing 9999 points for each profile...');
    const items = [];
    
    for (const profile of profiles) {
      const email = profile.email?.S?.toLowerCase();
      const id = profile.id?.S;
      const roidId = profile.roid_id?.S;
      
      const userId = email || id || roidId;
      if (!userId) {
        console.warn(`⚠️  Skipping profile with no userId:`, profile);
        continue;
      }

      items.push({
        userId: { S: userId },
        balance: { N: '9999' },
        updatedAt: { S: new Date().toISOString() }
      });
    }

    console.log(`✅ Prepared ${items.length} point records`);

    // 3. Batch write items to POINTS_TABLE
    console.log('\n💾 Step 3: Writing to DynamoDB...');
    let successCount = 0;
    let errorCount = 0;

    // Process in batches of 25 (DynamoDB limit)
    const batchSize = 25;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const writeRequests = batch.map(item => ({
        PutRequest: { Item: item }
      }));

      const requestParams = {
        RequestItems: {
          [POINTS_TABLE]: writeRequests
        }
      };

      try {
        const { stdout } = await execAsync(
          `aws dynamodb batch-write-item --request-items '${JSON.stringify(requestParams).replace(/'/g, "'\\''")}'`,
          { stdio: 'pipe' }
        );
        successCount += batch.length;
        console.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} items written`);
      } catch (err) {
        console.error(`   ❌ Batch ${Math.floor(i / batchSize) + 1} error:`, err.message);
        errorCount += batch.length;
      }
    }

    console.log('\n🎉 Complete!');
    console.log(`   ✅ Success: ${successCount} records`);
    console.log(`   ❌ Errors: ${errorCount} records`);

    return {
      ok: true,
      count: successCount,
      errors: errorCount,
      message: `Successfully granted 9999 points to ${successCount} profiles`
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      ok: false,
      message: error.message
    };
  }
}

// Run
const result = await grantPointsViaDynamoDB();
console.log('\n📊 Result:', JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
