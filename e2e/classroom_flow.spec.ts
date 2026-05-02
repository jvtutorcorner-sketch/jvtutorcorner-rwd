import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import {
    injectDeviceCheckBypass,
    autoLogin,
    createCourseAsTeacherWithDuration,
    adminApproveCourse,
    runEnrollmentFlow,
    goToWaitRoom,
    enterClassroom,
    clickReadyButton,
    waitAndEnterClassroom,
    drawOnWhiteboard,
    hasDrawingContent,
} from './helpers/whiteboard_helpers';
import { measureSyncLatency } from './helpers/streaming_monitor';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from './test_data/whiteboard_test_data';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

/**
 * 完整教室流程測試
 *
 * 流程說明：
 * 1. 【學生】登入 → 報名課程 → 點擊「進入教室」→ 進入等待頁
 *    → 點擊「立即進入教室」→ 教室頁授予權限 (及處理這次允許)、預覽攝影機、測試聲音、測試麥克風
 *    → 點擊「準備好」→ 保持頁面開啟（等待老師進場）
 *
 * 2. 【老師】（5秒後開始，讓學生先完成報名）
 *    登入 → 進入 /teacher_courses → 點擊「進入教室」→ 教室頁授予權限 (及處理這次允許)、預覽攝影機、測試聲音、測試麥克風
 *    → 點擊「準備好」→ 點擊「立即進入教室 / 開始上課」→ 保持頁面開啟
 *
 * 3. 【學生分頁】老師進場後，回到學生分頁點擊「立即進入教室 / 開始上課」
 */
test('完整課程流程：學生與老師分別開啟網頁，同步進入教室', async ({ browser }) => {
    test.setTimeout(300000);

    console.log('DEBUG: QA_STUDENT_EMAIL =', process.env.QA_STUDENT_EMAIL);
    console.log('DEBUG: QA_TEACHER_EMAIL =', process.env.QA_TEACHER_EMAIL);

    // --- 準備：動態建立測試課程 ---
    const config = getTestConfig();
    const bypassSecret = config.bypassSecret;
    const baseUrl = config.baseUrl;
    const teacherEmail = config.teacherEmail;
    const teacherPassword = config.teacherPassword;
    const studentEmail = config.studentEmail;
    const studentPassword = config.studentPassword;
    const testCourseId = `test-course-${Date.now()}`;
    const teacherContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const studentContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
        console.log(`=== 準備：建立測試課程 ${testCourseId} ===`);
        await injectDeviceCheckBypass(teacherPage);
        await injectDeviceCheckBypass(studentPage);

        await Promise.all([
            autoLogin(teacherPage, teacherEmail, teacherPassword, bypassSecret),
            autoLogin(studentPage, studentEmail, studentPassword, bypassSecret),
        ]);

        await createCourseAsTeacherWithDuration(
            teacherPage,
            testCourseId,
            teacherEmail,
            teacherPassword,
            bypassSecret,
            5
        );

        const adminContext = await browser.newContext();
        const adminPage = await adminContext.newPage();
        await adminApproveCourse(adminPage, testCourseId, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);
        await adminContext.close();

        console.log(`=== 設定學生報名流程 ===`);
        runEnrollmentFlow(testCourseId, teacherEmail, studentEmail);

        await Promise.all([
            goToWaitRoom(teacherPage, testCourseId, 'teacher'),
            goToWaitRoom(studentPage, testCourseId, 'student'),
        ]);

        await enterClassroom(teacherPage, 'teacher');
        await clickReadyButton(teacherPage, 'teacher');
        await enterClassroom(studentPage, 'student');
        await clickReadyButton(studentPage, 'student');

        await Promise.all([
            waitAndEnterClassroom(teacherPage, 'teacher'),
            waitAndEnterClassroom(studentPage, 'student'),
        ]);

        await expect(teacherPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });
        await expect(studentPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });

        await teacherPage.waitForTimeout(6000);
        await drawOnWhiteboard(teacherPage);

        const teacherDrawn = await hasDrawingContent(teacherPage);
        let syncProbe = await measureSyncLatency(studentPage, { maxWaitMs: 20000, pollIntervalMs: 500 });

        // One retry draw reduces false negatives from transient sync lag.
        if (!syncProbe.synced) {
            await drawOnWhiteboard(teacherPage);
            syncProbe = await measureSyncLatency(studentPage, { maxWaitMs: 15000, pollIntervalMs: 500 });
        }

        const studentDrawn = syncProbe.synced;
        console.log(`📊 白板同步延遲: ${syncProbe.latencyMs ?? 'TIMEOUT'}ms`);

        expect(teacherDrawn).toBe(true);
        expect(studentDrawn).toBe(true);
        console.log('🎉 測試通過：雙方進入教室且白板同步正常');
    } finally {
        console.log('🧹 測試結束，清理資料...');
        try {
            const cleanContext = await browser.newContext();
            const cleanPage = await cleanContext.newPage();
            await injectDeviceCheckBypass(cleanPage);
            await autoLogin(cleanPage, ADMIN_EMAIL, ADMIN_PASSWORD, bypassSecret);
            await cleanPage.request.delete(`${baseUrl}/api/courses?id=${testCourseId}`).catch(() => {});
            await cleanPage.request.delete(`${baseUrl}/api/orders?courseId=${testCourseId}`).catch(() => {});
            await cleanContext.close();
        } catch (e) {
            console.error('Cleanup error:', e);
        }

        await teacherContext.close();
        await studentContext.close();
    }
});
