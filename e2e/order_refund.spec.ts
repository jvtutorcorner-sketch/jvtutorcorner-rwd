import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function apiLogin(baseUrl: string, page: any, email: string, password: string, bypassSecret: string) {
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
        headers: { 'Content-Type': 'application/json' },
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

    await apiLogin(baseUrl, page, email, password, bypassSecret);

    // --- 1. Prepare: Get Initial Points ---
    const originalBalance = await getBalance(baseUrl, page, email);
    console.log(`Starting balance: ${originalBalance}`);

    // Normalize baseline so deduction/refund assertions are deterministic.
    const baselineBalance = await setBalance(baseUrl, page, email, 120);
    console.log(`Balance normalized to: ${baselineBalance}`);

    // --- 2. Enroll using Points ---
    // For speed, let's use the API to create a mock enrollment and order
    const courseId = `test-refund-${Date.now()}`;
    const enrollmentId = `enr-refund-${Date.now()}`;
    const orderId = `ord-refund-${Date.now()}`;
    const pointCost = 15;

    console.log("Creating mock enrollment and order via API...");
    // a. Create enrollment
    await page.request.post(`${baseUrl}/api/enroll`, {
        data: JSON.stringify({
            id: enrollmentId,
            name: "Refund Tester",
            email: email,
            courseId: courseId,
            courseTitle: "Refund Test Course",
            status: 'PENDING_PAYMENT'
        })
    });

    // b. Create order (Paid)
    const orderCreateRes = await page.request.post(`${baseUrl}/api/orders`, {
        data: JSON.stringify({
            userId: email,
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
    const balanceAfterEnroll = await getBalance(baseUrl, page, email);
    console.log(`Balance after enroll: ${balanceAfterEnroll}`);
    expect(balanceAfterEnroll).toBe(baselineBalance - pointCost);

    // --- 3. Trigger Refund ---
    console.log(`Triggering refund for order: ${realOrderId}...`);
    // Need to trigger the backend logic via PATCH
    const patchRes = await page.request.patch(`${baseUrl}/api/orders/${realOrderId}`, {
        data: JSON.stringify({
            status: 'REFUNDED',
            payment: {
                time: new Date().toISOString(),
                action: 'refund',
                amount: pointCost,
                status: 'REFUNDED',
                note: 'Order refund test'
            }
        })
    });
    
    const patchData = await patchRes.json();
    console.log("Refund Patch response:", patchData);
    if (!patchData.ok) {
        console.error("PATCH FAILED:", patchData.error || patchData);
    }
    expect(patchData.ok).toBe(true);

    // Wait a bit for backend API patch requests (they are fired and forgotten by /api/orders) to settle
    await page.waitForTimeout(4000);

    // --- 4. Final Verification ---
    // a. Balance should be back
    const balanceFinal = await getBalance(baseUrl, page, email);
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
    await setBalance(baseUrl, page, email, originalBalance);
    console.log("Cleanup complete.");
});
