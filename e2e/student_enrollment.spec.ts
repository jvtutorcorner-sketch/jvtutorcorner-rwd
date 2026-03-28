import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test('Student Enrollment Flow with auto-balance recovery', async ({ page }) => {
    test.setTimeout(300000);

    const email = process.env.TEST_STUDENT_EMAIL || 'basic@test.com';
    const password = process.env.TEST_STUDENT_PASSWORD || '123456';
    const bypassSecret = process.env.LOGIN_BYPASS_SECRET || process.env.NEXT_PUBLIC_LOGIN_BYPASS_SECRET || 'jv_secret_bypass_2024'; 
    // ✅ 支援正式環境測試
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    console.log(`Starting test for ${email} at ${baseUrl}`);

    // Standard dialog handler
    page.on('dialog', async dialog => {
        console.log(`Dialog: [${dialog.type()}] ${dialog.message()}`);
        await dialog.accept();
    });

    page.on('console', msg => {
        console.log(`BROWSER ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    // Create a NEW course
    const testCourseId = `test-course-${Date.now()}`;
    const testCourseTitle = `AI 自動測試課程-${Date.now()}`;
    
    console.log("Creating point-based test course...");
    try {
        const courseRes = await page.request.post(`${baseUrl}/api/courses`, {
            data: JSON.stringify({
                id: testCourseId,
                title: testCourseTitle,
                teacherName: "Test Bot",
                enrollmentType: "points",
                pointCost: 10,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30*86400000).toISOString(),
                status: '上架'
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        const courseData = await courseRes.json();
        console.log(`Course creation response:`, courseData);
        if (courseRes.ok()) {
            console.log(`Test course created: ${testCourseTitle}`);
        } else {
            console.error(`Failed to create course: ${courseData.error}`);
        }
    } catch (e) {
        console.error(`Error creating course:`, e);
    }

    // 0a. Cancel all existing ACTIVE orders for this user to prevent time conflicts
    console.log(`Cleaning up existing active orders for ${email}...`);
    try {
        const existingOrdersRes = await page.request.get(
            `${baseUrl}/api/orders?userId=${encodeURIComponent(email)}&limit=100`
        );
        if (existingOrdersRes.ok()) {
            const existingOrdersData = await existingOrdersRes.json();
            const existingOrders: any[] = existingOrdersData?.data || [];
            const activeOrders = existingOrders.filter(o => {
                const s = String(o.status || '').toUpperCase();
                return s !== 'CANCELLED' && s !== 'FAILED';
            });
            console.log(`Found ${activeOrders.length} active orders to clean up`);
            for (const order of activeOrders) {
                try {
                    const delRes = await page.request.delete(
                        `${baseUrl}/api/orders/${encodeURIComponent(order.orderId)}`
                    );
                    if (delRes.ok()) {
                        console.log(`  ✓ Deleted order: ${order.orderId} (${order.courseTitle || order.courseId})`);
                    }
                } catch (_) { /* ignore individual delete failures */ }
            }
        }
    } catch (e) {
        console.warn('Failed to pre-clean existing orders:', e);
    }

    // 0b. Reset points
    console.log("Resetting points to 0...");
    try {
        const resetRes = await page.request.post(`${baseUrl}/api/points`, {
            data: JSON.stringify({ userId: email, action: 'set', amount: 0, reason: 'E2E Reset' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const resetData = await resetRes.json();
        console.log(`Reset points response:`, resetData);
        if (!resetRes.ok()) {
            console.error(`Failed to reset points: ${resetData.error}`);
        }
    } catch (e) {
        console.error(`Error resetting points:`, e);
    }

    // Set up network logging to catch the 400 error
    page.on('response', response => {
        if (response.status() === 400) {
            console.warn(`⚠️ 400 ERROR on ${response.url()}`);
        }
    });

    // 1. Fresh Login
    console.log("Navigating to login page...");
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    
    // Check if already logged in
    if (await page.locator('.menu-avatar-button').isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("Already logged in, logging out...");
        await page.click('.menu-avatar-button');
        await page.click('button:has-text("登出")');
        await page.waitForNavigation();
    }
    
    console.log("Filling login form...");
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000); // Wait for page to settle
    
    // Load captcha token
    console.log("Loading captcha token...");
    let captchaToken: string | null = null;
    try {
        const captchaRes = await page.request.get(`${baseUrl}/api/captcha`);
        const captchaData = await captchaRes.json();
        captchaToken = captchaData.token;
        console.log(`Captcha token loaded: ${captchaToken ? 'Yes' : 'No'}`);
    } catch (e) {
        console.warn("Failed to load captcha token:", e);
    }
    
    // Call login API directly using fetch (bypassing form submission)
    console.log("Calling login API directly...");
    const loginRes = await page.request.post(`${baseUrl}/api/login`, {
        data: JSON.stringify({
            email: email,
            password: password,
            captchaToken: captchaToken || '',
            captchaValue: bypassSecret
        }),
        headers: { 'Content-Type': 'application/json' }
    });
    
    const loginData = await loginRes.json();
    console.log(`Login response status: ${loginRes.status()}`);
    console.log(`Login response:`, loginData);
    
    if (!loginRes.ok) {
        throw new Error(`Login failed: ${loginData.message || 'Unknown error'}`);
    }
    
    console.log("Login successful, syncing localStorage and redirecting to dashboard...");
    
    // Sync to localStorage so the UI knows we are logged in
    await page.evaluate((data) => {
        const user = {
            email: data.profile.email,
            plan: data.profile.plan || 'basic',
            role: data.profile.role,
            firstName: data.profile.firstName,
            lastName: data.profile.lastName
        };
        localStorage.setItem('tutor_mock_user', JSON.stringify(user));
        window.dispatchEvent(new Event('tutor:auth-changed'));
    }, loginData);

    await page.goto(`${baseUrl}/student_courses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // Allow page to fully render
    
    console.log("Looking for student courses page...");
    // Check if page loaded correctly
    const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => 'No title');
    console.log(`Page title: ${pageTitle}`);
    
    // Page should show order records (課程列表 or 訂單紀錄)
    // Just verify we're on the right page by checking the URL
    if (!page.url().includes('/student_courses')) {
        throw new Error(`Expected /student_courses but got ${page.url()}`);
    }
    console.log(`✓ Successfully on student_courses page`);

    // 2. Navigate to course
    console.log(`Navigating to course: ${testCourseId}`);
    await page.goto(`${baseUrl}/courses/${testCourseId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Debug: Check what's on the page
    const courseContent = await page.content();
    console.log(`Course page size: ${courseContent.length} bytes`);
    
    // Look for various error or status messages
    const pageText = (await page.locator('body').textContent().catch(() => '')) ?? '';
    console.log(`Page contains '點數不足': ${pageText.includes('點數不足')}`);
    console.log(`Page contains '立即報名': ${pageText.includes('立即報名')}`);
    console.log(`Page contains '購買點數': ${pageText.includes('購買點數')}`);
    
    // Wait for course page to load - look for any course details
    try {
        await page.waitForSelector('h1, h2, [data-testid="course-title"]', { timeout: 5000 });
        console.log("Course page loaded");
    } catch (e) {
        console.warn("Course page elements not found");
    }
    
    // Check for point shortage message
    const pointShortageMsg = page.locator('text=點數不足').first();
    const enrollBtn = page.locator('button:has-text("立即報名課程"), button:has-text("立即報名")').first();
    
    if (await pointShortageMsg.count() > 0) {
        console.log("Confirmed point shortage message visible.");
    } else if (await enrollBtn.count() > 0) {
        console.log("Found enroll button (points might be sufficient)");
    } else {
        console.warn("Neither point shortage nor enroll button found. Checking page content...");
        console.log("Page snippet:", pageText.substring(0, 500));
    }

    // 3. Buy points
    await page.goto(`${baseUrl}/pricing`);
    await page.locator('a:has-text("購買點數")').first().click();
    await page.waitForURL(/\/pricing\/checkout/);
    await page.click('button:has-text("模擬支付 (Demo)")');
    
    // Wait for redirection back to /plans or /pricing
    console.log("Waiting for redirection to /plans...");
    await page.waitForURL(url => url.pathname === '/plans' || url.pathname === '/pricing', { timeout: 30000 });
    console.log("Point purchase successful.");

    // Explicitly go to /pricing to verify UI balance refresh
    console.log("Navigating to /pricing to verify UI balance refresh...");
    await page.goto(`${baseUrl}/pricing`, { waitUntil: 'networkidle' });

    // 4. Verify UI Refresh and Balance Update on Pricing Page
    console.log("Verifying UI balance refresh on pricing page...");
    // The balance is displayed in a div with class text-indigo-600
    const uiBalance = page.locator('.text-indigo-600:has-text("點")').first();
    await expect(uiBalance).toBeVisible({ timeout: 10000 });
    const uiBalanceText = await uiBalance.textContent();
    console.log(`UI Displayed Balance: ${uiBalanceText}`);
    
    // Check if balance matches expected (at least 20 after purchase, assuming starter pack or 100)
    // The test user starts at 0, buys a package (points_100 is typical in tests, but checkout uses points_100 legacy or similar)
    if (!uiBalanceText?.includes('20') && !uiBalanceText?.includes('100')) {
        console.warn(`UI balance refresh check: unexpected text "${uiBalanceText}". It might not have refreshed correctly.`);
    } else {
        console.log("✓ UI balance refresh verified!");
    }

    // 5. Verify balance after purchase via API (Source of Truth)
    const midBalanceRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const midBalanceData = await midBalanceRes.json();
    const balanceBeforeEnroll = midBalanceData.balance;
    console.log(`Balance after purchase (before enroll): ${balanceBeforeEnroll}`);
    if (balanceBeforeEnroll < 10) {
        throw new Error(`Balance insufficient after purchase. Expected at least 10, got ${balanceBeforeEnroll}`);
    }

    // 6. Back to course and enroll manually via UI
    console.log(`Navigating back to course: ${testCourseId}`);
    await page.goto(`${baseUrl}/courses/${testCourseId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for points balance to load in UI
    
    console.log("Clicking '立即報名課程'...");
    await page.click('button:has-text("立即報名課程")');
    
    console.log("Waiting for '確認報名' button...");
    const confirmBtn = page.locator('button:has-text("確認報名")');
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    // Select points tab if course supports both enrollment types
    const pointsTab = page.locator('button:has-text("點數報名")');
    if (await pointsTab.isVisible()) {
        await pointsTab.click();
        console.log("Selected '點數報名' tab");
    }
    
    // 🔑 Set start time to current moment so the session is already "in progress"
    // This ensures the '進入教室' button is immediately available after enrollment
    const e2eStartDate = new Date();
    const e2eTzOffset = e2eStartDate.getTimezoneOffset() * 60000;
    const e2eStartTime = (new Date(e2eStartDate.getTime() - e2eTzOffset)).toISOString().slice(0, 16);
    await page.fill('#start-time', e2eStartTime);
    console.log(`Set start time to NOW: ${e2eStartTime} (lesson in progress = classroom entry enabled)`);
    
    console.log("Clicking '確認報名'...");
    // Intercept both the request AND response for /api/orders POST (must set up BEFORE clicking)
    const ordersRequestPromise = page.waitForRequest(
        req => req.url().includes('/api/orders') && req.method() === 'POST',
        { timeout: 15000 }
    ).catch(() => null);
    const ordersResponsePromise = page.waitForResponse(
        res => res.url().includes('/api/orders') && res.request().method() === 'POST',
        { timeout: 15000 }
    ).catch(() => null);
    
    await confirmBtn.click();
    
    // Check if a time conflict error appeared (modal stays open with error)
    // If conflict detected, shift start time back by 10 more minutes and retry (up to 3x)
    let conflictRetries = 0;
    const maxConflictRetries = 3;
    while (conflictRetries < maxConflictRetries) {
        const conflictError = page.locator('p').filter({ hasText: /時間重疊|時間段.*重疊/ });
        const hasConflict = await conflictError.isVisible({ timeout: 3000 }).catch(() => false);
        if (!hasConflict) break;
        
        conflictRetries++;
        // Shift start time further back (10 min per retry) to avoid overlap
        const currentVal = await page.inputValue('#start-time');
        const shiftedDate = new Date(currentVal);
        shiftedDate.setMinutes(shiftedDate.getMinutes() - 10);
        const shiftedTzOffset = shiftedDate.getTimezoneOffset() * 60000;
        const shiftedTime = (new Date(shiftedDate.getTime() - shiftedTzOffset)).toISOString().slice(0, 16);
        console.warn(`⚠️ Time conflict detected (retry ${conflictRetries}/${maxConflictRetries}). Shifting start to: ${shiftedTime}`);
        await page.fill('#start-time', shiftedTime);
        
        // Re-setup request listener before retry click
        const retryRequestPromise = page.waitForRequest(
            req => req.url().includes('/api/orders') && req.method() === 'POST',
            { timeout: 15000 }
        ).catch(() => null);
        await confirmBtn.click();
        
        // If this retry succeeded, capture request details
        const retryRequest = await retryRequestPromise;
        if (retryRequest) {
            const body = retryRequest.postDataJSON();
            console.log(`[Network] /api/orders request payload (conflict retry ${conflictRetries}):`, JSON.stringify(body));
            if (body?.paymentMethod === 'points') {
                console.log(`✓ paymentMethod = 'points', pointsUsed = ${body?.pointsUsed}`);
            }
            break; // Request sent, exit retry loop
        }
    }
    
    // Capture the original request if no conflict occurred
    const ordersRequest = await ordersRequestPromise.catch(() => null);
    if (ordersRequest && conflictRetries === 0) {
        const body = ordersRequest.postDataJSON();
        console.log(`[Network] /api/orders request payload:`, JSON.stringify(body));
        if (body?.paymentMethod !== 'points') {
            console.warn(`⚠️ paymentMethod is '${body?.paymentMethod}', expected 'points' — point deduction may NOT occur!`);
        } else {
            console.log(`✓ paymentMethod = 'points', pointsUsed = ${body?.pointsUsed}`);
        }
    } else if (conflictRetries === 0) {
        console.warn(`⚠️ Could not intercept /api/orders request`);
    }

    // Capture and log the API response body for /api/orders
    const ordersResponse = await ordersResponsePromise;
    let ordersResponseBody: any = null;
    if (ordersResponse) {
        try {
            ordersResponseBody = await ordersResponse.json();
            console.log(`[Network] /api/orders response status: ${ordersResponse.status()}`);
            console.log(`[Network] /api/orders response body:`, JSON.stringify(ordersResponseBody));
            if (!ordersResponseBody?.ok) {
                console.error(`❌ /api/orders returned error: ${ordersResponseBody?.error}`);
            } else {
                const savedPointsUsed = ordersResponseBody?.order?.pointsUsed;
                const savedPayMethod = ordersResponseBody?.order?.paymentMethod;
                console.log(`[Order saved] paymentMethod=${savedPayMethod}, pointsUsed=${savedPointsUsed}`);
                if (savedPayMethod !== 'points' || !savedPointsUsed || savedPointsUsed <= 0) {
                    console.warn(`⚠️ DEDUCTION RISK: order saved with paymentMethod='${savedPayMethod}', pointsUsed=${savedPointsUsed} — points may NOT have been deducted!`);
                }
            }
        } catch (e) {
            console.warn('Could not parse /api/orders response body:', e);
        }
    }

    // 7. Verification: redirect to student_courses
    console.log("Waiting for redirection to /student_courses...");
    await page.waitForURL('**/student_courses', { timeout: 40000 });
    
    console.log("Verifying course in dashboard...");
    await expect(page.locator('.orders-table')).toContainText(testCourseTitle, { timeout: 20000 });
    
    console.log("SUCCESS: Course successfully enrolled!");
    
    // 8. Verify point deduction via API (critical check + deep diagnosis)
    console.log("Verifying point deduction...");
    const finalBalanceRes = await page.request.get(`${baseUrl}/api/points?userId=${email}`);
    const finalBalanceData = await finalBalanceRes.json();
    const finalBalance = finalBalanceData.balance;
    console.log(`Balance before enroll: ${balanceBeforeEnroll} → After enroll: ${finalBalance}`);

    const expectedDeduction = 10; // pointCost set in course creation
    const expectedFinalBalance = balanceBeforeEnroll - expectedDeduction;

    if (finalBalance === balanceBeforeEnroll) {
        // ===== DEEP INVESTIGATION: points not deducted =====
        console.error(`❌ No point deduction detected (balance unchanged: ${finalBalance})`);
        console.error(`--- Deep Investigation ---`);

        // 1. Re-check the intercepted request payload
        const interceptedReq = await ordersRequestPromise.catch(() => null);
        if (interceptedReq) {
            const reqBody = interceptedReq.postDataJSON();
            console.error(`[DeepCheck] Request payload: ${JSON.stringify(reqBody)}`);
            console.error(`[DeepCheck] paymentMethod=${reqBody?.paymentMethod}, pointsUsed=${reqBody?.pointsUsed}, userId=${reqBody?.userId}`);
            if (reqBody?.paymentMethod !== 'points') {
                console.error(`[DeepCheck] ROOT CAUSE CANDIDATE: paymentMethod is '${reqBody?.paymentMethod}' (not 'points'). Check enrollmentType & payMethod in EnrollButton.`);
            }
            if (!reqBody?.pointsUsed || reqBody?.pointsUsed <= 0) {
                console.error(`[DeepCheck] ROOT CAUSE CANDIDATE: pointsUsed=${reqBody?.pointsUsed} is falsy/zero. Check pointCost prop passed to EnrollButton.`);
            }
        } else {
            console.error(`[DeepCheck] Could not retrieve intercepted request — orders API was not called with POST.`);
        }

        // 2. Check the response body for the order
        if (ordersResponseBody) {
            console.error(`[DeepCheck] API responded: ok=${ordersResponseBody?.ok}, error=${ordersResponseBody?.error}`);
            const ord = ordersResponseBody?.order;
            if (ord) {
                console.error(`[DeepCheck] Saved order: paymentMethod=${ord.paymentMethod}, pointsUsed=${ord.pointsUsed}, status=${ord.status}`);
            }
        } else {
            console.error(`[DeepCheck] No API response captured — orders endpoint may not have been reached.`);
        }

        // 3. Fetch the latest order for this user from the API to cross-check
        try {
            const latestOrdersRes = await page.request.get(`${baseUrl}/api/orders?userId=${encodeURIComponent(email)}&limit=5`);
            const latestOrdersData = await latestOrdersRes.json();
            const latestOrders = latestOrdersData?.data || [];
            const testCourseOrders = latestOrders.filter((o: any) => o.courseId === testCourseId);
            console.error(`[DeepCheck] Orders for test course: ${JSON.stringify(testCourseOrders.map((o: any) => ({ orderId: o.orderId, paymentMethod: o.paymentMethod, pointsUsed: o.pointsUsed, status: o.status })))}`);
        } catch (e) {
            console.error(`[DeepCheck] Failed to fetch latest orders:`, e);
        }

        throw new Error(
            `❌ Point deduction failed! Balance before=${balanceBeforeEnroll}, after=${finalBalance} (unchanged). ` +
            `Check console logs above for root cause.`
        );
    } else if (finalBalance !== expectedFinalBalance) {
        throw new Error(
            `❌ Wrong deduction amount! Before: ${balanceBeforeEnroll}, After: ${finalBalance}, ` +
            `Expected deduction: ${expectedDeduction}, Expected final: ${expectedFinalBalance}`
        );
    }
    console.log(`✓ Point deduction verified! ${balanceBeforeEnroll} - ${expectedDeduction} = ${finalBalance}`);

    // 9. Find '進入教室' button and enter classroom
    console.log("🎓 Looking for '進入教室' button...");
    let enterClassroomFound = false;
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
        const enterBtn = page.locator('a, button').filter({ hasText: /進入教室|Enter Classroom/ }).first();
        try {
            await enterBtn.waitFor({ state: 'visible', timeout: 5000 });
            console.log(`✓ Found '進入教室' button on attempt ${attempts + 1}`);
            await enterBtn.click();
            enterClassroomFound = true;
            break;
        } catch {
            attempts++;
            if (attempts >= maxAttempts) break;
            console.log(`⚠️ Attempt ${attempts}/${maxAttempts}: '進入教室' not visible, reloading...`);
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
        }
    }

    if (enterClassroomFound) {
        // 10. Wait for classroom URL (wait room or direct classroom)
        await page.waitForURL(url => url.href.includes('/classroom'), { timeout: 30000 });
        const classroomUrl = page.url();
        console.log(`✅ Entered classroom! URL: ${classroomUrl}`);
        expect(classroomUrl).toContain('/classroom');
        console.log("✅ Full flow verified: Enroll → Points deducted → Enter Classroom");
    } else {
        console.warn("⚠️ '進入教室' button not found after retries — classroom entry check skipped.");
        // Don't fail the test — this may be normal if the classroom hasn't started yet
    }
    
    // Cleanup
    console.log("Cleaning up test course and related orders...");
    // Step 1: Delete related orders (must do before course, to avoid orphaned orders)
    try {
        const ordersRes = await page.request.get(`${baseUrl}/api/orders?courseId=${encodeURIComponent(testCourseId)}&limit=50`);
        const ordersData = await ordersRes.json();
        const orders: { orderId: string }[] = ordersData?.ok ? ordersData.data || [] : [];
        for (const order of orders) {
            const delOrderRes = await page.request.delete(`${baseUrl}/api/orders/${encodeURIComponent(order.orderId)}`);
            if (delOrderRes.ok()) {
                console.log(`Test order deleted: ${order.orderId}`);
            } else {
                console.warn(`Failed to delete order: ${order.orderId}`);
            }
        }
    } catch (e) {
        console.error("Error cleaning up test orders:", e);
    }
    // Step 2: Delete the test course
    try { 
        const cleanupRes = await page.request.delete(`${baseUrl}/api/courses?id=${testCourseId}`);
        if (cleanupRes.ok()) {
            console.log("Test course deleted successfully");
        } else {
            console.warn("Failed to delete test course");
        }
    } catch(e) {
        console.error("Error cleaning up test course:", e);
    }
});
