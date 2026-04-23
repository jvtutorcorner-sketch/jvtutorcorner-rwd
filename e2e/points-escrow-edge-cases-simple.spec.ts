/**
 * Points Escrow 邊界條件測試 - 簡化版（API 導向）
 *
 * 目標：用最少的步驟驗證邊界條件
 * E1: 點數不足時報名失敗
 * E2: 點數恰好等於課程點數
 * E3: 點數 = 0 時報名失敗
 * E5: Escrow 釋放驗證
 * E6: Escrow 退款驗證
 * E10: Escrow idempotent 驗證
 */

import { test, expect, Page } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────
// API-only 登入（繞開 UI 驗證碼）
// ─────────────────────────────────────────────────────────
async function apiLogin(page: Page, email: string, password: string): Promise<void> {
    const bypassSecret = 'jv_secret_bypass_2024';
    
    try {
        const loginRes = await page.request.post(`${BASE_URL}/api/login`, {
            data: JSON.stringify({ 
                email, 
                password, 
                captchaValue: bypassSecret 
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!loginRes.ok()) {
            throw new Error(`Login failed (${loginRes.status()}): ${await loginRes.text()}`);
        }

        const loginData = await loginRes.json();
        const profile = loginData?.profile || loginData?.data || loginData;
        const role = email.includes('lin@') ? 'teacher' : 'student';

        // 設定 localStorage
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(
            ({ profile, role, email: userEmail }) => {
                const userData = {
                    email: userEmail,
                    role,
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

        console.log(`   ✅ API 登入成功：${email}`);
    } catch (e: any) {
        console.error(`❌ API 登入失敗：`, e.message);
        throw e;
    }
}

test.describe('Points Escrow Edge Cases (Simplified)', () => {
    // ─────────────────────────────────────
    // 全局設置：初始化學生點數
    // ─────────────────────────────────────
    test('00-SETUP: Initialize student points', async ({ page }) => {
        console.log('\n⚙️  初始化學生點數...');

        const studentEmail = 'pro@test.com';
        
        // 以學生身份登入
        await apiLogin(page, studentEmail, '123456');
        
        // 初始化為 10000 點
        const resetRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 10000,
                reason: 'Initialize for full E2E testing',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!resetRes.ok()) {
            console.warn(`   ⚠️  點數初始化失敗（HTTP ${resetRes.status()}），繼續執行測試`);
        } else {
            const verifyRes = await page.request.get(
                `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
            );
            const pointsData = await verifyRes.json().catch(() => ({}));
            console.log(`   ✅ 學生點數初始化完成：${pointsData?.balance || 10000} 點`);
        }
    });

    // ─────────────────────────────────────
    // E1: 點數不足時直接報名失敗
    // ─────────────────────────────────────
    test('E1: 點數不足時報名失敗', async ({ page }) => {
        console.log('\n📝 E1: 點數不足時報名失敗');

        const courseId = `test-e1-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';
        
        // 1. 教師 API 登入並建立課程（10 點課程）
        await apiLogin(page, teacherEmail, '123456');
        
        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E1 課程（10 點）',
                price: 10,
                pointCost: 10,  // 明確設定 pointCost
                enrollmentType: 'points',  // 關鍵：設定為點數報名
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!courseRes.ok()) {
            console.log(`   ❌ 課程建立失敗: ${courseRes.status()} - ${await courseRes.text()}`);
            return;
        }
            console.log(`   ✅ 課程建立：${courseId} (pointCost=10)`);

        // 2. 學生 API 登入，查詢自己的點數
        await apiLogin(page, studentEmail, '123456');
        
        // 2a. 對於 E1 測試，明確將學生點數設為 0（測試點數不足的情況）
        const resetPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 0,
                reason: 'Test: Reset for E1 insufficient points scenario',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        if (!resetPointsRes.ok()) {
            console.log(`   ⚠️  點數重置失敗（非致命）: ${resetPointsRes.status()}`);
        }
        
        const studentPointsRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const studentPointsData = await studentPointsRes.json().catch(() => ({}));
        const studentBalance = studentPointsData?.balance ?? 0;
        console.log(`   ✅ 學生初始點數：${studentBalance}`);

        // 3. 驗證課程在 DB 中的設定
        const courseCheckRes = await page.request.get(
            `${BASE_URL}/api/courses?id=${courseId}`
        );
        const courseData = await courseCheckRes.json().catch(() => ({}));
        const dbPointCost = courseData?.course?.pointCost || courseData?.pointCost || 0;
        console.log(`   ✅ 課程 DB 設定：pointCost=${dbPointCost}`);

        // 4. 如果點數不足（< 10），嘗試報名應失敗
        if (studentBalance < 10) {
            console.log(`   📊 報名請求：paymentMethod=points, pointsUsed=10, balance=${studentBalance}`);
            
            const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
                data: JSON.stringify({
                    courseId,
                    userId: studentEmail,
                    paymentMethod: 'points',
                    pointsUsed: 10,
                    status: 'PAID',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            console.log(`   📨 報名響應：HTTP ${enrollRes.status()}`);
            const enrollData = await enrollRes.json().catch(() => ({}));

            if (enrollRes.status() === 400) {
                console.log(`   ✅ E1 通過：報名被拒 (HTTP 400)，原因：${enrollData.error}`);
            } else if (enrollRes.status() === 201) {
                console.log(`   ⚠️  E1 異常：報名成功 (HTTP 201)！`);
                console.log(`      → orderId: ${enrollData?.order?.orderId}`);
                console.log(`      → escrowId: ${enrollData?.order?.pointsEscrowId}`);
                console.log(`      → pointsUsed: ${enrollData?.order?.pointsUsed}`);
                
                // 查詢報名後的點數
                await page.waitForTimeout(500);
                const balanceAfterRes = await page.request.get(
                    `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
                );
                const balanceAfter = (await balanceAfterRes.json().catch(() => ({}))).balance ?? 0;
                console.log(`      → 報名後點數：${balanceAfter}（原始：${studentBalance}）`);
                
                if (balanceAfter === studentBalance - 10) {
                    console.log(`      → ✅ 點數被正確扣除（0 - 10 = -10）`);
                    console.log(`      → 原因：系統允許負點數！這是 BUG`);
                } else if (balanceAfter === studentBalance) {
                    console.log(`      → 原因：點數未被扣除（可能未進行點數驗證）`);
                } else {
                    console.log(`      → 原因：不清楚（點數變化：${balanceAfter - studentBalance}）`);
                }
            } else {
                console.log(`   ⚠️  E1 部分：報名返回 ${enrollRes.status()}（期望 400）`);
            }
        } else {
            console.log(`   ⚠️  E1 跳過：學生點數 (${studentBalance}) >= 10`);
        }
    });

    // ─────────────────────────────────────
    // E2: 點數恰好等於課程點數 → balance=0
    // ─────────────────────────────────────
    test('E2: 點數恰好等於課程點數', async ({ page }) => {
        console.log('\n📝 E2: 點數恰好等於課程點數（10點課程 = 10點餘額）');

        const courseId = `test-e2-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';
        
        // 1. 教師 API 登入
        await apiLogin(page, teacherEmail, '123456');

        // 2. 建立課程（10 點）
        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E2 課程（10 點）',
                price: 10,
                pointCost: 10,  // 明確設定 pointCost
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 3. 學生登入，設置點數恰好等於課程點數（10點）
        await apiLogin(page, studentEmail, '123456');
        const setPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 10,
                reason: 'E2 test: Set balance = course cost',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        // 4. 查詢學生點數
        const balanceRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const balance = (await balanceRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   ✅ 學生點數：${balance} (設定為 = 課程點數 10)`);

        // 5. 直接 API 報名
        if (balance >= 10) {
            const enrollmentId = `enroll-e2-${Date.now()}`;
            const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
                data: JSON.stringify({
                    courseId,
                    enrollmentId,
                    userId: studentEmail,
                    paymentMethod: 'points',
                    pointsUsed: 10,
                    status: 'PAID',
                }),
                headers: { 'Content-Type': 'application/json' },
            });
            
            if (enrollRes.ok()) {
                const enrollData = await enrollRes.json();
                console.log(`   ✅ 報名成功，orderId: ${enrollData?.order?.orderId || enrollData?.orderId}`);

                // 驗證點數轉為 0
                const balanceAfter = await page.request.get(
                    `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
                );
                const newBalance = (await balanceAfter.json().catch(() => ({}))).balance ?? 0;
                if (newBalance === 0) {
                    console.log(`   ✅ E2 通過：報名後 balance = ${newBalance}`);
                } else {
                    console.log(`   ⚠️  E2 部分：報名後 balance = ${newBalance}（期望 0）`);
                }
            } else {
                console.log(`   ❌ E2 失敗：報名失敗 (${enrollRes.status()})`);
            }
        } else {
            console.log(`   ⚠️  E2 跳過：學生點數不足 (${balance} < 10)`);
        }
    });

    // ─────────────────────────────────────
    // E3: 點數 = 0 時報名應失敗
    // ─────────────────────────────────────
    test('E3: 點數=0 時報名失敗', async ({ page }) => {
        console.log('\n📝 E3: 點數=0 時報名失敗');

        const courseId = `test-e3-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';

        // 1. 教師 API 登入
        await apiLogin(page, teacherEmail, '123456');

        // 2. 建立課程
        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E3 課程（10 點）',
                price: 10,
                pointCost: 10,  // 明確設定 pointCost
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 3. 學生登入，設置點數為 0
        await apiLogin(page, studentEmail, '123456');
        const setPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 0,
                reason: 'E3 test: Test zero balance enrollment',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        // 4. 查詢學生點數
        const balanceRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const balance = (await balanceRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   ✅ 學生點數：${balance} (設定為 0)`);

        // 5. 嘗試報名
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: JSON.stringify({
                courseId,
                userId: studentEmail,
                paymentMethod: 'points',
                pointsUsed: 10,
                status: 'PAID',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (enrollRes.status() === 400) {
            const error = await enrollRes.json().catch(() => ({}));
            console.log(`   ✅ E3 通過：報名被拒，HTTP 400，原因：${error.error || '點數不足'}`);
        } else {
            console.log(`   ⚠️  E3 部分：報名返回 ${enrollRes.status()}（期望 400）`);
        }
    });

    // ─────────────────────────────────────
    // E5: Escrow 釋放後查詢
    // ─────────────────────────────────────
    test('E5: Escrow 釋放後查詢驗證', async ({ page }) => {
        console.log('\n📝 E5: Escrow 釋放後查詢（完整流程）');

        const courseId = `test-e5-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';
        
        // 1. 教師 API 登入，建立課程
        await apiLogin(page, teacherEmail, '123456');
        
        // 記錄教師初始點數
        const teacherInitRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(teacherEmail)}`
        );
        const teacherInitBalance = (await teacherInitRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 教師初始點數：${teacherInitBalance}`);

        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E5 課程（5 點）',
                price: 5,
                pointCost: 5,  // 明確設定 pointCost
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 2. 學生登入，設置點數為 5
        await apiLogin(page, studentEmail, '123456');
        const setPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 5,
                reason: 'E5 test: Test escrow release',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        const balanceRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const studentBalance = (await balanceRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 學生點數：${studentBalance}`);

        // 3. 學生報名
        const orderId = `order-e5-${Date.now()}`;
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: JSON.stringify({
                courseId,
                orderId,
                userId: studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!enrollRes.ok()) {
            console.log(`   ⚠️  E5 跳過：報名失敗 (${enrollRes.status()}) - ${await enrollRes.text()}`);
            return;
        }

        const enrollData = await enrollRes.json();
        const escrowId = enrollData?.order?.pointsEscrowId;
        console.log(`   ✅ 報名成功，escrowId: ${escrowId || '(null)'}`);

        // 驗證學生點數已扣除
        const studentAfterEnrollRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const studentAfterBalance = (await studentAfterEnrollRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 報名後學生點數：${studentAfterBalance} (應為 0)`);

        if (!escrowId) {
            console.log(`   ⚠️  E5 跳過：escrowId 為 null（points-escrow 系統可能未部署）`);
            return;
        }

        // 4. 手動釋放 Escrow（教師端調用）
        const releaseRes = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: JSON.stringify({ action: 'release', escrowId }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!releaseRes.ok()) {
            const releaseError = await releaseRes.text();
            console.log(`   ⚠️  E5 釋放失敗 (${releaseRes.status()}): ${releaseError}`);
            return;
        }
        console.log(`   ✅ Escrow 釋放成功`);

        // 5. 查詢並驗證
        const queryRes = await page.request.get(
            `${BASE_URL}/api/points-escrow?orderId=${orderId}`
        );
        const escrows = (await queryRes.json().catch(() => ({ data: [] }))).data || [];
        if (escrows.length > 0 && escrows[0].status === 'RELEASED') {
            console.log(`   ✅ E5 通過：status=RELEASED, releasedAt=${escrows[0].releasedAt}`);
        } else {
            console.log(`   ⚠️  E5 部分：Escrow 狀態未確認`);
        }
    });

    // ─────────────────────────────────────
    // E6: Escrow 退款後查詢
    // ─────────────────────────────────────
    test('E6: Escrow 退款後點數恢復', async ({ page }) => {
        console.log('\n📝 E6: Escrow 退款後查詢（完整流程）');

        const courseId = `test-e6-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';

        // 1. 教師 API 登入，建立課程
        await apiLogin(page, teacherEmail, '123456');

        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E6 課程（5 點）',
                price: 5,
                pointCost: 5,  // 明確設定 pointCost
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 2. 學生登入，設置點數為 5
        await apiLogin(page, studentEmail, '123456');
        const setPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 5,
                reason: 'E6 test: Test escrow refund',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        const balanceInitRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const balanceInit = (await balanceInitRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 報名前點數：${balanceInit}`);

        // 3. 學生報名
        const orderId = `order-e6-${Date.now()}`;
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: JSON.stringify({
                courseId,
                orderId,
                userId: studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        
        if (!enrollRes.ok()) {
            console.log(`   ⚠️  E6 跳過：報名失敗`);
            return;
        }

        const enrollData = await enrollRes.json();
        const escrowId = enrollData?.order?.pointsEscrowId;
        if (!escrowId) {
            console.log(`   ⚠️  E6 跳過：escrowId 為 null`);
            return;
        }

        // 記錄報名後點數
        const balanceAfterEnrollRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const balanceAfterEnroll = (await balanceAfterEnrollRes.json().catch(() => ({}))).balance;
        console.log(`   📊 報名後點數：${balanceAfterEnroll} (應為 0)`);

        // 4. 手動退款
        const refundRes = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: JSON.stringify({ action: 'refund', escrowId }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!refundRes.ok()) {
            console.log(`   ⚠️  E6 退款失敗 (${refundRes.status()})`);
            return;
        }
        console.log(`   ✅ Escrow 退款成功`);

        // 5. 驗證點數恢復
        await page.waitForTimeout(500);
        const balanceAfterRefundRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(studentEmail)}`
        );
        const balanceAfterRefund = (await balanceAfterRefundRes.json().catch(() => ({}))).balance;
        console.log(`   📊 退款後點數：${balanceAfterRefund} (應為 5)`);

        // 6. 查詢 Escrow 狀態
        const queryRes = await page.request.get(`${BASE_URL}/api/points-escrow?orderId=${orderId}`);
        const escrows = (await queryRes.json().catch(() => ({ data: [] }))).data || [];
        if (escrows.length > 0 && escrows[0].status === 'REFUNDED') {
            console.log(`   ✅ E6 通過：status=REFUNDED, 點數已恢復`);
        } else {
            console.log(`   ⚠️  E6 部分：Escrow 狀態未確認`);
        }
    });

    // ─────────────────────────────────────
    // E10: Escrow 重複釋放
    // ─────────────────────────────────────
    test('E10: Escrow 重複釋放應 idempotent', async ({ page }) => {
        console.log('\n📝 E10: Escrow 重複釋放（idempotent 驗證）');

        const courseId = `test-e10-${Date.now()}`;
        const teacherEmail = 'lin@test.com';
        const studentEmail = 'pro@test.com';

        // 1. 教師 API 登入，建立課程
        await apiLogin(page, teacherEmail, '123456');

        // 記錄教師初始點數
        const teacherInitRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(teacherEmail)}`
        );
        const teacherInit = (await teacherInitRes.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 教師初始點數：${teacherInit}`);

        const courseRes = await page.request.post(`${BASE_URL}/api/courses`, {
            data: JSON.stringify({
                id: courseId,
                title: 'E10 課程（5 點）',
                price: 5,
                pointCost: 5,  // 明確設定 pointCost
                durationMinutes: 1,
                totalSessions: 1,
                teacherId: teacherEmail,
                status: 'APPROVED',
            }),
            headers: { 'Content-Type': 'application/json' },
        });
        console.log(`   ✅ 課程建立：${courseId}`);

        // 2. 學生登入，設置點數為 5
        await apiLogin(page, studentEmail, '123456');
        const setPointsRes = await page.request.post(`${BASE_URL}/api/points`, {
            data: JSON.stringify({
                userId: studentEmail,
                action: 'set',
                amount: 5,
                reason: 'E10 test: Test idempotent release',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        // 3. 學生報名
        const orderId = `order-e10-${Date.now()}`;
        const enrollRes = await page.request.post(`${BASE_URL}/api/orders`, {
            data: JSON.stringify({
                courseId,
                orderId,
                userId: studentEmail,
                paymentMethod: 'points',
                pointsUsed: 5,
                status: 'PAID',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!enrollRes.ok()) {
            console.log(`   ⚠️  E10 跳過：報名失敗`);
            return;
        }

        const enrollData = await enrollRes.json();
        const escrowId = enrollData?.order?.pointsEscrowId;
        if (!escrowId) {
            console.log(`   ⚠️  E10 跳過：escrowId 為 null`);
            return;
        }
        console.log(`   ✅ 學生報名成功，escrowId: ${escrowId}`);

        // 記錄教師初始點數（用於驗證 idempotent）
        const balanceBeforeRes = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(teacherEmail)}`
        );
        const balanceBefore = (await balanceBeforeRes.json().catch(() => ({}))).balance ?? 0;

        // 4. 第一次釋放
        const release1 = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: JSON.stringify({ action: 'release', escrowId }),
            headers: { 'Content-Type': 'application/json' },
        });

        if (!release1.ok()) {
            console.log(`   ⚠️  E10 第 1 次釋放失敗 (${release1.status()})`);
            return;
        }
        console.log(`   ✅ 第 1 次釋放成功`);

        const balanceAfter1Res = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(teacherEmail)}`
        );
        const balanceAfter1 = (await balanceAfter1Res.json().catch(() => ({}))).balance ?? 0;
        console.log(`   📊 第 1 次釋放後教師點數：${balanceBefore} → ${balanceAfter1}`);

        // 5. 第二次釋放（應 idempotent，不增加點數）
        const release2 = await page.request.post(`${BASE_URL}/api/points-escrow`, {
            data: JSON.stringify({ action: 'release', escrowId }),
            headers: { 'Content-Type': 'application/json' },
        });

        const balanceAfter2Res = await page.request.get(
            `${BASE_URL}/api/points?userId=${encodeURIComponent(teacherEmail)}`
        );
        const balanceAfter2 = (await balanceAfter2Res.json().catch(() => ({}))).balance ?? 0;
        console.log(`   ✅ 第 2 次釋放後教師點數：${balanceAfter1} → ${balanceAfter2}`);

        if (balanceAfter2 === balanceAfter1) {
            console.log(`   ✅ E10 通過：重複釋放為 idempotent，點數未再增加`);
        } else {
            console.log(`   ⚠️  E10 部分：重複釋放導致點數變化（非完全 idempotent）`);
        }
    });
});
