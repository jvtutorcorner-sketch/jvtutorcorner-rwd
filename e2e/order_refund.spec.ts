import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test('Order Refund Verification (Points refund + Enrollment cancellation)', async ({ page }) => {
    test.setTimeout(120000);

    const email = process.env.TEST_STUDENT_EMAIL;
    const password = process.env.TEST_STUDENT_PASSWORD;
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!email || !baseUrl) {
        throw new Error('❌ Missing Environment Variables: TEST_STUDENT_EMAIL, NEXT_PUBLIC_BASE_URL');
    }

    console.log(`Starting order refund test for ${email} at ${baseUrl}`);

    // --- 1. Prepare: Get Initial Points ---
    const balanceBeforeRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceStart = (await balanceBeforeRes.json()).balance || 0;
    console.log(`Starting balance: ${balanceStart}`);

    // Ensure we have at least 100 points
    await page.request.post(`${baseUrl}/api/points`, {
        data: JSON.stringify({
            userId: email,
            action: 'add',
            amount: 100,
            reason: 'Add initial points for order refund test'
        })
    });
    const balanceAfterAddRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceStartActual = (await balanceAfterAddRes.json()).balance;
    console.log(`Balance after add: ${balanceStartActual}`);

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
    
    const orderCreateData = await orderCreateRes.json();
    console.log("Order creation response:", orderCreateData);
    const realOrderId = orderCreateData.order?.orderId;
    if (!realOrderId) throw new Error("Failed to get orderId from creation response");
    console.log(`Created order with realId: ${realOrderId}`);

    // /api/orders already deducts the points if paymentMethod='points'
    const balanceAfterEnrollRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceAfterEnroll = (await balanceAfterEnrollRes.json()).balance;
    console.log(`Balance after enroll: ${balanceAfterEnroll}`);
    expect(balanceAfterEnroll).toBe(balanceStartActual - pointCost);

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
    const balanceFinalRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const balanceFinal = (await balanceFinalRes.json()).balance;
    console.log(`Final balance: ${balanceFinal}`);
    expect(balanceFinal).toBe(balanceStartActual);
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
    console.log("Cleanup complete.");
});
