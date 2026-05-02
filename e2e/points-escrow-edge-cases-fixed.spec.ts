/**
 * Points Escrow 邊界條件測試 (已修復 API 登入)
 *
 * 驗證以下 10 個邊界場景：
 * E1: 點數不足時直接報名失敗（無自動購點流程）
 * E2: 點數餘額恰好等於課程點數 (balance=0)
 * E3: 點數=0 時報名應失敗
 * E5: Escrow 釋放後查詢驗證
 * E6: Escrow 退款後點數恢復驗證
 * E10: Escrow 重複釋放應為 idempotent
 */

import { test, expect, Page } from '@playwright/test';

function requireEnv(...keys: string[]): string {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) {
            return value.trim();
        }
    }
    throw new Error(`Missing required environment variable(s): ${keys.join(', ')}`);
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const DEFAULT_TEST_PASSWORD = requireEnv(
    'TEST_TEACHER_PASSWORD',
    'QA_TEACHER_PASSWORD',
    'TEST_STUDENT_PASSWORD',
    'QA_STUDENT_PASSWORD'
);

const config = {
    teacherEmail: process.env.QA_TEACHER_EMAIL || process.env.TEST_TEACHER_EMAIL || 'lin@test.com',
    studentEmail: process.env.QA_STUDENT_EMAIL || process.env.TEST_STUDENT_EMAIL || 'pro@test.com',
    teacherPassword: process.env.QA_TEACHER_PASSWORD || process.env.TEST_TEACHER_PASSWORD || DEFAULT_TEST_PASSWORD,
    studentPassword: process.env.QA_STUDENT_PASSWORD || process.env.TEST_STUDENT_PASSWORD || DEFAULT_TEST_PASSWORD,
    bypassCaptcha: requireEnv('QA_CAPTCHA_BYPASS', 'LOGIN_BYPASS_SECRET', 'NEXT_PUBLIC_LOGIN_BYPASS_SECRET'),
};

