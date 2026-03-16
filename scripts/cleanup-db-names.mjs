// scripts/cleanup-db-names.mjs
/**
 * 掃描並清理資料庫中殘留的 "（更新）" 或 "(更新)" 尾綴
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
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

const SUFFIX_REGEX = /[\(（]更新[\)）]$/;

async function cleanup() {
    console.log('--- 開始清理資料庫名稱 ---');

    // 1. 清理 Teachers Table
    try {
        console.log(`正在掃描表 ${TEACHERS_TABLE}...`);
        const teachersRes = await ddbDocClient.send(new ScanCommand({ TableName: TEACHERS_TABLE }));
        const teachers = teachersRes.Items || [];
        let teacherCount = 0;

        for (const teacher of teachers) {
            if (teacher.name && SUFFIX_REGEX.test(teacher.name)) {
                const oldName = teacher.name;
                const newName = oldName.replace(SUFFIX_REGEX, '').trim();

                console.log(`[Teacher] 清理 ${teacher.id}: "${oldName}" -> "${newName}"`);

                await ddbDocClient.send(new UpdateCommand({
                    TableName: TEACHERS_TABLE,
                    Key: { id: teacher.id },
                    UpdateExpression: 'SET #name = :name',
                    ExpressionAttributeNames: { '#name': 'name' },
                    ExpressionAttributeValues: { ':name': newName }
                }));
                teacherCount++;
            }
        }
        console.log(`✅ 已清理 ${teacherCount} 位老師姓名\n`);
    } catch (e) {
        console.error('清理老師表失敗:', e);
    }

    // 2. 清理 Courses Table
    try {
        console.log(`正在掃描表 ${COURSES_TABLE}...`);
        const coursesRes = await ddbDocClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
        const courses = coursesRes.Items || [];
        let courseCount = 0;

        for (const course of courses) {
            if (course.teacherName && SUFFIX_REGEX.test(course.teacherName)) {
                const oldName = course.teacherName;
                const newName = oldName.replace(SUFFIX_REGEX, '').trim();

                console.log(`[Course] 清理 ${course.id}: "${oldName}" -> "${newName}"`);

                await ddbDocClient.send(new UpdateCommand({
                    TableName: COURSES_TABLE,
                    Key: { id: course.id },
                    UpdateExpression: 'SET teacherName = :name',
                    ExpressionAttributeValues: { ':name': newName }
                }));
                courseCount++;
            }
        }
        console.log(`✅ 已清理 ${courseCount} 堂課程中的老師姓名\n`);
    } catch (e) {
        console.error('清理課程表失敗:', e);
    }

    console.log('--- 清理完成 ---');
}

cleanup();
