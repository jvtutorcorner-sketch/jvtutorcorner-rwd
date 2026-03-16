// scripts/reset-teacher-review-status.mjs
/**
 * 重置教师为待审核状态
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env.local');

config({ path: envPath });

import { ddbDocClient } from '../lib/dynamo.ts';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

async function resetTeacherReviewStatus(teacherId) {
    console.log(`重置教师 ${teacherId} 为待审核状态...\n`);
    
    try {
        // 1. 先获取当前数据
        const getCmd = new GetCommand({
            TableName: TEACHERS_TABLE,
            Key: { id: teacherId }
        });

        const result = await ddbDocClient.send(getCmd);
        
        if (!result.Item) {
            console.log(`❌ 找不到教师 ID: ${teacherId}`);
            return;
        }

        const teacher = result.Item;
        console.log('当前状态:', teacher.profileReviewStatus);
        console.log('当前名称:', teacher.name);
        console.log();

        // 2. 创建一些测试变更
        const pendingChanges = {
            name: teacher.name + '（更新）',
            intro: (teacher.intro || '教师介绍') + '\n\n更新：添加了更多教学经验说明。',
            requestedAt: new Date().toISOString()
        };

        // 3. 更新为待审核状态
        const updateCmd = new UpdateCommand({
            TableName: TEACHERS_TABLE,
            Key: { id: teacherId },
            UpdateExpression: 'SET profileReviewStatus = :status, pendingProfileChanges = :changes, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':status': 'PENDING',
                ':changes': pendingChanges,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        });

        const updateResult = await ddbDocClient.send(updateCmd);
        
        console.log('✅ 重置成功！');
        console.log();
        console.log('新状态:');
        console.log('  profileReviewStatus:', updateResult.Attributes.profileReviewStatus);
        console.log('  待审核变更:', Object.keys(pendingChanges).filter(k => k !== 'requestedAt').join(', '));
        console.log();
        console.log('现在可以在 /admin/teacher-reviews 页面看到这个教师的审核申请了');
        
    } catch (error) {
        console.error('❌ 重置失败:', error.message);
    }
}

// 从命令行参数获取教师 ID
const teacherId = process.argv[2];

if (!teacherId) {
    console.error('❌ 请提供教师 ID');
    console.error('用法: node scripts/reset-teacher-review-status.mjs <teacher-id>');
    console.error('例如: node scripts/reset-teacher-review-status.mjs t1');
    process.exit(1);
}

resetTeacherReviewStatus(teacherId);
