import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const APP_ENV = process.env.APP_ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, '..', `.env.${APP_ENV}`) });

// /api/points 以 canonical id（profile.roid_id || profile.id）為 key，並只允許本人或 admin/system 存取。
// 設定測試基準點數改用 x-e2e-secret 取得 system 身分（僅非 production），不依賴「本人可自行 set 點數」。
const E2E_SECRET = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || '';

/** Logs in and returns the canonical user id that the session carries. */
async function apiLogin(baseUrl: string, page: any, email: string, password: string, bypassSecret: string): Promise<string> {
    const captchaRes = await page.request.get(`${baseUrl}/api/captcha`).catch(() => null);
    const captchaToken = (await captchaRes?.json().catch(() => ({} as any)))?.token || '';

    const loginRes = await page.request.post(`${baseUrl}/api/login`, {
        data: JSON.stringify({ email, password, captchaToken, captchaValue: bypassSecret }),
        headers: { 'Content-Type': 'application/json' },
    });

    const loginData = await loginRes.json().catch(() => ({} as any));
    if (!loginRes.ok()) {
        throw new Error(`Login failed (${loginRes.status()}): ${loginData?.message || 'unknown error'}`);
    }
    const profile = loginData?.profile || loginData?.data || loginData;
    const userId = String(profile?.roid_id || profile?.id || '');
    if (!userId) throw new Error('Login response has no roid_id/id');
    return userId;
}

async function getBalance(baseUrl: string, page: any, userId: string): Promise<number> {
    const res = await page.request.get(`${baseUrl}/api/points?userId=${encodeURIComponent(userId)}`);
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok() || !json?.ok || typeof json?.balance !== 'number') {
        throw new Error(`Failed to get balance: status=${res.status()} body=${JSON.stringify(json)}`);
    }
    return json.balance;
}

