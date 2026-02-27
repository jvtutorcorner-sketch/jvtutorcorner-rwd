import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { StudentEnrollAndEnterClassroomInput, QAExecutionResult } from './types';

export class StudentEnrollAndEnterClassroomSkill {
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

    private async performLogin(page: Page, url: string, email: string, password: string) {
        page.on('dialog', async dialog => {
            this.log(`💬 偵測到對話框: [${dialog.type()}] ${dialog.message()}`);
            await dialog.dismiss();
        });

        this.log(`🔐 執行正式登入流程 (Email: ${email})...`);
        await page.goto(`${url}/login`);
        await page.fill('#email', email);
        await page.fill('#password', password);

        this.log(`🧩 輸入萬用驗證碼 (qa_bypass_0816) 以繞過 Captcha...`);
        await page.fill('#captcha', 'qa_bypass_0816');

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            page.click('button[type="submit"]')
        ]);

        this.log(`✅ 登入表單提交完成`);
    }

    /**
     * 在等待頁或教室頁面執行設備設定流程
     */
    private async performWaitRoomSetup(page: Page, timeout: number) {
        if (page.url().includes('/classroom/wait')) {
            this.log(`📍 偵測到等待頁面，點擊「立即進入教室」...`);
            const enterNowBtn = page.locator('button:has-text("立即進入教室"), button:has-text("Enter Now")').first();
            try {
                await enterNowBtn.waitFor({ state: 'visible', timeout: 10000 });
                await enterNowBtn.click();
                await page.waitForURL(/\/classroom(?!\/wait)/, { timeout });
                this.log(`✅ 已離開等待頁，前往教室`);
            } catch (e) {
                this.log(`⚠️ 未找到等待頁「立即進入教室」按鈕，繼續執行...`);
            }
        }

        // 步驟 B: 授予麥克風、聲音和攝影機權限
        this.log(`🎙️ 尋找「授予麥克風、聲音和攝影機權限」按鈕...`);
        const grantBtn = page.locator('button:has-text("授予麥克風"), button:has-text("Grant")').first();
        try {
            await grantBtn.waitFor({ state: 'visible', timeout: 5000 });
            await grantBtn.click();
            this.log(`✅ 已點擊授予權限按鈕`);

            // 使用者要求：在授予權限後先偵測頁面權限是否已變更為「權限已授予」
            this.log(`🛰️ 等待頁面顯示「權限已授予」訊息...`);
            const grantedMsg = page.locator('div:has-text("權限已授予"), div:has-text("Permissions granted")').first();
            await grantedMsg.waitFor({ state: 'visible', timeout: 10000 });
            this.log(`✅ 頁面確認權限已授予`);

            // 使用者要求：在授予權限後點擊「這次允許」(如果仍出現)
            this.log(`🛰️ 偵測是否出現「這次允許」按鈕...`);
            const allowOnceBtn = page.locator('button:has-text("這次允許"), button:has-text("Allow once")').first();
            if (await allowOnceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await allowOnceBtn.click();
                this.log(`✅ 已點擊「這次允許」按鈕`);
            }
            await page.waitForTimeout(1000);
        } catch (e) {
            this.log(`⚠️ 權限授予流程超時或未找到按鈕，繼續執行後續動作...`);
        }

        // 步驟 C: 預覽攝影機
        this.log(`📹 尋找「預覽攝影機」按鈕...`);
        const cameraBtn = page.locator('button:has-text("預覽攝影機"), button:has-text("Preview Camera")').first();
        try {
            await cameraBtn.waitFor({ state: 'visible', timeout: 5000 });
            await cameraBtn.click();
            await page.waitForTimeout(1000);
            this.log(`✅ 已點擊預覽攝影機按鈕`);
        } catch (e) {
            this.log(`⚠️ 未找到預覽攝影機按鈕，繼續...`);
        }

        // 步驟 D: 測試聲音
        this.log(`🔊 尋找「測試聲音」按鈕...`);
        const soundBtn = page.locator('button:has-text("測試聲音"), button:has-text("Test Sound")').first();
        try {
            await soundBtn.waitFor({ state: 'visible', timeout: 5000 });
            await soundBtn.click();
            await page.waitForTimeout(1000);
            this.log(`✅ 已點擊測試聲音按鈕`);
        } catch (e) {
            this.log(`⚠️ 未找到測試聲音按鈕，繼續...`);
        }

        // 步驟 E: 測試麥克風
        this.log(`🎤 尋找「測試麥克風」按鈕...`);
        const micBtn = page.locator('button:has-text("測試麥克風"), button:has-text("Test Mic")').first();
        try {
            await micBtn.waitFor({ state: 'visible', timeout: 5000 });
            await micBtn.click();
            await page.waitForTimeout(2000); // 讓它測試一下
            const stopMicBtn = page.locator('button:has-text("停止測試")').first();
            if (await stopMicBtn.isVisible().catch(() => false)) {
                await stopMicBtn.click();
                await page.waitForTimeout(500);
            }
            this.log(`✅ 已完成麥克風測試`);
        } catch (e) {
            this.log(`⚠️ 未找到測試麥克風按鈕，繼續...`);
        }

        // 步驟 F: 點擊「準備好」按鈕
        this.log(`🟢 尋找「點擊表示準備好」按鈕...`);
        const readyBtn = page.locator('button:has-text("點擊表示準備好"), button:has-text("Ready"), button:has-text("準備好")').first();
        try {
            await readyBtn.waitFor({ state: 'visible', timeout: 10000 });
            await readyBtn.click();
            await page.waitForTimeout(1000);
            this.log(`✅ 已點擊「準備好」按鈕`);
        } catch (e) {
            this.log(`⚠️ 未找到「準備好」按鈕，繼續...`);
        }
    }

    public async execute(input: StudentEnrollAndEnterClassroomInput): Promise<QAExecutionResult> {
        const startTime = Date.now();
        let context: BrowserContext | null = null;
        const timeout = input.timeoutMs || 30000;

        const envUrl = input.environmentUrl || process.env.QA_TEST_BASE_URL || 'http://localhost:3000';
        const courseId = input.courseId || process.env.QA_TEST_COURSE_ID || '54837221-b952-4c70-bd83-0e026f735ff2';
        const email = input.email || process.env.QA_STUDENT_EMAIL;
        const password = input.password || process.env.QA_STUDENT_PASSWORD;

        try {
            context = await this.browser.newContext({
                permissions: ['camera', 'microphone']
            });
            const page = await context.newPage();

            if (!email || !password) throw new Error('Input Error: 必須提供 email/password。');
            await this.performLogin(page, envUrl, email, password);

            const courseUrl = `${envUrl}/courses/${courseId}`;
            this.log(`🌐 前往課程頁面: ${courseUrl}`);
            await page.goto(courseUrl, { waitUntil: 'networkidle' });

            const enrollBtn = page.locator('button').filter({ hasText: /^報名$|^Enroll$|^立即報名/ }).first();
            await enrollBtn.waitFor({ state: 'visible', timeout });

            this.log(`🖱️ 點擊「報名」按鈕...`);
            const [enrollResponse] = await Promise.all([
                page.waitForResponse(resp => resp.url().includes('/api/orders') && resp.request().method() === 'POST', { timeout }),
                enrollBtn.click()
            ]);
            this.log(`✅ 報名已執行 (Status: ${enrollResponse.status()})`);

            await page.waitForURL('**/student_courses', { timeout: 15000 });
            this.log(`✅ 已完成自動跳轉至我的課程`);

            const enterClassroomBtn = page.locator('a, button').filter({ hasText: /^進入教室$|^Enter Classroom$/ }).first();
            await enterClassroomBtn.waitFor({ state: 'visible', timeout });
            await enterClassroomBtn.click();

            await page.waitForURL(/\/classroom/, { timeout });
            this.log(`📍 目前 URL: ${page.url()}`);

            await this.performWaitRoomSetup(page, timeout);

            this.log(`✅ 學生設備設定完成`);

            return {
                success: true,
                skillName: 'StudentEnrollAndEnterClassroom',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs,
                page: input.keepOpen ? page : undefined
            };

        } catch (error: any) {
            this.log(`❌ 執行失敗: ${error.message}`);
            return {
                success: false,
                skillName: 'StudentEnrollAndEnterClassroom',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs,
                errorDetails: {
                    step: 'Student_Enroll_And_Enter',
                    message: error.message || 'Unknown error occurred',
                }
            };
        } finally {
            if (context && !input.keepOpen) {
                await context.close();
                this.log(`🧹 釋放瀏覽器資源。`);
            } else if (input.keepOpen) {
                this.log(`🔔 保持學生端瀏覽器 Context 開啟。`);
            }
        }
    }
}
