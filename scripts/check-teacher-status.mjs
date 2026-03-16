// scripts/check-teacher-status.mjs
/**
 * 检查教师的审核状态
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
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

async function checkTeacher(teacherId) {
    console.log(`检查教师 ${teacherId} 的状态...\n`);
    
    try {
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
        
        console.log('教师信息:');
        console.log('  ID:', teacher.id);
        console.log('  名称:', teacher.name);
        console.log('  邮箱:', teacher.email);
        console.log('  科目:', teacher.subjects?.join(', '));
        console.log('  语言:', teacher.languages?.join(', '));
        console.log();
        
        console.log('审核状态:');
        console.log('  profileReviewStatus:', teacher.profileReviewStatus || '(未设置)');
        console.log();
        
        if (teacher.pendingProfileChanges) {
            console.log('待审核变更:');
            Object.keys(teacher.pendingProfileChanges).forEach(key => {
                const value = teacher.pendingProfileChanges[key];
                const displayValue = Array.isArray(value) 
                    ? value.join(', ') 
                    : (typeof value === 'string' && value.length > 100 
                        ? value.substring(0, 100) + '...' 
                        : value);
                console.log(`  ${key}:`, displayValue);
            });
        } else {
            console.log('✅ 无待审核变更');
        }
        
        console.log();
        console.log('问题诊断:');
        
        if (!teacher.profileReviewStatus) {
            console.log('⚠️  profileReviewStatus 字段为空或未设置');
            console.log('   这会导致审核 API 返回 400 错误');
            console.log('   需要设置为 "PENDING" 才能进行审核');
        } else if (teacher.profileReviewStatus !== 'PENDING') {
            console.log(`⚠️  profileReviewStatus = "${teacher.profileReviewStatus}"`);
            console.log('   必须是 "PENDING" 才能进行审核');
        } else {
            console.log('✅ 状态正确，可以进行审核');
        }
        
        if (!teacher.pendingProfileChanges) {
            console.log('⚠️  没有待审核变更数据 (pendingProfileChanges)');
        }
        
    } catch (error) {
        console.error('❌ 检查失败:', error.message);
    }
}

// 从命令行参数获取教师 ID
const teacherId = process.argv[2];

if (!teacherId) {
    console.error('❌ 请提供教师 ID');
    console.error('用法: node scripts/check-teacher-status.mjs <teacher-id>');
    console.error('例如: node scripts/check-teacher-status.mjs t1');
    process.exit(1);
}

checkTeacher(teacherId);
