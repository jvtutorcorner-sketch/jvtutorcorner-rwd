import { test, expect } from '@playwright/test';
import {
    injectDeviceCheckBypass,
    autoLogin,
    createCourseAsTeacherWithDuration,
    adminApproveCourse,
    runEnrollmentFlow,
    goToWaitRoom,
} from './helpers/whiteboard_helpers';
import { getTestConfig, ADMIN_EMAIL, ADMIN_PASSWORD } from './test_data/whiteboard_test_data';
import dotenv from 'dotenv';
import path from 'path';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL || 'lin@test.com';
const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD || '<SECRET>';
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'student@test.com';

test.describe('Classroom Wait Page Verification', () => {
    test('Verify wait page elements and device bypass', async ({ browser }) => {
        const config = getTestConfig();
        const teacherContext = await browser.newContext();
        const teacherPage = await teacherContext.newPage();
        const courseId = `wait-verify-${Date.now()}`;

        try {
            await injectDeviceCheckBypass(teacherPage);
            await autoLogin(teacherPage, TEACHER_EMAIL, TEACHER_PASSWORD, config.bypassSecret);

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

            await goToWaitRoom(teacherPage, courseId, 'teacher');
            await expect(teacherPage).toHaveURL(/\/classroom\/wait/, { timeout: 30000 });

            const readyBtn = teacherPage
                .locator('button')
                .filter({ hasText: /點擊表示準備好|準備好|Ready/i })
                .first();
            await expect(readyBtn).toBeVisible({ timeout: 15000 });
            await expect(readyBtn).toBeEnabled({ timeout: 15000 });
        } finally {
            const adminContext = await browser.newContext();
            const adminPage = await adminContext.newPage();
            await injectDeviceCheckBypass(adminPage);
            await autoLogin(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, config.bypassSecret);
            await adminPage.request.delete(`${config.baseUrl}/api/courses?id=${courseId}`).catch(() => {});
            await adminPage.request.delete(`${config.baseUrl}/api/orders?courseId=${courseId}`).catch(() => {});
            await adminContext.close();
            await teacherContext.close();
        }
    });
});
