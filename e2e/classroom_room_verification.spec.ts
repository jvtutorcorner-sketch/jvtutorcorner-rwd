import { test, expect } from '@playwright/test';
import {
    injectDeviceCheckBypass,
    autoLogin,
    createCourseAsTeacherWithDuration,
    adminApproveCourse,
    runEnrollmentFlow,
    goToWaitRoom,
    clickReadyButton,
    waitAndEnterClassroom,
} from './helpers/whiteboard_helpers';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from './test_data/whiteboard_test_data';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD || '<SECRET>';
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'student@test.com';
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || '<SECRET>';

test.describe('Classroom Room Page Verification', () => {
    test.setTimeout(180000);

    test('Verify room page elements: whiteboard and controls', async ({ browser }) => {
        const config = getTestConfig();
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();
        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();
        const courseId = `room-verify-${Date.now()}`;

        try {
            await Promise.all([
                injectDeviceCheckBypass(teacherPage),
                injectDeviceCheckBypass(studentPage),
            ]);

            await Promise.all([
                autoLogin(teacherPage, TEACHER_EMAIL, TEACHER_PASSWORD, config.bypassSecret),
                autoLogin(studentPage, STUDENT_EMAIL, STUDENT_PASSWORD, config.bypassSecret),
            ]);

            await createCourseAsTeacherWithDuration(
                teacherPage,
                courseId,
                TEACHER_EMAIL,
                TEACHER_PASSWORD,
                config.bypassSecret,
                5
            );

            const adminContext = await browser.newContext();
            const adminPage = await adminContext.newPage();
            await adminApproveCourse(adminPage, courseId, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
            await adminContext.close();

            await runEnrollmentFlow(courseId, TEACHER_EMAIL, STUDENT_EMAIL);

            await Promise.all([
                goToWaitRoom(teacherPage, courseId, 'teacher'),
                goToWaitRoom(studentPage, courseId, 'student'),
            ]);

            await clickReadyButton(teacherPage, 'teacher');
            await clickReadyButton(studentPage, 'student');

            await Promise.all([
                waitAndEnterClassroom(teacherPage, 'teacher'),
                waitAndEnterClassroom(studentPage, 'student'),
            ]);

            await expect(teacherPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });
            await expect(studentPage).toHaveURL(/\/classroom\/room/, { timeout: 30000 });

            const whiteboard = teacherPage.locator('canvas:visible').first();
            await expect(whiteboard).toBeVisible({ timeout: 20000 });

            const leaveBtn = teacherPage
                .locator('button')
                .filter({ hasText: /離開|Leave|結束課程|End/i });
            const leaveCount = await leaveBtn.count();
            expect(leaveCount).toBeGreaterThan(0);
        } finally {
            const adminContext = await browser.newContext();
            const adminPage = await adminContext.newPage();
            await injectDeviceCheckBypass(adminPage);
            await autoLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
            await adminPage.request.delete(`${config.baseUrl}/api/courses?id=${courseId}`).catch(() => {});
            await adminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
            await adminContext.close();
            await Promise.all([teacherContext.close(), studentContext.close()]);
        }
    });
});
