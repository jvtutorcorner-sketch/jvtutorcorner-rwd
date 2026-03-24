import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { ClassroomSyncInput, QAExecutionResult } from './types';

export class VerifyClassroomTerminationSyncSkill {
    private browser: Browser;
    private logs: string[] = [];

    constructor(browser: Browser) {
        this.browser = browser;
    }

    private log(message: string) {
        const timestamp = new Date().toISOString();
        const logMsg = `[${timestamp}] ${message}`;
        console.log(logMsg);
        this.logs.push(logMsg);
    }

    // 步驟 1: 執行正式登入或繞過
    private async performLogin(page: Page, url: string, email?: string, password?: string, universalCode?: string) {
        if (email && password) {
            this.log(`🔐 執行正式登入流程 (Email: ${email})...`);
            await page.goto(`${url}/login`);
            await page.fill('#email', email);
            await page.fill('#password', password);
            await page.fill('#captcha', 'jv_secret_bypass_2024');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle' }),
                page.click('button[type="submit"]')
            ]);
            this.log(`✅ 登入完成`);
        } else if (universalCode) {
            this.log(`🔧 注入萬用驗證碼 (Token: ${universalCode.substring(0, 4)}***)...`);
            await page.context().addCookies([{
                name: 'auth_token',
                value: universalCode,
                domain: new URL(url).hostname,
                path: '/',
            }]);
        }
    }

    public async execute(input: ClassroomSyncInput): Promise<QAExecutionResult> {
        const startTime = Date.now();
        let teacherContext: BrowserContext | null = null;
        let studentContext: BrowserContext | null = null;
        const timeout = input.syncTimeoutMs || 10000;

        // 從環境變數讀取預設值
        const envUrl = input.environmentUrl || process.env.QA_TEST_BASE_URL || 'http://localhost:3000';
        const teacherEmail = input.teacherEmail || process.env.QA_TEACHER_EMAIL;
        const teacherPass = input.teacherPassword || process.env.QA_TEACHER_PASSWORD;
        const studentEmail = input.studentEmail || process.env.QA_STUDENT_EMAIL;
        const studentPass = input.studentPassword || process.env.QA_STUDENT_PASSWORD;

        try {
            this.log(`🚀 開始連線同步驗證：模擬老師結束課程...`);
            teacherContext = await this.browser.newContext();
            studentContext = await this.browser.newContext();

            const teacherPage = await teacherContext.newPage();
            const studentPage = await studentContext.newPage();

            const classroomId = input.classroomId || process.env.QA_TEST_COURSE_ID;
            const classroomUrl = `${envUrl}/classroom/test/${classroomId}`;

            this.log(`🧑‍🏫 老師正在準備進入教室...`);
            await this.performLogin(teacherPage, envUrl, teacherEmail, teacherPass, input.teacherUniversalCode);
            await teacherPage.goto(classroomUrl);

            this.log(`🧑‍🎓 學生正在準備進入教室...`);
            await this.performLogin(studentPage, envUrl, studentEmail, studentPass, input.studentUniversalCode);
            await studentPage.goto(classroomUrl);

            // 確認雙方都在教室
            await expect(teacherPage.locator('button:has-text("結束課程"), button:has-text("End Class")')).toBeVisible({ timeout: 10000 });
            this.log(`✅ 雙方已成功就位`);

            // 老師結束課程
            this.log(`🖱️ 老師點擊「結束課程」...`);
            const endBtn = teacherPage.locator('button:has-text("結束課程"), button:has-text("End Class")');
            await endBtn.click();

            const confirmBtn = teacherPage.locator('button:has-text("確認結束"), button:has-text("Confirm End")');
            if (await confirmBtn.isVisible({ timeout: 2000 })) {
                await confirmBtn.click();
            }

            // 驗證學生同步退出
            this.log(`⚖️ 驗證學生端同步退出機制 (Timeout: ${timeout}ms)...`);
            await expect(studentPage).toHaveURL(/\/classroom\/wait|\/student_courses/, { timeout });
            this.log(`✅ 學生端已同步跳轉，驗證通過！`);

            return {
                success: true,
                skillName: 'VerifyClassroomTerminationSync',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs
            };

        } catch (error: any) {
            this.log(`❌ 同步驗證失敗: ${error.message}`);
            return {
                success: false,
                skillName: 'VerifyClassroomTerminationSync',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs,
                errorDetails: {
                    step: 'Classroom_Termination_Sync',
                    message: error.message || 'Unknown error occurred',
                }
            };
        } finally {
            if (teacherContext) await teacherContext.close();
            if (studentContext) await studentContext.close();
            this.log(`🧹 資源已清理`);
        }
    }
}