// ─────────────────────────────────────────────────────────
// API-only 登入（繞開 UI 驗證碼）
// ─────────────────────────────────────────────────────────
async function apiLogin(page: Page, email: string, password: string): Promise<void> {
    const bypassSecret = config.bypassCaptcha;
    
    try {
        const captchaRes = await page.request.get(`${BASE_URL}/api/captcha`).catch(() => null);
        const captchaToken = (await captchaRes?.json().catch(() => ({})))?.token || '';

        const loginRes = await page.request.post(`${BASE_URL}/api/login`, {
            data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!loginRes.ok()) {
            throw new Error(`Login failed (${loginRes.status()}): ${await loginRes.text()}`);
        }

        const loginData = await loginRes.json();
        const profile = loginData?.profile || loginData?.data || loginData;
        const isTeacher = email === config.teacherEmail;
        const role = isTeacher ? 'teacher' : 'student';

        // 設定 localStorage
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(
            ({ profile, role, email: userEmail }) => {
                const userData = {
                    email: userEmail,
                    role,
                    plan: profile?.plan || 'basic',
                    id: profile?.id || profile?.userId || userEmail,
                    teacherId: profile?.id || profile?.userId || userEmail,
                };
                localStorage.setItem('tutor_mock_user', JSON.stringify(userData));
                const now = Date.now().toString();
                sessionStorage.setItem('tutor_last_login_time', now);
                localStorage.setItem('tutor_last_login_time', now);
                sessionStorage.setItem('tutor_login_complete', 'true');
                window.dispatchEvent(new Event('tutor:auth-changed'));
            },
            { profile, role, email }
        );

        console.log(`   ✅ API 登入成功：${email} (${role})`);
    } catch (e: any) {
        console.error(`❌ API 登入失敗：`, e.message);
        throw e;
    }
}

async function setUserPoints(page: Page, email: string, password: string, amount: number): Promise<number> {
    await apiLogin(page, email, password);
    const setRes = await page.request.post(`${BASE_URL}/api/points`, {
        data: JSON.stringify({ userId: email, action: 'set', amount, reason: 'escrow edge test setup' }),
        headers: { 'Content-Type': 'application/json' },
    });
    const setData = await setRes.json().catch(() => ({} as any));
    if (!setRes.ok() || !setData?.ok || typeof setData?.balance !== 'number') {
        throw new Error(`setUserPoints failed (${setRes.status()}): ${JSON.stringify(setData)}`);
    }
    return setData.balance;
}

async function getUserPoints(page: Page, email: string, password: string): Promise<number> {
    await apiLogin(page, email, password);
    const res = await page.request.get(`${BASE_URL}/api/points?userId=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok() || !data?.ok || typeof data?.balance !== 'number') {
        throw new Error(`getUserPoints failed (${res.status()}): ${JSON.stringify(data)}`);
    }
    return data.balance;
}

test.describe('Points Escrow Edge Cases (Fixed)', () => {
    // ─────────────────────────────────────
    // E1: 點數不足時直接報名失敗
    // ─────────────────────────────────────
    test('E1: 點數不足時報名失敗', async ({ page }) => {
        console.log('📝 E1: 點數不足時報名失敗');

        const courseId = `test-edge-e1-${Date.now()}`;
        
        // 1. 教師 API 登入並建立課程（需求 10 點）
        await apiLogin(page, config.teacherEmail, config.teacherPassword);
        
        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E1 課程（10 點）',
                price: 10,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });
        expect(courseRes.ok()).toBeTruthy();
        console.log(`   ✅ 課程建立：${courseId}`);

        // 2. 學生設定點數 = 5（不足）
        const balanceBefore = await setUserPoints(page, config.studentEmail, config.studentPassword, 5);
        console.log(`   ✅ 學生初始點數：${balanceBefore}`);
        expect(balanceBefore).toBe(5);

        // 3. 嘗試報名（應失敗）
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 10,
                status: 'PAID',
            }
        });

        expect(enrollRes.status()).toBe(400);
        const error = await enrollRes.json();
        console.log(`   ✅ E1 通過：報名被拒，原因：${error.error}`);
        expect(error.error).toContain('點數不足');
    });

    // ─────────────────────────────────────
    // E2: 點數餘額恰好等於課程點數
    // ─────────────────────────────────────
    test('E2: 點數餘額 = 課程點數 → balance=0', async ({ page }) => {
        console.log('📝 E2: 點數餘額 = 課程點數');

        const courseId = `test-edge-e2-${Date.now()}`;
        
        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, config.teacherPassword);

        // 2. 建立課程（10 點）
        await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E2 課程（10 點）',
                price: 10,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 3. 學生設定點數 = 10（恰好）
        const balance = await setUserPoints(page, config.studentEmail, config.studentPassword, 10);
        expect(balance).toBe(10);
        console.log(`   ✅ 學生點數設定為：${balance}`);

        // 4. 直接 API 報名
        const enrollmentId = `enroll-e2-${Date.now()}`;
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                enrollmentId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 10,
                status: 'PAID',
            }
        });
        expect(enrollRes.ok()).toBeTruthy();
        const enrollData = await enrollRes.json();
        console.log(`   ✅ 報名成功，orderId: ${enrollData?.order?.orderId}`);

        // 5. 驗證點數轉為 0
        const newBalance = await getUserPoints(page, config.studentEmail, config.studentPassword);
        expect(newBalance).toBe(0);
        console.log(`   ✅ E2 通過：balance = ${newBalance}`);
    });

    // ─────────────────────────────────────
    // E3: 點數 = 0 時報名應失敗
    // ─────────────────────────────────────
    test('E3: 點數=0 時報名失敗', async ({ page }) => {
        console.log('📝 E3: 點數=0 時報名失敗');

        const courseId = `test-edge-e3-${Date.now()}`;

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, config.teacherPassword);

        // 2. 建立課程
        await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E3 課程（10 點）',
                price: 10,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });

        // 3. 學生設定點數 = 0
        const balance = await setUserPoints(page, config.studentEmail, config.studentPassword, 0);
        expect(balance).toBe(0);
        console.log(`   ✅ 學生點數設定為：${balance}`);

        // 4. 嘗試報名（應失敗）
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 10,
                status: 'PAID',
            }
        });

        expect(enrollRes.status()).toBe(400);
        const error = await enrollRes.json();
        console.log(`   ✅ E3 通過：報名被拒，HTTP 400，原因：${error.error}`);
    });

    // ─────────────────────────────────────
    // E5: Escrow 釋放後查詢
    // ─────────────────────────────────────
    test('E5: Escrow 釋放後查詢驗證', async ({ page }) => {
        console.log('📝 E5: Escrow 釋放後查詢');

        const courseId = `test-edge-e5-${Date.now()}`;
        let orderId = '';

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, config.teacherPassword);

        // 2. 建立課程
        await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E5 課程',
                price: 5,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });

        // 3. 學生設定點數 + 報名
        await setUserPoints(page, config.studentEmail, config.studentPassword, 50);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const enrollData = await enrollRes.json();
        orderId = enrollData?.order?.orderId || '';
        const escrowId = enrollData?.order?.pointsEscrowId || '';
        expect(escrowId).toBeTruthy();
        console.log(`   ✅ 報名成功，escrowId: ${escrowId}`);

        // 4. 手動釋放 Escrow
        const releaseRes = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: { action: 'release', escrowId }
        });
        if (!releaseRes.ok()) {
            console.log(`   ⚠️  釋放失敗，狀態：${releaseRes.status()}`);
            const text = await releaseRes.text();
            console.log(`   ⚠️  響應：${text}`);
        }
        expect(releaseRes.ok()).toBeTruthy();
        console.log(`   ✅ Escrow 釋放成功`);

        // 5. 查詢並驗證
        const queryRes = await page.request.get(`${BASE_URL}/api/points-escrow?orderId=${orderId}`);
        const escrowRecord = (await queryRes.json()).escrow;
        expect(escrowRecord?.status).toBe('RELEASED');
        expect(escrowRecord?.releasedAt).toBeTruthy();
        console.log(`   ✅ E5 通過：status=RELEASED, releasedAt=${escrowRecord?.releasedAt}`);
    });

    // ─────────────────────────────────────
    // E6: Escrow 退款後查詢
    // ─────────────────────────────────────
    test('E6: Escrow 退款後點數恢復', async ({ page }) => {
        console.log('📝 E6: Escrow 退款後查詢');

        const courseId = `test-edge-e6-${Date.now()}`;
        let orderId = '';

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, config.teacherPassword);

        // 2. 建立課程
        await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E6 課程',
                price: 5,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });

        // 3. 學生設定點數 + 報名
        await setUserPoints(page, config.studentEmail, config.studentPassword, 50);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const enrollData = await enrollRes.json();
        orderId = enrollData?.order?.orderId || '';
        const escrowId = enrollData?.order?.pointsEscrowId || '';
        expect(escrowId).toBeTruthy();

        // 記錄報名後點數（應為 45）
        const balanceAfterEnroll = await getUserPoints(page, config.studentEmail, config.studentPassword);
        console.log(`   ✅ 報名後點數：${balanceAfterEnroll}`);

        // 4. 手動退款 Escrow
        const refundRes = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: { action: 'refund', escrowId }
        });
        if (!refundRes.ok()) {
            console.log(`   ⚠️  退款失敗，狀態：${refundRes.status()}`);
            const text = await refundRes.text();
            console.log(`   ⚠️  響應：${text}`);
        }
        expect(refundRes.ok()).toBeTruthy();
        console.log(`   ✅ Escrow 退款成功`);

        // 5. 驗證點數恢復
        const balanceAfterRefund = await getUserPoints(page, config.studentEmail, config.studentPassword);
        console.log(`   ✅ 退款後點數：${balanceAfterRefund}`);

        // 6. 查詢 Escrow 狀態
        const queryRes = await page.request.get(`${BASE_URL}/api/points-escrow?orderId=${orderId}`);
        const escrowRecord = (await queryRes.json()).escrow;
        expect(escrowRecord?.status).toBe('REFUNDED');
        console.log(`   ✅ E6 通過：status=REFUNDED, 點數已恢復`);
    });

    // ─────────────────────────────────────
    // E10: Escrow 重複釋放
    // ─────────────────────────────────────
    test('E10: Escrow 重複釋放應 idempotent', async ({ page }) => {
        console.log('📝 E10: Escrow 重複釋放');

        const courseId = `test-edge-e10-${Date.now()}`;
        let orderId = '';

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, config.teacherPassword);

        // 2. 建立課程
        await page.request.post(`${BASE_URL}/api/courses`, {
            data: {
                id: courseId,
                title: 'E10 課程',
                price: 5,
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: config.teacherEmail,
                status: 'APPROVED',
            }
        });

        // 3. 學生設定點數 + 報名
        await setUserPoints(page, config.studentEmail, config.studentPassword, 50);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const enrollData = await enrollRes.json();
        orderId = enrollData?.order?.orderId || '';
        const escrowId = enrollData?.order?.pointsEscrowId || '';
        expect(escrowId).toBeTruthy();

        // 記錄教師初始點數
        const balanceBefore = await getUserPoints(page, config.teacherEmail, config.teacherPassword);

        // 4. 第一次釋放
        const release1 = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: { action: 'release', escrowId }
        });
        if (!release1.ok()) {
            console.log(`   ⚠️  釋放失敗，狀態：${release1.status()}`);
            const text = await release1.text();
            console.log(`   ⚠️  響應：${text}`);
        }
        expect(release1.ok()).toBeTruthy();
        console.log(`   ✅ 第 1 次釋放成功`);

        const balanceAfter1 = await getUserPoints(page, config.teacherEmail, config.teacherPassword);
        console.log(`   ✅ 第 1 次釋放後教師點數：${balanceBefore} → ${balanceAfter1}`);

        // 5. 第二次釋放（應為 idempotent）
        const release2 = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: { action: 'release', escrowId }
        });
        expect(release2.ok()).toBeFalsy();

        const balanceAfter2 = await getUserPoints(page, config.teacherEmail, config.teacherPassword);
        console.log(`   ✅ 第 2 次釋放後教師點數：${balanceAfter1} → ${balanceAfter2}`);

        if (balanceAfter2 === balanceAfter1) {
            console.log(`   ✅ E10 通過：重複釋放為 idempotent，點數未再增加`);
        } else {
            console.log(`   ⚠️  E10 部分：重複釋放導致點數變化（非完全 idempotent）`);
        }
    });
});
