import { test, expect } from '@playwright/test';
import {
    StudentEnrollAndEnterClassroomSkill,
    TeacherEnterClassroomSkill
} from '../automation/skills';
import dotenv from 'dotenv';
import path from 'path';

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
    test.setTimeout(180000); // 3分鐘，給足時間完成所有步驟

    console.log('DEBUG: QA_STUDENT_EMAIL =', process.env.QA_STUDENT_EMAIL);
    console.log('DEBUG: QA_TEACHER_EMAIL =', process.env.QA_TEACHER_EMAIL);

    // --- 準備：動態建立測試課程 ---
    const bypassSecret = process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || 'jv_secret_bypass_2024'; 
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const teacherEmail = process.env.QA_TEACHER_EMAIL || 'lin@test.com';
    const studentEmail = process.env.QA_STUDENT_EMAIL || 'pro@test.com';
    const testCourseId = `test-course-${Date.now()}`;
    
    const apiContext = await browser.newContext();
    try {
        console.log(`=== 準備：建立測試課程 ${testCourseId} ===`);
        const loginRes = await apiContext.request.post(`${baseUrl}/api/login`, {
            data: JSON.stringify({ email: teacherEmail, password: '123456', captchaValue: bypassSecret }),
            headers: { 'Content-Type': 'application/json' }
        });
        const teacherData = await loginRes.json();
        const teacherId = teacherData.profile?.id || 't1';
        // Match UI logic in teacher_courses/page.tsx: use lastName + "老師" if nickname/displayName is missing
        const profile = teacherData.profile;
        const teacherName = profile?.nickname || profile?.displayName || (profile?.lastName ? `${profile.lastName}老師` : 'Test Teacher');
        
        // 建立課程
        await apiContext.request.post(`${baseUrl}/api/courses`, {
            data: JSON.stringify({
                id: testCourseId,
                title: `Classroom Flow 測試課程-${Date.now()}`,
                teacherId: teacherId,
                teacherName: teacherName,
                enrollmentType: "points",
                pointCost: 10,
                status: '上架',
                startDate: new Date(Date.now() - 10*60000).toISOString(),
                endDate: new Date(Date.now() + 30*86400000).toISOString(),
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log(`設定學生點數 (${studentEmail})...`);
        await apiContext.request.post(`${baseUrl}/api/points`, {
            data: JSON.stringify({ userId: studentEmail, action: 'set', amount: 100, reason: 'E2E Init' }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log(`清理學生 ${studentEmail} 既有訂單，避免時間衝突...`);
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
    // --- 準備完畢 ---

    const studentSkill = new StudentEnrollAndEnterClassroomSkill(browser);
    const teacherSkill = new TeacherEnterClassroomSkill(browser);

    const pagesToClose: any[] = [];

    try {
        // ═══════════════════════════════════════════
        // 步驟 1 & 2：學生與老師「並行」進行準備
        // 學生：報名 → 進入等待/教室頁 → 設備設定 → 準備好
        // 老師：(5秒延遲) 登入 → 進入教室頁 → 設備設定 → 準備好 → 點擊「開始上課」
        // ═══════════════════════════════════════════
        console.log('=== 開始並行學生報名與老師準備 ===');

        const [studentResult, teacherResult] = await Promise.all([
            (async () => {
                console.log('--- [Student] 學生開始 ---');
                const result = await studentSkill.execute({ keepOpen: true, courseId: testCourseId });
                console.log('--- [Student] 學生設備設定完成，success:', result.success, '---');
                return result;
            })(),
            (async () => {
                // 等待 5 秒讓學生先完成報名流程
                console.log('--- [Teacher] 老師等待 5 秒（讓學生完成報名）---');
                await new Promise(r => setTimeout(r, 5000));
                console.log('--- [Teacher] 老師開始進場 ---');
                const result = await teacherSkill.execute({ keepOpen: true, courseId: testCourseId });
                console.log('--- [Teacher] 老師進場完成，success:', result.success, '---');
                return result;
            })(),
        ]);

        // 收集所有頁面供最後清理
        if (studentResult.page) pagesToClose.push(studentResult.page);
        if (teacherResult.page) pagesToClose.push(teacherResult.page);

        // 確認學生設備設定成功
        if (!studentResult.success) {
            throw new Error(`測試失敗 (學生端): ${studentResult.errorDetails?.message}`);
        }
        // 確認老師進場成功
        if (!teacherResult.success) {
            throw new Error(`測試失敗 (老師端): ${teacherResult.errorDetails?.message}`);
        }

        // ═══════════════════════════════════════════
        // 步驟 3：老師進場完成後，回到學生分頁點擊「立即進入教室」
        // ═══════════════════════════════════════════
        const studentPage = studentResult.page;
        const teacherPage = teacherResult.page;

        console.log('=== 步驟 3：回到學生分頁，點擊「立即進入教室 / 開始上課」===');

        // 使用者要求：強制切換到學生分頁
        await studentPage.bringToFront();
        console.log('--- [Student] 已將學生分頁置於最前 ---');
        console.log('--- 學生目前 URL:', studentPage.url(), '---');

        // 點擊學生頁面的「立即進入教室」或「開始上課」按鈕
        // 老師進場後 canJoin = true，此按鈕應已啟用
        // 增加一個緩衝等待，確保老師端的狀態變更已廣播
        await studentPage.waitForTimeout(3000);

        const studentJoinBtn = studentPage.locator(
            'button:has-text("立即進入教室"), button:has-text("開始上課"), button:has-text("Enter Now"), button:has-text("Start Class")'
        ).first();

        let studentClicked = false;
        const joinTimeout = 40000; // 增加超時時間
        const joinStart = Date.now();

        while (Date.now() - joinStart < joinTimeout) {
            if (await studentJoinBtn.isVisible() && await studentJoinBtn.isEnabled()) {
                console.log('--- [Student] 點擊「立即進入教室 / 開始上課」---');
                await studentJoinBtn.click();
                studentClicked = true;
                break;
            }
            console.log('--- [Student] 等待「立即進入教室」按鈕啟用... ---');
            await studentPage.waitForTimeout(2000);
        }

        if (!studentClicked) {
            throw new Error('測試失敗 (學生端): 30 秒內未能點擊「立即進入教室」按鈕。');
        }

        // ═══════════════════════════════════════════
        // 步驟 4：驗證雙方皆在教室內
        // ═══════════════════════════════════════════
        console.log('=== 步驟 4：驗證雙方皆在教室內 ===');

        // 驗證學生是否成功進入 (使用與老師相同的強健斷言邏輯)
        console.log('--- [Student] ⚖️ 驗證學生是否成功進入教室... ---');
        try {
            await studentPage.waitForFunction(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('離開') || b.textContent?.includes('Leave'));
                const hasControls = document.body.innerText.includes('結束課程') || document.body.innerText.includes('Debug') || document.body.innerText.includes('Controls');
                return (btn && !btn.disabled) || hasControls;
            }, { timeout: 20000 });
            console.log('--- [Student] ✅ 學生確認在教室內 ---');
        } catch (e) {
            console.log('--- [Student] ⚠️ 進入教室斷言超時，嘗試最後一次檢查... ---');
            const studentClassroomEl = studentPage.locator('text="離開"').or(studentPage.locator('text="Debug"')).or(studentPage.locator('text="Controls"'));
            await expect(studentClassroomEl.first()).toBeVisible({ timeout: 5000 });
        }

        // 等待幾秒讓雙方的視窗保持開啟供觀察
        await teacherPage.waitForTimeout(5000);

        console.log('🎉 所有步驟完成！雙方皆成功進入教室，測試通過！');

    } finally {
        console.log('🧹 測試結束，關閉所有瀏覽器分頁...');
        for (const page of pagesToClose) {
            try { await page.context().close(); } catch (e) { }
        }

        // --- 清理：刪除測試課程 ---
        try {
            const cleanContext = await browser.newContext();
            console.log(`=== 清理：刪除測試課程 ${testCourseId} ===`);
            await cleanContext.request.delete(`${baseUrl}/api/courses?id=${testCourseId}`);
            
            // Delete related orders
            const ordersRes = await cleanContext.request.get(`${baseUrl}/api/orders?courseId=${testCourseId}&limit=50`);
            const ordersData = await ordersRes.json();
            const orders: { orderId: string }[] = ordersData?.ok ? ordersData.data || [] : [];
            for (const order of orders) {
                await cleanContext.request.delete(`${baseUrl}/api/orders/${order.orderId}`);
            }
            await cleanContext.close();
        } catch(e) { console.error('Cleanup error:', e); }
    }
});