async function setBalance(baseUrl: string, page: any, userId: string, amount: number): Promise<number> {
    const res = await page.request.post(`${baseUrl}/api/points`, {
        data: JSON.stringify({ userId, action: 'set', amount, reason: 'Order refund test baseline' }),
        headers: { 'Content-Type': 'application/json', 'x-e2e-secret': E2E_SECRET },
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok() || !json?.ok || typeof json?.balance !== 'number') {
        throw new Error(`Failed to set balance: status=${res.status()} body=${JSON.stringify(json)}`);
    }
    return json.balance;
}

test('Order Refund Verification (Points refund + Enrollment cancellation)', async ({ page }) => {
    test.setTimeout(120000);

    const email = process.env.TEST_STUDENT_EMAIL;
    const password = process.env.TEST_STUDENT_PASSWORD;
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!email || !password || !bypassSecret || !baseUrl) {
        throw new Error('❌ Missing Environment Variables: TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD, LOGIN_BYPASS_SECRET, NEXT_PUBLIC_BASE_URL');
    }

    console.log(`Starting order refund test for ${email} at ${baseUrl}`);

    const userId = await apiLogin(baseUrl, page, email, password, bypassSecret);

    // --- 1. Prepare: Get Initial Points ---
    const originalBalance = await getBalance(baseUrl, page, userId);
    console.log(`Starting balance: ${originalBalance}`);

    // Normalize baseline so deduction/refund assertions are deterministic.
    const baselineBalance = await setBalance(baseUrl, page, userId, 120);
    console.log(`Balance normalized to: ${baselineBalance}`);

    // --- 2. Enroll using Points ---
    // For speed, let's use the API to create a mock enrollment and order
    const courseId = `test-refund-${Date.now()}`;
    // /api/enroll 會自行產生 id 並忽略 client 傳入的值；建立後改用回應中的真實 id
    let enrollmentId = `enr-refund-${Date.now()}`;
    const orderId = `ord-refund-${Date.now()}`;
    const pointCost = 15;

    console.log("Creating mock enrollment and order via API...");
    // a. Create enrollment
    const enrollCreateRes = await page.request.post(`${baseUrl}/api/enroll`, {
        data: JSON.stringify({
            id: enrollmentId,
            name: "Refund Tester",
            email: email,
            courseId: courseId,
            courseTitle: "Refund Test Course",
            status: 'PENDING_PAYMENT'
        })
    });
    const enrollCreateData = await enrollCreateRes.json().catch(() => ({} as any));
    expect(enrollCreateRes.ok(), `enroll failed: ${JSON.stringify(enrollCreateData)}`).toBe(true);
    enrollmentId = enrollCreateData?.enrollment?.id;
    if (!enrollmentId) throw new Error(`enroll response has no enrollment.id: ${JSON.stringify(enrollCreateData)}`);
    console.log(`Created enrollment with realId: ${enrollmentId}`);

    // b. Create order (Paid)
    const orderCreateRes = await page.request.post(`${baseUrl}/api/orders`, {
        data: JSON.stringify({
            userId,
            courseId: courseId,
            courseTitle: "Refund Test Course",
            items: [{ id: courseId, name: "Refund Test Course", price: pointCost }],
            amount: pointCost,
            paymentMethod: 'points',
            pointsUsed: pointCost,
            status: 'PAID',
            enrollmentId: enrollmentId
        })
    });

    expect(orderCreateRes.ok()).toBe(true);
    const orderCreateData = await orderCreateRes.json();
    console.log("Order creation response:", orderCreateData);
    const realOrderId = orderCreateData.order?.orderId;
    if (!realOrderId) throw new Error("Failed to get orderId from creation response");
    console.log(`Created order with realId: ${realOrderId}`);

    // /api/orders already deducts the points if paymentMethod='points'
    const balanceAfterEnroll = await getBalance(baseUrl, page, userId);
    console.log(`Balance after enroll: ${balanceAfterEnroll}`);
    expect(balanceAfterEnroll).toBe(baselineBalance - pointCost);

    // --- 3. Refund: user requests, admin approves ---
    // 使用者不能再直接把訂單設成 REFUNDED（先前可以自助退點）；只能送出申請，由管理員核准。
    console.log(`Attempting direct self-refund (must be rejected) for order: ${realOrderId}...`);
    const selfRefundRes = await page.request.patch(`${baseUrl}/api/orders/${realOrderId}`, {
        data: JSON.stringify({ status: 'REFUNDED' }),
        headers: { 'Content-Type': 'application/json' },
    });
    expect(selfRefundRes.status()).toBe(403);

    console.log(`Requesting refund for order: ${realOrderId}...`);
    const requestRes = await page.request.patch(`${baseUrl}/api/orders/${realOrderId}`, {
        data: JSON.stringify({ action: 'request_refund', reason: 'Order refund test' }),
        headers: { 'Content-Type': 'application/json' },
    });
    const requestData = await requestRes.json();
    console.log("Refund request response:", requestData);
    expect(requestData.ok).toBe(true);
    expect(requestData.order?.refundStatus).toBe('REQUESTED');
    expect(requestData.order?.status).toBe('PAID');

    // 申請本身不動資產
    expect(await getBalance(baseUrl, page, userId)).toBe(baselineBalance - pointCost);

    // 管理員核准（x-e2e-secret 在非 production 取得 system 身分，可通過 withAdmin）
    console.log(`Approving refund as admin for order: ${realOrderId}...`);
    const approveRes = await page.request.post(`${baseUrl}/api/admin/refunds`, {
        data: JSON.stringify({ orderId: realOrderId, action: 'approve', note: 'Order refund test' }),
        headers: { 'Content-Type': 'application/json', 'x-e2e-secret': E2E_SECRET },
    });
    const approveData = await approveRes.json();
    console.log("Refund approve response:", approveData);
    expect(approveData.ok).toBe(true);
    expect(approveData.order?.status).toBe('REFUNDED');
    expect(approveData.order?.refundStatus).toBe('APPROVED');

    // 重複核准必須冪等（不可二次退點）
    const approveAgainRes = await page.request.post(`${baseUrl}/api/admin/refunds`, {
        data: JSON.stringify({ orderId: realOrderId, action: 'approve' }),
        headers: { 'Content-Type': 'application/json', 'x-e2e-secret': E2E_SECRET },
    });
    const approveAgainData = await approveAgainRes.json();
    expect(approveAgainData.ok).toBe(true);
    expect(approveAgainData.outcome).toBe('ALREADY_REFUNDED');

    // Wait a bit for the enrollment revocation (server-to-server PATCH /api/enroll) to settle
    await page.waitForTimeout(4000);

    // --- 4. Final Verification ---
    // a. Balance should be back
    const balanceFinal = await getBalance(baseUrl, page, userId);
    console.log(`Final balance: ${balanceFinal}`);
    expect(balanceFinal).toBe(baselineBalance);
    console.log("✅ Points successfully refunded!");

    // b. Enrollment should be CANCELLED
    // Find our enrollment
    let myEnroll = null;
    for (let i = 0; i < 3; i++) {
        const enrollRes = await page.request.get(`${baseUrl}/api/enroll`);
        const enrollData = await enrollRes.json();
        myEnroll = enrollData.data.find((e: any) => e.id === enrollmentId);
        if (myEnroll?.status === 'CANCELLED') break;
        await page.waitForTimeout(2000);
    }
    
    console.log("Enrollment status:", myEnroll?.status);
    expect(myEnroll?.status).toBe('CANCELLED');
    console.log("✅ Enrollment successfully cancelled!");

    // Cleanup
    console.log("Cleaning up test data...");
    await page.request.delete(`${baseUrl}/api/orders/${realOrderId}`);
    await page.request.delete(`${baseUrl}/api/enroll?id=${enrollmentId}`);
    await setBalance(baseUrl, page, userId, originalBalance);
    console.log("Cleanup complete.");
});
