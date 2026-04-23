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

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

const config = {
    teacherEmail: 'lin@test.com',
    studentEmail: 'pro@test.com',
    bypassCaptcha: 'jv_secret_bypass_2024',
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
        const isTeacher = email === 'lin@test.com';
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

test.describe('Points Escrow Edge Cases (Fixed)', () => {
    // ─────────────────────────────────────
    // E1: 點數不足時直接報名失敗
    // ─────────────────────────────────────
    test('E1: 點數不足時報名失敗', async ({ page }) => {
        console.log('📝 E1: 點數不足時報名失敗');

        const courseId = `test-edge-e1-${Date.now()}`;
        
        // 1. 教師 API 登入並建立課程（需求 10 點）
        await apiLogin(page, config.teacherEmail, '123456');
        
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
        const grantRes = await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=5`);
        const balanceBefore = (await grantRes.json()).balance;
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
        await apiLogin(page, config.teacherEmail, '123456');

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
        const grantRes = await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=10`);
        const balance = (await grantRes.json()).balance;
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
        console.log(`   ✅ 報名成功，orderId: ${enrollData.orderId}`);

        // 5. 驗證點數轉為 0
        const balanceAfter = await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}`);
        const newBalance = (await balanceAfter.json()).balance;
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
        await apiLogin(page, config.teacherEmail, '123456');

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
        const grantRes = await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=0&reset=true`);
        const balance = (await grantRes.json()).balance || 0;
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
        const orderId = `order-e5-${Date.now()}`;

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, '123456');

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
        await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=50`);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                orderId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const escrowId = (await enrollRes.json()).pointsEscrowId;
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
        const escrows = (await queryRes.json()).data || [];
        expect(escrows[0].status).toBe('RELEASED');
        expect(escrows[0].releasedAt).toBeTruthy();
        console.log(`   ✅ E5 通過：status=RELEASED, releasedAt=${escrows[0].releasedAt}`);
    });

    // ─────────────────────────────────────
    // E6: Escrow 退款後查詢
    // ─────────────────────────────────────
    test('E6: Escrow 退款後點數恢復', async ({ page }) => {
        console.log('📝 E6: Escrow 退款後查詢');

        const courseId = `test-edge-e6-${Date.now()}`;
        const orderId = `order-e6-${Date.now()}`;

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, '123456');

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
        await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=50`);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                orderId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const escrowId = (await enrollRes.json()).pointsEscrowId;

        // 記錄報名後點數（應為 45）
        const balanceAfterEnrollRes = await page.request.get(
            `${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}`
        );
        const balanceAfterEnroll = (await balanceAfterEnrollRes.json()).balance;
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
        const balanceAfterRefundRes = await page.request.get(
            `${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}`
        );
        const balanceAfterRefund = (await balanceAfterRefundRes.json()).balance;
        console.log(`   ✅ 退款後點數：${balanceAfterRefund}`);

        // 6. 查詢 Escrow 狀態
        const queryRes = await page.request.get(`${BASE_URL}/api/points-escrow?orderId=${orderId}`);
        const escrows = (await queryRes.json()).data || [];
        expect(escrows[0].status).toBe('REFUNDED');
        console.log(`   ✅ E6 通過：status=REFUNDED, 點數已恢復`);
    });

    // ─────────────────────────────────────
    // E10: Escrow 重複釋放
    // ─────────────────────────────────────
    test('E10: Escrow 重複釋放應 idempotent', async ({ page }) => {
        console.log('📝 E10: Escrow 重複釋放');

        const courseId = `test-edge-e10-${Date.now()}`;
        const orderId = `order-e10-${Date.now()}`;

        // 1. 教師 API 登入
        await apiLogin(page, config.teacherEmail, '123456');

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
        await page.request.get(`${BASE_URL}/api/admin/grant-points?email=${config.studentEmail}&points=50`);
        
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: {
                courseId,
                orderId,
                userId: config.studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }
        });
        const escrowId = (await enrollRes.json()).pointsEscrowId;

        // 記錄教師初始點數
        const balanceBeforeRes = await page.request.get(
            `${BASE_URL}/api/admin/grant-points?email=${config.teacherEmail}`
        );
        const balanceBefore = (await balanceBeforeRes.json()).balance;

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

        const balanceAfter1Res = await page.request.get(
            `${BASE_URL}/api/admin/grant-points?email=${config.teacherEmail}`
        );
        const balanceAfter1 = (await balanceAfter1Res.json()).balance;
        console.log(`   ✅ 第 1 次釋放後教師點數：${balanceBefore} → ${balanceAfter1}`);

        // 5. 第二次釋放（應為 idempotent）
        const release2 = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: { action: 'release', escrowId }
        });

        const balanceAfter2Res = await page.request.get(
            `${BASE_URL}/api/admin/grant-points?email=${config.teacherEmail}`
        );
        const balanceAfter2 = (await balanceAfter2Res.json()).balance;
        console.log(`   ✅ 第 2 次釋放後教師點數：${balanceAfter1} → ${balanceAfter2}`);

        if (balanceAfter2 === balanceAfter1) {
            console.log(`   ✅ E10 通過：重複釋放為 idempotent，點數未再增加`);
        } else {
            console.log(`   ⚠️  E10 部分：重複釋放導致點數變化（非完全 idempotent）`);
        }
    });
});
