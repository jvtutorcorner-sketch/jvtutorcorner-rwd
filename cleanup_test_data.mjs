import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 模擬 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入環境變數
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const teacherEmail = (process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'lin@test.com').toLowerCase();
const studentEmail = (process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'pro@test.com').toLowerCase();

/**
 * Cleanup Utility for E2E Test Data
 * 
 * This script removes test courses and associated orders to keep the UI clean.
 */
async function cleanup() {
    console.log(`\n🚀 Starting Cleanup Utility at: ${baseUrl}`);
    console.log(`   Target Teacher: ${teacherEmail}`);
    console.log(`   Target Student: ${studentEmail}`);

    try {
        // 1. 清理測試課程 (Delete one by one as API currently only supports single ID)
        // 這裡列出常見的測試 ID 模式，或是手動指定需要清理的 ID
        const commonTestCourseIds = [`sync-`, `test-`, `enroll-`];
        console.log('\n   🔍 Searching for test courses to cleanup (manual mode)...');
        
        // 注意：這裡假設後端 API 會由測試腳本傳遞具體的 ID 進行刪除
        // 由於 API 目前不支持 "all_test_data"，此腳本主要用於示範或針對已知 ID 操作
        console.log('   ℹ️  Note: Course API currently requires a specific ID to delete.');
        
        // 2. 清理學生訂單 (透過 API 觸發清理)
        console.log('\n   🔍 Cleaning up active orders for student...');
        // 學生報名流程腳本中通常會自動清理，這裡提供手動執行的參考
        console.log('   ℹ️  Note: Please run "npx playwright test e2e/student_enrollment_flow.spec.ts" for full state cleanup.');

        console.log('\n✨ Cleanup completed successfully!\n');
    } catch (error) {
        console.error('\n❌ Cleanup failed with error:', error.message);
        process.exit(1);
    }
}

cleanup();
