#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const region = process.env.AWS_REGION || 'ap-northeast-1';
const client = new DynamoDBClient({ region });

const testEmail = 'test.email.1776874431696@gmail.com';

(async () => {
  try {
    console.log(`🔄 正在掃描尋找 email 為 ${testEmail} 的帳號...`);
    
    // 先掃描找到帳號的 ID
    const scanResponse = await client.send(new ScanCommand({
      TableName: 'jvtutorcorner-profiles',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: testEmail }
      },
      ExpressionAttributeNames: {
        '#id': 'id'
      },
      ProjectionExpression: '#id'
    }));

    if (scanResponse.Count === 0) {
      console.log(`ℹ️ 帳號不存在或已被刪除: ${testEmail}`);
      process.exit(0);
    }

    const id = scanResponse.Items[0].id.S;
    console.log(`✅ 找到帳號，ID: ${id}`);
    
    // 使用 ID 刪除帳號
    console.log(`🔄 正在刪除帳號...`);
    await client.send(new DeleteItemCommand({
      TableName: 'jvtutorcorner-profiles',
      Key: { id: { S: id } }
    }));
    
    console.log(`✅ 帳號已成功刪除: ${testEmail} (ID: ${id})`);
  } catch (err) {
    console.error(`❌ 刪除失敗: ${err.message}`);
    process.exit(1);
  }
})();
