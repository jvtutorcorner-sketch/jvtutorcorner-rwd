// scripts/test-teacher-review-approval.mjs
/**
 * 测试教师审核流程：验证核准后数据是否正确更新
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
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

async function getPendingReviewTeachers() {
    console.log('查询待审核的教师...\n');
    
    const scanCmd = new ScanCommand({
        TableName: TEACHERS_TABLE,
        FilterExpression: 'profileReviewStatus = :status',
        ExpressionAttributeValues: {
            ':status': 'PENDING'
        }
    });

    const result = await ddbDocClient.send(scanCmd);
    return result.Items || [];
}

async function getTeacherById(teacherId) {
    const getCmd = new GetCommand({
        TableName: TEACHERS_TABLE,
        Key: { id: teacherId }
    });

    const result = await ddbDocClient.send(getCmd);
    return result.Item;
}

async function simulateApproval(teacherId) {
    console.log(`\n模拟审核通过教师 ${teacherId}...\n`);
    
    const response = await fetch(`http://localhost:3000/api/admin/teacher-reviews/${teacherId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'approve',
            reviewedBy: 'test-script@admin.com',
            notes: '自动化测试审核通过'
        })
    });

    const data = await response.json();
    return data;
}

async function main() {
    console.log('='.repeat(60));
    console.log('教师审核流程测试');
    console.log('='.repeat(60));
    console.log();

    // 1. 获取待审核教师
    const pendingTeachers = await getPendingReviewTeachers();
    
    if (pendingTeachers.length === 0) {
        console.log('❌ 没有待审核的教师');
        console.log('\n请先运行：node scripts/init-teacher-review-sample-data.mjs');
        return;
    }

    console.log(`✅ 找到 ${pendingTeachers.length} 个待审核教师\n`);

    // 选择第一个教师进行测试
    const testTeacher = pendingTeachers[0];
    console.log('测试对象:', testTeacher.name || testTeacher.id);
    console.log('教师 ID:', testTeacher.id);
    console.log();

    // 2. 显示审核前的状态
    console.log('📋 审核前状态:');
    console.log('-'.repeat(60));
    console.log('当前资料:');
    console.log('  名称:', testTeacher.name);
    console.log('  科目:', testTeacher.subjects?.join(', '));
    console.log('  语言:', testTeacher.languages?.join(', '));
    console.log('  介绍:', testTeacher.intro?.substring(0, 50) + '...');
    console.log();

    const pendingChanges = testTeacher.pendingProfileChanges || {};
    console.log('待审核变更:');
    Object.keys(pendingChanges).forEach(key => {
        if (key !== 'requestedAt') {
            const value = Array.isArray(pendingChanges[key]) 
                ? pendingChanges[key].join(', ') 
                : pendingChanges[key];
            const displayValue = typeof value === 'string' && value.length > 50 
                ? value.substring(0, 50) + '...' 
                : value;
            console.log(`  ${key}:`, displayValue);
        }
    });
    console.log();

    // 3. 模拟审核通过（需要本地服务器运行）
    console.log('⏳ 正在调用审核 API...');
    
    try {
        const approvalResult = await simulateApproval(testTeacher.id);
        
        if (!approvalResult.ok) {
            console.log('❌ 审核失败:', approvalResult.message);
            return;
        }

        console.log('✅ 审核通过\n');

        // 4. 等待一秒后查询更新结果
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 5. 验证数据是否正确更新
        console.log('🔍 验证审核后的数据...');
        console.log('-'.repeat(60));

        const updatedTeacher = await getTeacherById(testTeacher.id);

        if (!updatedTeacher) {
            console.log('❌ 找不到更新后的教师数据');
            return;
        }

        console.log('审核后状态:');
        console.log('  审核状态:', updatedTeacher.profileReviewStatus);
        console.log('  待审核变更:', updatedTeacher.pendingProfileChanges ? '存在（错误！）' : '已清除 ✅');
        console.log();

        console.log('更新后的资料:');
        console.log('  名称:', updatedTeacher.name);
        console.log('  科目:', updatedTeacher.subjects?.join(', '));
        console.log('  语言:', updatedTeacher.languages?.join(', '));
        console.log('  介绍:', updatedTeacher.intro?.substring(0, 50) + '...');
        console.log('  更新时间:', updatedTeacher.updatedAt);
        console.log();

        // 6. 验证每个字段是否正确更新
        console.log('✅ 字段验证:');
        console.log('-'.repeat(60));

        let allCorrect = true;

        Object.keys(pendingChanges).forEach(key => {
            if (key !== 'requestedAt') {
                const expected = pendingChanges[key];
                const actual = updatedTeacher[key];
                
                let isMatch = false;
                if (Array.isArray(expected)) {
                    isMatch = JSON.stringify(expected) === JSON.stringify(actual);
                } else {
                    isMatch = expected === actual;
                }

                if (isMatch) {
                    console.log(`  ✅ ${key}: 已正确更新`);
                } else {
                    console.log(`  ❌ ${key}: 更新失败`);
                    console.log(`     期望:`, expected);
                    console.log(`     实际:`, actual);
                    allCorrect = false;
                }
            }
        });

        console.log();
        console.log('='.repeat(60));
        
        if (allCorrect && updatedTeacher.profileReviewStatus === 'APPROVED') {
            console.log('🎉 测试通过！所有变更已正确应用到教师 profile');
        } else {
            console.log('❌ 测试失败！存在未正确更新的字段');
        }
        
        console.log('='.repeat(60));

    } catch (error) {
        console.error('❌ 测试执行失败:', error.message);
        console.error('\n请确保:');
        console.error('1. 开发服务器正在运行 (npm run dev)');
        console.error('2. 环境变量已正确配置');
    }
}

// 检查环境变量
if (!process.env.DYNAMODB_TABLE_TEACHERS) {
    console.error('❌ 错误: 未设置 DYNAMODB_TABLE_TEACHERS 环境变量');
    process.exit(1);
}

main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
});
