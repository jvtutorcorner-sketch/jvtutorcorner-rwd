#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region });

const testEmail = 'test.email.1776874431696@gmail.com';

(async () => {
  try {
    console.log(`🔍 正在掃描尋找 email 為 ${testEmail} 的帳號...`);
    
    const response = await client.send(new ScanCommand({
      TableName: 'jvtutorcorner-profiles',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: testEmail }
      },
      ExpressionAttributeNames: {
        '#id': 'id',
        '#roid': 'roid_id'
      },
      ProjectionExpression: '#id, #roid, email, createdAt'
    }));

    if (response.Count === 0) {
      console.log(`❌ 未找到該帳號`);
      process.exit(0);
    }

    const item = response.Items[0];
    console.log(`\n✅ 找到帳號:`);
    console.log(JSON.stringify(item, null, 2));
    
    const id = item.id?.S || item.roid_id?.S;
    const roidId = item.roid_id?.S;
    
    console.log(`\nKey 信息:`);
    console.log(`  - id: ${id}`);
    console.log(`  - roid_id: ${roidId}`);
  } catch (err) {
    console.error(`❌ 掃描失敗: ${err.message}`);
    process.exit(1);
  }
})();
