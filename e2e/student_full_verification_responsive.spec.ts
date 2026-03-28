import { test, expect } from '@playwright/test';
import { TeacherEnterClassroomSkill } from '../automation/skills';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test('學生付款報名到上課與倒數計時測試 (響應式包含電腦版與縮小版)', async ({ browser }) => {
    // 增加超時時間，因為流程很長
    test.setTimeout(240000); 

    const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || 'jv_secret_bypass_2024'; 
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const teacherEmail = process.env.QA_TEACHER_EMAIL || 'lin@test.com';
    const studentEmail = process.env.QA_STUDENT_EMAIL || 'pro@test.com';
    const password = '123456';
    const testCourseId = `test-course-full-${Date.now()}`;
    
    // ============================================
    // 1. 後台 API 準備資料: 建立課程並清空學生點數
    // ============================================
    const apiContext = await browser.newContext();
    try {
        console.log(`[準備] 建立測試課程: ${testCourseId}`);
        // Login as Teacher to get ID
        const loginRes = await apiContext.request.post(`${baseUrl}/api/login`, {
            data: { email: teacherEmail, password, captchaValue: bypassSecret }
        });
        const teacherData = await loginRes.json();
        const teacherId = teacherData.profile?.id || 't1';
        
        await apiContext.request.post(`${baseUrl}/api/courses`, {
            data: {
                id: testCourseId,
                title: `Full Flow Course - ${Date.now()}`,
                teacherId: teacherId,
                teacherName: "Teacher Flow",
                enrollmentType: "points",
                pointCost: 10,
                status: '上架',
                startDate: new Date(Date.now() - 5*60000).toISOString(), // 5 minutes ago to start now
                endDate: new Date(Date.now() + 30*86400000).toISOString(),
            }
        });

        // Reset Student points to 0
        console.log(`[準備] 重置學生 (${studentEmail}) 點數為 0...`);
        await apiContext.request.post(`${baseUrl}/api/points`, {
            data: { userId: studentEmail, action: 'set', amount: 0, reason: 'E2E Full Flow Test Reset' }
        });

        console.log(`[準備] 清理學生 ${studentEmail} 既有訂單，避免時間衝突...`);
        const oldOrdersRes = await apiContext.request.get(`${baseUrl}/api/orders?userId=${studentEmail}&limit=50`);
        const oldOrdersData = await oldOrdersRes.json();
        if (oldOrdersData?.ok && oldOrdersData.data) {
            for (const order of oldOrdersData.data) {
                const oid = order.orderId || order.id;
                if (oid) {
                    await apiContext.request.delete(`${baseUrl}/api/orders/${oid}`);
                }
            }
        }
    } finally {
        await apiContext.close();
    }

    // ============================================
    // 2. 學生端流程: 登入 -> 購買點數 -> 報名
    // ============================================
    const studentContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const teacherContext = await browser.newContext({ permissions: ['camera', 'microphone'] });

    try {
        const studentPage = await studentContext.newPage();
        
        // 設定為桌面版面
        await studentPage.setViewportSize({ width: 1280, height: 720 });
        
        console.log(`[學生] 執行登入流程...`);
        await studentPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
        await studentPage.waitForTimeout(1000); // let React state settle
        await studentPage.fill('input[type="email"], #email', studentEmail);
        await studentPage.fill('input[type="password"], #password', password);
        await studentPage.fill('input[placeholder*="圖片"], #captcha', bypassSecret);
        
        // 設定 dialog 自動接受
        studentPage.on('dialog', async dialog => {
            console.log(`[學生] Dialog: ${dialog.message()}`);
            await dialog.accept();
        });
        
        await studentPage.click('button[type="submit"]');
        await studentPage.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 });
        console.log(`[學生] 登入成功`);
        
        console.log(`[學生] 前往購買點數...`);
        await studentPage.goto(`${baseUrl}/pricing`);
        await studentPage.locator('a:has-text("購買點數")').first().click();
        await studentPage.waitForURL(/\/pricing\/checkout/);
        await studentPage.click('button:has-text("模擬支付 (Demo)")');
        await studentPage.waitForURL(url => url.pathname === '/plans' || url.pathname === '/pricing', { timeout: 30000 });
        console.log(`[學生] 模擬支付完成`);

        console.log(`[學生] 前往課程頁面報名...`);
        await studentPage.goto(`${baseUrl}/courses/${testCourseId}`);
        
        // 按下報名按鈕
        const enrollBtn = studentPage.locator('button:has-text("立即報名"), button:has-text("立即報名課程")').first();
        await enrollBtn.waitFor({ state: 'visible', timeout: 10000 });
        await enrollBtn.click();
        
        // 在彈窗選擇點數報名並確認
        const confirmBtn = studentPage.locator('button:has-text("確認報名")').first();
        await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
        
        // 填寫最近時間，以確保「進入教室」按鈕會出現
        const startTimeInput = studentPage.locator('#start-time');
        if (await startTimeInput.isVisible().catch(() => false)) {
            const defaultDate = new Date();
            defaultDate.setMinutes(defaultDate.getMinutes() - 5);
            const tzoffset = defaultDate.getTimezoneOffset() * 60000;
            const localTime = (new Date(defaultDate.getTime() - tzoffset)).toISOString().slice(0, 16);
            await startTimeInput.fill(localTime);
            console.log(`[學生] 填寫課程時間: ${localTime}`);
        }

        const pointsTab = studentPage.locator('button:has-text("點數報名")');
        if (await pointsTab.isVisible()) await pointsTab.click();
        await confirmBtn.click();

        await studentPage.waitForURL('**/student_courses', { timeout: 15000 });
        console.log(`[學生] 報名完成，已回到 /student_courses`);

        // ============================================
        // 3. 學生與老師進入教室 (使用老師 Skill)
        // ============================================
        // 學生點擊進入教室
        const maxAttempts = 5;
        let attempts = 0;
        const enterClassroomBtn = studentPage.locator('a, button').filter({ hasText: /^進入教室$|^Enter Classroom$/ }).first();
        while (attempts < maxAttempts) {
            try {
                await enterClassroomBtn.waitFor({ state: 'visible', timeout: 5000 });
                break; 
            } catch(e) {
                attempts++;
                await studentPage.reload({ waitUntil: 'networkidle' });
            }
        }
        await enterClassroomBtn.click();
        await studentPage.waitForURL(/\/classroom/, { timeout: 15000 });
        
        // 繞過設備檢測並設定好
        await studentPage.evaluate(() => { (window as any).__E2E_BYPASS_DEVICE_CHECK__ = true; });
        const studentGrantBtn = studentPage.locator('button:has-text("授予麥克風"), button:has-text("Grant")').first();
        if (await studentGrantBtn.isVisible({ timeout: 5000 }).catch(()=>false)) {
            await studentGrantBtn.click();
        }
        const readyBtn = studentPage.locator('button:has-text("點擊表示準備好"), button:has-text("Ready"), button:has-text("準備好")').first();
        await readyBtn.waitFor({ state: 'visible', timeout: 10000 });
        await readyBtn.click();
        console.log(`[學生] 已準備好，等待老師...`);

        // 同時讓老師進教室 (使用 Skill)
        console.log(`[老師] 使用 TeacherEnterClassroomSkill 執行進場流程...`);
        const teacherSkill = new TeacherEnterClassroomSkill(browser);
        const teacherResult = await teacherSkill.execute({
            email: teacherEmail,
            password: password,
            courseId: testCourseId,
            environmentUrl: baseUrl,
            keepOpen: true // 需要保持頁面以持續 Session
        });

        if (!teacherResult.success) {
            console.error(`[老師] 老師進場失敗: ${teacherResult.errorDetails?.message}`);
            throw new Error(`Teacher Skill failed: ${teacherResult.errorDetails?.message}`);
        }
        
        const teacherPage = teacherResult.page!;
        console.log(`[老師] 老師已進入上課教室`);
        
        // ============================================
        // 4. 開始上課並驗證倒數計時與版面顯示
        // ============================================
        await studentPage.bringToFront();
        // 給予狀態同步一些時間
        await studentPage.waitForTimeout(3000);
        const studentJoinBtn = studentPage.locator('button:has-text("立即進入教室"), button:has-text("開始上課"), button:has-text("Enter Now")').first();
        await studentJoinBtn.waitFor({ state: 'visible', timeout: 15000 });
        await studentJoinBtn.click();
        
        // 驗證進入 /classroom/room
        await studentPage.waitForURL(/\/classroom\/room/, { timeout: 15000 });
        console.log(`[學生] 進入上課教室 /classroom/room`);

        // 給予 classroom layout 與 agora 初始化一些時間
        await studentPage.waitForTimeout(5000);

        // 驗證倒數計時
        await studentPage.locator('text="初始化白板中..."').waitFor({ state: 'hidden', timeout: 45000 }).catch(() => {});
        const timerElement = studentPage.locator('text=剩餘時間').first().or(studentPage.locator('text="Remaining time"').first());
        await expect(timerElement).toBeVisible({ timeout: 30000 });
        const timerContainer = timerElement.locator('..'); // 取得包含時間數字的父層 
        const timerText = await timerContainer.textContent();
        console.log(`[學生] 觀察到計時器文字: ${timerText}`);
        expect(timerText).toMatch(/[0-9]+:[0-5][0-9]/);

        // 驗證主要 UI 在電腦版下已完整顯示無溢出
        console.log(`[驗證] 電腦版 (1280x720) 版面檢查...`);
        await expect(timerElement).toBeInViewport();
        
        // ============================================
        // 5. 驗證縮下至低於 640px 時的手機版面
        // ============================================
        console.log(`[驗證] 縮小至手機版面 (375x812)...`);
        await studentPage.setViewportSize({ width: 375, height: 812 });
        await studentPage.waitForTimeout(2000); // 讓版面重排
        
        // 驗證在手機版下計時器依然能被捲動至可見範圍
        await timerElement.scrollIntoViewIfNeeded();
        await expect(timerElement).toBeInViewport();
        
        console.log(`[成功] 電腦與手機版面主要 UI 皆能正常顯示。測試通過！`);
        
    } finally {
        // ============================================
        // 6. 清理資源: 刪除測試課程、報名紀錄與重置狀態
        // ============================================
        console.log(`[清理] 執行全面清理流程...`);
        const cleanupContext = await browser.newContext();
        try {
            // 1. 刪除課程
            console.log(`[清理] 刪除測試課程: ${testCourseId}`);
            await cleanupContext.request.delete(`${baseUrl}/api/courses/${testCourseId}`);
            
            // 2. 刪除相關報名紀錄 (Enrollments)
            console.log(`[清理] 刪除學生報名紀錄...`);
            const enrollRes = await cleanupContext.request.get(`${baseUrl}/api/enroll`);
            const enrollData = await enrollRes.json();
            if (enrollData?.ok && enrollData.data) {
                const studentEnrollments = enrollData.data.filter((e: any) => e.email === studentEmail && e.courseId === testCourseId);
                for (const enr of studentEnrollments) {
                    await cleanupContext.request.delete(`${baseUrl}/api/enroll?id=${enr.id}`);
                }
            }

            // 3. 重置點數
            await cleanupContext.request.post(`${baseUrl}/api/points`, {
                data: { userId: studentEmail, action: 'set', amount: 0, reason: 'E2E Cleanup' }
            });
        } catch (e) {
            console.warn(`[清理] 警告: 清理過程發生錯誤: ${e}`);
        } finally {
            await cleanupContext.close();
            await studentContext.close();
            await teacherContext.close();
        }
    }
});
