#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region });

const testEmail = 'n7842165@gmail.com';

(async () => {
  try {
    const response = await client.send(new ScanCommand({
      TableName: 'jvtutorcorner-profiles',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: testEmail }
      },
      ExpressionAttributeNames: {
        '#id': 'id'
      },
      ProjectionExpression: '#id, email, createdAt, emailVerified'
    }));

    if (response.Count === 0) {
      console.log(`ℹ️ 帳號不存在，可以進行註冊測試`);
    } else {
      const item = response.Items[0];
      console.log(`✅ 帳號存在於系統:`);
      console.log(`  - ID: ${item.id.S}`);
      console.log(`  - Email: ${item.email.S}`);
      console.log(`  - Email Verified: ${item.emailVerified?.BOOL || false}`);
      console.log(`  - Created: ${item.createdAt.S}`);
    }
  } catch (err) {
    console.error(`❌ 掃描失敗: ${err.message}`);
  }
})();
