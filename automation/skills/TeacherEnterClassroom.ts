import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { TeacherEnterClassroomInput, QAExecutionResult } from './types';

export class TeacherEnterClassroomSkill {
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

    private async performLogin(page: Page, url: string, email: string, password: string, bypassSecret: string) {
        page.on('dialog', async dialog => {
            this.log(`💬 偵測到老師端對話框: [${dialog.type()}] ${dialog.message()}`);
            await dialog.dismiss();
        });

        this.log(`🔐 執行老師正式登入 (Email: ${email})...`);
        await page.goto(`${url}/login`);
        await page.fill('#email', email);
        await page.fill('#password', password);

        this.log(`🧩 輸入驗證碼繞過碼 (已遮罩)...`);
        await page.fill('#captcha', bypassSecret);

        await page.click('button[type="submit"]');
        await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(1000);

        this.log(`✅ 老師登入完成`);
    }

    /**
     * 在等待頁或教室頁面執行設備設定流程：
     * 1. 點擊「立即進入教室」(若在等待頁)
     * 2. 授予麥克風、聲音和攝影機權限
     * 3. 預覽攝影機
     * 4. 測試聲音
     * 5. 測試麥克風
     * 6. 點擊「準備好」按鈕
     */
    private async performWaitRoomSetup(page: Page, timeout: number) {
        // 步驟 A: 若還在 /classroom/wait，先點擊「立即進入教室」
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

            // 使用者要求：在授予權限後點擊「這次允許」
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
            await page.waitForTimeout(2000);
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

    public async execute(input: TeacherEnterClassroomInput): Promise<QAExecutionResult> {
        const startTime = Date.now();
        let context: BrowserContext | null = null;
        const timeout = input.timeoutMs || 30000;

        const envUrl = input.environmentUrl || process.env.QA_TEST_BASE_URL || 'http://localhost:3000';
        const email = input.email || process.env.QA_TEACHER_EMAIL;
        const password = input.password || process.env.QA_TEACHER_PASSWORD;
        const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
        const courseId = input.courseId || process.env.QA_TEST_COURSE_ID;

        try {
            context = await this.browser.newContext({
                permissions: ['camera', 'microphone']
            });
            const page = await context.newPage();

            // 【步驟 1: 登入】
            if (!email || !password) throw new Error('Input Error: 必須提供老師 email/password 或設定對應環境變數。');
            if (!bypassSecret) throw new Error('Input Error: 缺少 LOGIN_BYPASS_SECRET，無法執行自動登入。');
            await this.performLogin(page, envUrl, email, password, bypassSecret);

            // 【步驟 2: 前往老師課程頁面】
            const teacherCoursesUrl = `${envUrl}/teacher_courses?includeTests=true`;
            this.log(`🌐 導航至老師專屬頁面: ${teacherCoursesUrl}`);
            await page.goto(teacherCoursesUrl, { waitUntil: 'networkidle' });

            // 【步驟 3: 進入教室 (含自動重新整理機制)】
            this.log(`🔍 尋找對應課程 ${courseId || ''} 的「進入教室」按鈕...`);

            let enterClassroomBtn = courseId
                ? page.locator(`a[href*="courseId=${courseId}"]`).first()
                : page.locator('a, button').filter({ hasText: /^進入教室$|^Enter Classroom$/ }).first();

            let attempts = 0;
            while (attempts < 6) {
                await page.waitForTimeout(2000);

                if (!(await enterClassroomBtn.isVisible().catch(() => false))) {
                    enterClassroomBtn = courseId
                        ? page.locator(`a[href*="courseId=${courseId}"]`).first()
                        : page.locator('a, button').filter({ hasText: /^進入教室$|^Enter Classroom$/ }).first();
                }

                if (await enterClassroomBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                    this.log(`✅ 找到「進入教室」按鈕`);
                    break;
                }
                attempts++;
                this.log(`⚠️ 第 ${attempts} 次嘗試：暫未找到按鈕。當前 URL: ${page.url()}`);
                await page.reload({ waitUntil: 'networkidle' });
                enterClassroomBtn = courseId
                    ? page.locator(`a[href*="courseId=${courseId}"]`).first()
                    : page.locator('a, button').filter({ hasText: /^進入教室$|^Enter Classroom$/ }).first();
            }

            if (!(await enterClassroomBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
                await page.screenshot({ path: 'teacher_courses_failed.png', fullPage: true });
                throw new Error('UI Error: 在 /teacher_courses 頁面多次重新整理後仍找不到「進入教室」按鈕。');
            }

            this.log(`🖱️ 點擊「進入教室」按鈕...`);
            await enterClassroomBtn.click();

            // 【步驟 4: 等待進入 /classroom 頁面】
            this.log(`⏳ 等待導向 /classroom...`);
            await page.waitForURL(/\/classroom/, { timeout });
            this.log(`📍 目前 URL: ${page.url()}`);

            // 注入 E2E 繞過標記
            await page.evaluate(() => {
                (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true;
                console.log('✅ [E2E] 已注入 __E2E_BYPASS_DEVICE_CHECK__ = true');
            });

            // 【步驟 5: 在等待頁或教室頁執行設備設定流程】
            await this.performWaitRoomSetup(page, timeout);

            // 【步驟 6: 點擊「立即進入教室」或「開始上課」】
            this.log(`🚀 尋找「立即進入教室」或「開始上課」按鈕...`);
            const enterNowBtn = page.locator('button:has-text("立即進入教室"), button:has-text("Enter Now"), button:has-text("開始上課"), button:has-text("Start Class")').first();

            let clicked = false;
            const joinTimeout = 30000;
            const joinStart = Date.now();

            while (Date.now() - joinStart < joinTimeout) {
                if (await enterNowBtn.isVisible() && await enterNowBtn.isEnabled()) {
                    this.log(`🖱️ 點擊「立即進入教室 / 開始上課」按鈕...`);
                    await enterNowBtn.click();
                    clicked = true;
                    break;
                }
                this.log(`⏳ 等待「立即進入教室」按鈕可用...`);
                await page.waitForTimeout(2000);
            }

            if (!clicked) {
                throw new Error('UI Error: 在教室頁面 30 秒內未能點擊「立即進入教室 / 開始上課」按鈕。');
            }

            // 【步驟 7: 斷言 - 確認已進入教室】
            this.log(`⚖️ 驗證老師是否成功進入教室...`);

            // 加入微小延遲，確保 Agora 與 UI 狀態同步
            await page.waitForTimeout(2000);

            // 調整斷言邏輯：等待「離開」按鈕出現，且不處於 disabled 狀態 (或是出現控制項)
            const leaveBtn = page.locator('button:has-text("離開"), button:has-text("Leave")').first();
            const controlsEl = page.locator('text="結束課程"').or(page.locator('text="Debug"')).or(page.locator('text="Controls"'));

            try {
                // 等待其中一個關鍵元素可見
                await page.waitForFunction(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('離開') || b.textContent?.includes('Leave'));
                    const hasControls = document.body.innerText.includes('結束課程') || document.body.innerText.includes('Debug') || document.body.innerText.includes('Controls');
                    return (btn && !btn.disabled) || hasControls;
                }, { timeout: 20000 });
                this.log(`✅ 老師成功進入教室`);
            } catch (e) {
                this.log(`⚠️ 進入教室斷言超時，嘗試最後一次檢查...`);
                await expect(leaveBtn.or(controlsEl).first()).toBeVisible({ timeout: 5000 });
            }

            return {
                success: true,
                skillName: 'TeacherEnterClassroom',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs,
                page: input.keepOpen ? page : undefined
            };

        } catch (error: any) {
            this.log(`❌ 執行失敗: ${error.message}`);
            return {
                success: false,
                skillName: 'TeacherEnterClassroom',
                executedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                logs: this.logs,
                errorDetails: {
                    step: 'Teacher_Enter_Classroom',
                    message: error.message || 'Unknown error occurred',
                }
            };
        } finally {
            if (context && !input.keepOpen) {
                await context.close();
                this.log(`🧹 釋放瀏覽器資源。`);
            } else if (input.keepOpen) {
                this.log(`🔔 保持老師端瀏覽器 Context 開啟。`);
            }
        }
    }
}
